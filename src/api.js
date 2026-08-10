// Persistence bridge.
//

const K = "ledge:v1";

// Resolves true  → pywebview API is available, use SQLite bridge
// Resolves false → browser dev mode, use localStorage
const _bridgeReady = new Promise((resolve) => {
  // Fast path: already injected (very rare, harmless to check)
  if (window.pywebview?.api) {
    resolve(true);
    return;
  }
  // Normal path: wait for the event pywebview fires when its JS bridge is ready
  window.addEventListener("pywebviewready", () => resolve(true), { once: true });

  // Timeout fallback: in `npm run dev` (no Python), pywebviewready never fires.
  // 800 ms is plenty for pywebview to boot; in browser it just means localStorage.
  setTimeout(() => resolve(!!window.pywebview?.api), 800);
});

async function getApi() {
  await _bridgeReady;
  return window.pywebview?.api ?? null;
}

export async function loadData() {
  const api = await getApi();
  if (api) return api.get_data();
  try { return localStorage.getItem(K); } catch { return null; }
}

export async function saveData(json) {
  const api = await getApi();
  if (api) {
    await api.set_data(json);
    return;
  }
  try { localStorage.setItem(K, json); } catch {}
}

import * as XLSX from "xlsx";

const HEADERS = ["Date", "Account", "Description", "Credit", "Debit", "Balance"];

// Packaged app: native dialog via Python. Browser dev: writes a real .xlsx via SheetJS.
export async function exportXlsx({ rows, defaultName }) {
  const api = await getApi();
  if (api) return api.export_xlsx(JSON.stringify({ rows, defaultName }));

  const wsData = [HEADERS, ...rows.map((r) => [r.date, r.account, r.desc, r.credit || 0, r.debit || 0, r.balance])];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");
  XLSX.writeFile(wb, defaultName);
  return `Downloaded ${rows.length} rows → ${defaultName}`;
}

export async function exportPdf({ rows, summary, single, defaultName }) {
  const api = await getApi();
  if (api) return api.export_pdf(JSON.stringify({ rows, summary, single, defaultName }));
  // ponytail: no SheetJS-style fallback — no JS PDF dep in browser dev.
  return "ERROR: PDF export needs the desktop app (no PDF in browser dev).";
}

// Packaged app: native dialog. Browser dev: file input, reads real .xlsx via SheetJS.
export async function importXlsx() {
  const api = await getApi();
  // pywebview JSON-parses return values already — never re-parse.
  if (api) return (await api.import_xlsx()) || [];

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
          const ws = wb.Sheets[wb.SheetNames[0]];
          const sheetName = wb.SheetNames[0];
          const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
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

// Mirrors xlsx.py. Legacy .xls (Account Manager) is flagged by a leading "#" header
// column; account = sheet name, columns are [#, Date, Description, Debit, Credit],
// dates DD-MM-YYYY. Otherwise the export layout: Date, Account, Description, Credit, Debit, Balance.
const legacyHeader = (r) => r && r.length > 0 && String(r[0]).trim().toLowerCase() === "#";
const fixDate = (s) => { /* DD-MM-YYYY → YYYY-MM-DD */ if (!s) return ""; const m = String(s).trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : String(s).substring(0, 10); };

function parseRows(rows, sheetName) {
  const out = [];
  const isLegacy = legacyHeader(rows[0]);
  for (const r of rows.slice(1)) {
    if (!r || r.length === 0) continue;
    if (isLegacy) {
      const [, date, desc, debit, credit] = r;
      if (!desc) continue; // Total / Balance / footer rows
      const d = parseFloat(debit) || 0, c = parseFloat(credit) || 0;
      if (c <= 0 && d <= 0) continue;
      out.push({
        account: String(sheetName || "").trim(),
        date: fixDate(date),
        desc: String(desc).trim(),
        type: c > 0 ? "credit" : "debit",
        amount: c > 0 ? c : d,
      });
      continue;
    }
    const [date, account, desc, credit, debit] = r;
    if (!account || !desc) continue;
    const c = parseFloat(credit) || 0, d = parseFloat(debit) || 0;
    if (c <= 0 && d <= 0) continue;
    out.push({
      account: String(account).trim(),
      date: String(date || "").substring(0, 10),
      desc: String(desc).trim(),
      type: c > 0 ? "credit" : "debit",
      amount: c > 0 ? c : d,
    });
  }
  return out;
}