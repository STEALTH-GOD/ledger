// Persistence + import/export for the web version (Supabase + Vercel).
// Field names in the app match the table columns except for two camelCase → snake_case pairs
// (accountId → account_id, createdAt → created_at). `description` is the same everywhere.
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Never sync deletes unless the initial load succeeded. App.jsx swallows load errors and still
// starts saving, so without this a failed load would look like "user deleted everything".
let loadedOk = false;

const accToRow = (a) => ({ id: a.id, name: a.name, currency: a.currency || "NPR", opening: a.opening || 0, created_at: a.createdAt });
const rowToAcc = (r) => ({ id: r.id, name: r.name, currency: r.currency, opening: Number(r.opening), createdAt: r.created_at });
const txToRow = (t) => ({ id: t.id, account_id: t.accountId, type: t.type, amount: t.amount, description: t.description, date: t.date, created_at: t.createdAt });
const rowToTx = (r) => ({ id: r.id, accountId: r.account_id, type: r.type, amount: Number(r.amount), description: r.description, date: r.date, createdAt: r.created_at });

export async function loadData() {
  const [a, t] = await Promise.all([
    sb.from("accounts").select("*"),
    sb.from("transactions").select("*"),
  ]);
  if (a.error) throw a.error;
  if (t.error) throw t.error;
  loadedOk = true;
  return JSON.stringify({ accounts: a.data.map(rowToAcc), transactions: t.data.map(rowToTx) });
}

export async function saveData(json) {
  if (!loadedOk) throw new Error("Not saved — the initial load failed. Reload the page.");
  const { accounts, transactions } = JSON.parse(json);

  // accounts first (FK), then transactions
  let r = await sb.from("accounts").upsert(accounts.map(accToRow));
  if (r.error) throw r.error;
  r = await sb.from("transactions").upsert(transactions.map(txToRow));
  if (r.error) throw r.error;

  // rows deleted in the UI
  const keepTx = new Set(transactions.map((t) => t.id));
  const keepAcc = new Set(accounts.map((a) => a.id));
  const [dbTx, dbAcc] = await Promise.all([
    sb.from("transactions").select("id"),
    sb.from("accounts").select("id"),
  ]);
  if (dbTx.error) throw dbTx.error;
  if (dbAcc.error) throw dbAcc.error;
  const goneTx = dbTx.data.map((x) => x.id).filter((id) => !keepTx.has(id));
  const goneAcc = dbAcc.data.map((x) => x.id).filter((id) => !keepAcc.has(id));
  if (goneTx.length) { const d = await sb.from("transactions").delete().in("id", goneTx); if (d.error) throw d.error; }
  if (goneAcc.length) { const d = await sb.from("accounts").delete().in("id", goneAcc); if (d.error) throw d.error; }
}

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

export async function importXlsx() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xls,.xlsx";
    input.onchange = () => {
      const f = input.files[0];
      if (!f) { resolve([]); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const wb = XLSX.read(reader.result, { type: "array" });
          const sheetName = wb.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false });
          resolve(parseRows(rows, sheetName));
        } catch {
          resolve([]);
        }
      };
      reader.readAsArrayBuffer(f);
    };
    input.click();
  });
}

// Legacy .xls (Account Manager) is flagged by a leading "#" header column; account = sheet name,
// columns [#, Date, Description, Debit, Credit], dates DD-MM-YYYY. Otherwise the export layout:
// Date, Account, Description, Credit, Debit, Balance.
const legacyHeader = (r) => r && r.length > 0 && String(r[0]).trim().toLowerCase() === "#";
const fixDate = (s) => {
  if (!s) return "";
  const m = String(s).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : String(s).substring(0, 10);
};

function parseRows(rows, sheetName) {
  const out = [];
  const isLegacy = legacyHeader(rows[0]);
  for (const r of rows.slice(1)) {
    if (!r || r.length === 0) continue;
    if (isLegacy) {
      const [, date, description, debit, credit] = r;
      if (!description) continue; // Total / Balance / footer rows
      const d = parseFloat(debit) || 0, c = parseFloat(credit) || 0;
      if (c <= 0 && d <= 0) continue;
      out.push({
        account: String(sheetName || "").trim(),
        date: fixDate(date),
        description: String(description).trim(),
        type: c > 0 ? "credit" : "debit",
        amount: c > 0 ? c : d,
      });
      continue;
    }
    const [date, account, description, credit, debit] = r;
    if (!account || !description) continue;
    const c = parseFloat(credit) || 0, d = parseFloat(debit) || 0;
    if (c <= 0 && d <= 0) continue;
    out.push({
      account: String(account).trim(),
      date: String(date || "").substring(0, 10),
      description: String(description).trim(),
      type: c > 0 ? "credit" : "debit",
      amount: c > 0 ? c : d,
    });
  }
  return out;
}