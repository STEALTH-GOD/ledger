// Persistence + import/export for the web version (Supabase + Vercel).
//
// Saving works on a persistent QUEUE OF CHANGES, not by re-uploading the whole ledger:
//   • every add / edit / delete is one small operation, so a stale phone or tab can never delete
//     rows it doesn't know about;
//   • operations are kept in localStorage until Supabase confirms them, so a reload, a dropped
//     connection or a killed mobile tab loses nothing;
//   • a rejected row is isolated and reported; it can't block the rest.
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { validYmd } from "./util.js";

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Auth (email + password) ─────────────────────────────
// onAuthChange fires once immediately with the current session (or null), then on every change.
export const onAuthChange = (cb) => {
  const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
};
export const signIn = (email, password) => sb.auth.signInWithPassword({ email, password });
export const signUp = (email, password) => sb.auth.signUp({ email, password });
export const signOut = () => sb.auth.signOut();

// ── Row mapping (app camelCase ↔ table snake_case) ──────
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const accToRow = (a) => ({ id: a.id, name: a.name, currency: a.currency || "NPR", opening: r2(a.opening), created_at: a.createdAt });
const rowToAcc = (r) => ({ id: r.id, name: r.name, currency: r.currency, opening: Number(r.opening), createdAt: r.created_at });
const txToRow = (t) => ({ id: t.id, account_id: t.accountId, type: t.type, amount: r2(t.amount), description: t.description, date: t.date, created_at: t.createdAt });
const rowToTx = (r) => ({ id: r.id, accountId: r.account_id, type: r.type, amount: Number(r.amount), description: r.description, date: r.date, createdAt: r.created_at });

// ── Load (paged: the API returns at most ~1000 rows per request) ──
async function fetchAll(table) {
  const out = [];
  for (;;) {
    const { data, error } = await sb.from(table).select("*").order("id").range(out.length, out.length + 999);
    if (error) throw error;
    if (!data || data.length === 0) break; // keep going until an empty page, whatever the server's cap is
    out.push(...data);
  }
  return out;
}

// Replays not-yet-saved changes on top of what the server returned.
function applyOps(base, ops) {
  const accs = new Map(base.accounts.map((a) => [a.id, a]));
  const txs = new Map(base.transactions.map((t) => [t.id, t]));
  for (const o of ops) {
    if (o.t === "acc") {
      if (o.k === "up") accs.set(o.row.id, o.row);
      else { accs.delete(o.id); for (const [id, t] of txs) if (t.accountId === o.id) txs.delete(id); }
    } else if (o.k === "up") txs.set(o.row.id, o.row);
    else txs.delete(o.id);
  }
  return { accounts: [...accs.values()], transactions: [...txs.values()] };
}

export async function loadData() {
  const [a, t] = await Promise.all([fetchAll("accounts"), fetchAll("transactions")]);
  return applyOps({ accounts: a.map(rowToAcc), transactions: t.map(rowToTx) }, queue);
}

// ── Write queue ─────────────────────────────────────────
// op = { t: "acc" | "tx", k: "up" | "del", row?: appObject, id?: string, solo?: true }
let queue = [];
let userKey = null, listener = () => {};
let ready = false, flushing = false, retrying = false, retryReason = "", lastError = "";
let retryMs = 2000, retryTimer = null, soonTimer = null, seq = 0;

const qKey = () => `ledger:pending:${userKey}`;
const persist = () => { try { localStorage.setItem(qKey(), JSON.stringify(queue)); } catch {} };
const emit = () => listener({
  pending: queue.length, saving: flushing, retrying, reason: retryReason, error: lastError,
  offline: typeof navigator !== "undefined" && navigator.onLine === false,
});

const onOnline = () => { retryMs = 2000; flush(); };
const onBeforeUnload = (e) => { if (queue.length) { e.preventDefault(); e.returnValue = ""; } };

export function initSync(userId, onStatus) {
  disposeSync();
  userKey = userId; listener = onStatus || (() => {});
  try { const q = JSON.parse(localStorage.getItem(qKey()) || "[]"); queue = Array.isArray(q) ? q : []; } catch { queue = []; }
  ready = false; retrying = false; retryReason = ""; lastError = ""; retryMs = 2000;
  emit();
}

// Call once the first load has finished, so old pending changes can't race the load.
export function startSync() {
  ready = true;
  window.addEventListener("online", onOnline);
  window.addEventListener("beforeunload", onBeforeUnload);
  emit();
  flush();
}

export function disposeSync() {
  ready = false;
  clearTimeout(retryTimer); clearTimeout(soonTimer);
  window.removeEventListener("online", onOnline);
  window.removeEventListener("beforeunload", onBeforeUnload);
}

export const mutationSeq = () => seq;
export const dismissError = () => { lastError = ""; emit(); };
export const retryNow = () => { retryMs = 2000; clearTimeout(retryTimer); return flush(); };

export function enqueue(ops) {
  if (!ops.length) return;
  queue.push(...ops); seq++;
  persist(); emit();
  clearTimeout(soonTimer);
  soonTimer = setTimeout(flush, 250); // small delay so rapid actions go out as one request
}

const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// Consecutive operations of the same kind on the same table go out as one request.
function takeRun() {
  const head = queue[0];
  if (head.solo) return [head];
  const run = [head];
  for (let i = 1; i < queue.length; i++) {
    const o = queue[i];
    if (o.solo || o.t !== head.t || o.k !== head.k) break;
    run.push(o);
  }
  return run;
}

async function execRun(run) {
  const { t, k } = run[0];
  const table = t === "acc" ? "accounts" : "transactions";
  try {
    if (k === "up") {
      const byId = new Map(run.map((o) => [o.row.id, o.row]));
      const rows = [...byId.values()].map(t === "acc" ? accToRow : txToRow);
      for (const part of chunks(rows, 500)) {
        const res = await sb.from(table).upsert(part);
        if (res.error) return res;
      }
    } else {
      for (const part of chunks([...new Set(run.map((o) => o.id))], 200)) {
        const res = await sb.from(table).delete().in("id", part);
        if (res.error) return res;
      }
    }
    return null;
  } catch (e) {
    return { error: { message: e?.message || "Network error" }, status: 0 };
  }
}

// Worth retrying (offline, server hiccup, expired token) vs. a real rejection (bad data).
const isTransient = (res) => {
  const e = res.error || {}, st = res.status || 0;
  return !e.code || st === 408 || st === 429 || st >= 500 || e.code === "PGRST301" || e.code === "PGRST303";
};
const describe = (res) => [res.error?.message, res.error?.details].filter(Boolean).join(" — ") || "Unknown error";

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(flush, retryMs);
  retryMs = Math.min(retryMs * 2, 30000);
}

export async function flush() {
  if (!ready || flushing || queue.length === 0) return;
  clearTimeout(retryTimer);
  flushing = true; emit();
  try {
    while (queue.length) {
      const run = takeRun();
      const res = await execRun(run);
      if (!res) {                       // success
        queue.splice(0, run.length); persist();
        retrying = false; retryReason = ""; retryMs = 2000; emit();
        continue;
      }
      if (isTransient(res)) {           // keep everything, try again later
        retrying = true; retryReason = describe(res); scheduleRetry();
        break;
      }
      if (run.length > 1) {             // one bad row inside a batch: retry rows one at a time
        run.forEach((o) => { o.solo = true; }); persist();
        continue;
      }
      queue.splice(0, 1); persist();    // a single row the database rejects: drop it and say so
      retrying = false; lastError = describe(res); emit();
    }
  } catch (e) {
    retrying = true; retryReason = e?.message || "Network error"; scheduleRetry();
  } finally {
    flushing = false; emit();
  }
}

// ── Excel export / import ───────────────────────────────
const HEADERS = ["Date", "Account", "Description", "Credit", "Debit", "Balance"];

export async function exportXlsx({ rows, defaultName }) {
  const wsData = [HEADERS, ...rows.map((r) => [r.date, r.account, r.description, r.credit || 0, r.debit || 0, r.balance])];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
  XLSX.writeFile(wb, defaultName);
  return `Downloaded ${rows.length} rows → ${defaultName}`;
}

// No JS PDF dependency in the web build yet.
export async function exportPdf() {
  return "ERROR: PDF export isn't available in the web version yet.";
}

const MAX_FILE_BYTES = 10 * 1024 * 1024, MAX_ROWS = 20000;

// Resolves { rows, invalid } — or null if the user cancelled the file picker.
export function importXlsx() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xls,.xlsx";
    input.oncancel = () => resolve(null);
    input.onchange = () => {
      const f = input.files[0];
      if (!f) { resolve(null); return; }
      if (f.size > MAX_FILE_BYTES) { reject(new Error("File is larger than 10 MB")); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Couldn't read the file"));
      reader.onload = () => {
        try {
          const wb = XLSX.read(reader.result, { type: "array" });
          const sheetName = wb.SheetNames[0];
          // raw:true → numbers stay numbers (no "1,234.50" display strings) and date cells arrive as
          // Excel serial numbers, which we convert ourselves with no timezone involved.
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true });
          if (rows.length > MAX_ROWS) throw new Error(`Too many rows (limit ${MAX_ROWS.toLocaleString()})`);
          resolve(parseRows(rows, sheetName));
        } catch (e) {
          reject(new Error(e?.message || "This doesn't look like a valid Excel file"));
        }
      };
      reader.readAsArrayBuffer(f);
    };
    input.click();
  });
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// → "YYYY-MM-DD" or null. Slash/dash dates with a leading day are read day-first (DD-MM-YYYY),
// matching the legacy Account Manager files.
function parseDate(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? validYmd(p.y, p.m, p.d) : null;
  }
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))) return validYmd(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) return validYmd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/,]*(\d{2}|\d{4})$/))) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    return mon ? validYmd(m[3].length === 2 ? 2000 + +m[3] : +m[3], mon, +m[1]) : null;
  }
  return null;
}

// → number rounded to 2dp (blank = 0), or undefined when it isn't a number at all.
function parseAmount(v) {
  if (v === undefined || v === null || String(v).trim() === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) && Math.abs(v) < 1e13 ? r2(v) : undefined;
  let s = String(v).trim().replace(/[\s,]/g, "").replace(/^(rs\.?|npr|inr|₹)/i, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || Math.abs(n) >= 1e13) return undefined;
  return neg ? -r2(n) : r2(n);
}

// Legacy .xls (Account Manager) is flagged by a leading "#" header column; account = sheet name,
// columns [#, Date, Description, Debit, Credit]. Otherwise the export layout:
// Date, Account, Description, Credit, Debit, Balance.
const legacyHeader = (r) => r && r.length > 0 && String(r[0]).trim().toLowerCase() === "#";
const isBlank = (c) => c === undefined || c === null || String(c).trim() === "";

export function parseRows(rows, sheetName) {
  const out = [], invalid = [];
  const isLegacy = legacyHeader(rows[0]);
  rows.slice(1).forEach((r, i) => {
    const row = i + 2; // spreadsheet row number
    if (!r || r.every(isBlank)) return;
    let date, account, description, credit, debit;
    if (isLegacy) {
      [, date, description, debit, credit] = r;
      account = sheetName;
      if (isBlank(description)) return; // Total / Balance / footer rows
    } else {
      [date, account, description, credit, debit] = r;
    }
    account = String(account ?? "").trim();
    const desc = String(description ?? "").trim();
    if (!account || !desc) { invalid.push({ row, reason: "missing account or description" }); return; }

    const c = parseAmount(credit), d = parseAmount(debit);
    if (c === undefined || d === undefined) { invalid.push({ row, reason: "amount isn't a number" }); return; }
    if (c < 0 || d < 0) { invalid.push({ row, reason: "negative amount" }); return; }
    if (c > 0 && d > 0) { invalid.push({ row, reason: "has both credit and debit" }); return; }
    if (c === 0 && d === 0) { invalid.push({ row, reason: "no amount" }); return; }

    const iso = parseDate(date);
    if (!iso) { invalid.push({ row, reason: "unreadable date" }); return; }

    out.push({ account, date: iso, description: desc, type: c > 0 ? "credit" : "debit", amount: c > 0 ? c : d });
  });
  return { rows: out, invalid };
}