import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import {
  Plus, Trash2, ArrowUpRight, ArrowDownLeft, LayoutDashboard, BarChart2,
  BookOpen, ChevronLeft, ChevronRight, X, Wallet, AlertTriangle, Download, Upload, Pencil, FileSpreadsheet, FileText, Search, LogOut, Menu,
} from "lucide-react";
import { loadData, initSync, startSync, disposeSync, enqueue, flush, retryNow, dismissError, mutationSeq, exportXlsx, exportPdf, importXlsx, onAuthChange, signIn, signUp, signOut } from "./api.js";
import { toC, fromC, todayStr, isValidYmd, fmtDate, parseMoney } from "./util.js";
import { C, T, SP, FONT, FONT_IMPORT_URL, ACCENT_COLORS, fmtNum } from "./theme.js";

// Code-split: recharts + lucide-heavy chart view loaded only when Charts is opened.
const ChartsView = lazy(() => import("./views/Charts.jsx"));

const RS = "Rs. ";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

// True below the tablet breakpoint; updates live on rotate / resize.
function useIsMobile(bp = 768) {
  const q = `(max-width: ${bp}px)`;
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

// Shared button base (font inherited, no background) so focus ring + font are consistent everywhere.
const resetBtn = {
  background: "none",
  border: "none",
  padding: 0,
  fontFamily: "inherit",
  fontSize: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
};

// A quiet caption used above form fields and table columns — sentence case, no tracking.
const captionStyle = { display: "block", fontSize: 11.5, color: C.textSecondary, marginBottom: 5 };

// Three figures laid out as a single ruled line (a ledger's own summary/footing convention)
// instead of three identical boxed cards. Divided by a hairline, not a background or a shadow.
function StatStrip({ items, isMobile }) {
  return (
    <div style={{
      display: "flex", flexDirection: isMobile ? "column" : "row",
      border: `1px solid ${C.border}`, borderTop: `2px solid ${C.textPrimary}`,
    }}>
      {items.map((s, i) => (
        <div key={i} style={{
          flex: 1, minWidth: 0, padding: `${SP.lg}px ${SP.cardPad.md}px`,
          borderRight: !isMobile && i < items.length - 1 ? `1px solid ${C.border}` : "none",
          borderBottom: isMobile && i < items.length - 1 ? `1px solid ${C.border}` : "none",
        }}>
          <div style={{ fontSize: 11.5, color: C.textSecondary, marginBottom: SP.sm }}>{s.label}</div>
          <div style={{ fontFamily: FONT.display, fontSize: 23, color: s.color, fontWeight: 600 }}>
            {s.pre}{RS}{fmtNum(s.val)}
          </div>
        </div>
      ))}
    </div>
  );
}

// Sequential focus (CSS, not CSS-in-JS) for global focus-visible rings.
const globalCss = `
@import url('${FONT_IMPORT_URL}');

* { box-sizing: border-box; }

/* Money + table digits align in columns — zero jitter when figures change. */
body { font-variant-numeric: tabular-nums; font-family: ${FONT.body}; }
html, body, #root { height: 100%; }
body { margin: 0; }
:focus-visible {
  outline: 2px solid ${C.accent};
  outline-offset: 2px;
}
input::placeholder {
  color: ${C.placeholder};
}
input:focus {
  border-color: ${C.accent};
}

/* ── Press feedback on solid actions ── */
.press { transition: transform 0.08s ease-out, background-color 0.12s ease-out, filter 0.12s ease-out; }
.press:active { transform: scale(0.98); }
.press:hover:not(:disabled) { filter: brightness(1.06); }
.press:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }

/* ── Ghost icon buttons (back, close, per-row trash) ── */
.iconbtn { transition: transform 0.08s ease-out, background-color 0.14s ease-out; }
.iconbtn:hover { background-color: rgba(36,31,23,0.07); }
.iconbtn:active { transform: scale(0.9); }
.iconbtn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── Account row — a ruled line, brass rule reveals on hover (not a card lift) ── */
.acc-row {
  border-left: 3px solid transparent;
  transition: border-color 0.15s ease-out, background-color 0.15s ease-out;
}
.acc-row:hover { border-left-color: ${C.accent}; background-color: ${C.hoverRow}; }

/* ── Skeleton pulse ── */
.skel { background: ${C.border}; border-radius: 3px; animation: skelPulse 1.2s ease-in-out infinite; }
@keyframes skelPulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .skel { animation: none; }
}

/* ── Cloth-cover sidebar rail ── */
.snav {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  font-size: 13px;
  color: ${C.sidebarText};
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background-color 0.12s ease-out, color 0.12s ease-out;
}
.snav:hover { background-color: ${C.sidebarHover}; }
.snav:not(.snav-active):hover { color: ${C.sidebarActiveText}; }
.snav-active { background-color: ${C.sidebarActiveBg}; color: ${C.sidebarActiveText}; }
.snav-active:hover { background-color: ${C.sidebarActiveBg}; }
.snav:focus-visible, .scta:focus-visible { outline-color: ${C.ringOnDark}; }

.snav-scroll { scrollbar-width: thin; scrollbar-color: ${C.sidebarBorder} transparent; }
.snav-scroll::-webkit-scrollbar { width: 8px; }
.snav-scroll::-webkit-scrollbar-thumb { background: ${C.sidebarBorder}; border-radius: 4px; }
.snav-scroll::-webkit-scrollbar-track { background: transparent; }

.scta {
  width: 100%;
  padding: 9px;
  background: ${C.accent};
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  transition: background-color 0.12s ease-out;
}
.scta:hover { background-color: ${C.accentHover}; }
.scta:active { transform: scale(0.98); }

/* ── Modal entry motion ── */
.overlay { animation: ovfade 0.18s ease-out; }
.overlay::before {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(19,15,10,0.5);
  animation: ovbackdrop 0.2s ease-out;
}
.dialog-pop { position: relative; animation: ovpop 0.22s cubic-bezier(0.16, 1, 0.3, 1); }

@keyframes ovfade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ovbackdrop { from { opacity: 0; } to { opacity: 1; } }
@keyframes ovpop {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .overlay, .overlay::before, .dialog-pop { animation: none; }
}

/* ── View/content transition: quick fade+rise on switch ── */
@keyframes viewIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.view-in { animation: viewIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
@media (prefers-reduced-motion: reduce) {
  .view-in { animation: none; }
}

/* ── Sibling stagger for account rows / stat cards ── */
.stagger > * { animation: viewIn 0.24s cubic-bezier(0.16, 1, 0.3, 1) backwards; animation-delay: calc(var(--i, 0) * 45ms); }
@media (prefers-reduced-motion: reduce) {
  .stagger > * { animation: none; }
  .acc-row { transition: none !important; }
}

/* ── Mobile ── */
button { touch-action: manipulation; }
.nav-drawer { transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s linear 0.22s; }
.nav-drawer.open { transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0s; }
@media (prefers-reduced-motion: reduce) { .nav-drawer, .nav-drawer.open { transition: none; } }
@media (max-width: 768px) {
  input, select, textarea { font-size: 16px !important; } /* stops iOS zooming on focus */
  .iconbtn { min-width: 40px; min-height: 40px; justify-content: center; }
  .press { min-height: 40px; }
  .snav { padding: 12px 10px; font-size: 14px; }
  .scta { padding: 12px; font-size: 13px; }
}
`;

function Ledger({ userId, email, onSignOut }) {
  const [data, setData] = useState({ accounts: [], transactions: [] });
  const [view, setView] = useState("dashboard");
  const [activeId, setActiveId] = useState(null);
  const [panel, setPanel] = useState(null); // "add-tx" | "add-acc" | "confirm-del" | "export" | "import-acc" | "rename-acc"
  const [exportScope, setExportScope] = useState("all"); // "all" | account id — captured before opening chooser
  const [importRows, setImportRows] = useState(null);   // parsed rows awaiting account-name dialog
  const [importName, setImportName] = useState("");
  const [editTx, setEditTx] = useState(null); // transaction being edited, null = new entry
  const [txForm, setTxForm] = useState({ type: "credit", amount: "", description: "", date: todayStr() });
  const [accForm, setAccForm] = useState({ name: "", opening: "" });
  const [accQuery, setAccQuery] = useState("");
  const [rename, setRename] = useState(null); // { id, name } — account being renamed
  const [confirmId, setConfirmId] = useState(null);
  const [confirmTx, setConfirmTx] = useState(null); // transaction pending deletion confirm
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  const pad = isMobile ? SP.lg : SP.pagePad; // page gutter
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [sync, setSync] = useState({ pending: 0, saving: false, retrying: false, reason: "", error: "", offline: false });
  const panelRef = useRef(null);
  const panelOpenRef = useRef(false);
  panelOpenRef.current = !!panel;

  // Load once per user, then start the background writer. Changes left unsaved by a previous visit are
  // restored by loadData() and delivered by startSync().
  useEffect(() => {
    let alive = true;
    setLoadError("");
    initSync(userId, (st) => { if (alive) setSync(st); });
    (async () => {
      try {
        const d = await loadData();
        if (!alive) return;
        setData(d); setLoaded(true); startSync();
      } catch (e) {
        console.error("Load failed", e);
        if (alive) setLoadError(e?.message || String(e));
      }
    })();
    return () => { alive = false; disposeSync(); };
  }, [userId, reloadKey]);

  // Several devices: when you return to the tab, push anything pending and pull other devices' changes.
  useEffect(() => {
    if (!loaded) return;
    let last = Date.now();
    const refresh = async () => {
      if (document.visibilityState !== "visible" || panelOpenRef.current) return;
      if (Date.now() - last < 10000) return;
      last = Date.now();
      try {
        await flush();
        const mark = mutationSeq();
        const d = await loadData();
        if (mutationSeq() === mark) setData(d); // skip if you changed something while it was loading
      } catch {}
    };
    const onVis = () => { if (document.visibilityState === "hidden") flush(); else refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", refresh); };
  }, [loaded]);

  // If the database rejects a change, resync so the screen shows what was really saved.
  useEffect(() => {
    if (!sync.error || !loaded) return;
    (async () => {
      try { const mark = mutationSeq(); const d = await loadData(); if (mutationSeq() === mark) setData(d); } catch {}
    })();
  }, [sync.error, loaded]);

  // Focus first field, trap Tab within the dialog, ESC to close.
  useEffect(() => {
    if (!panel) return;
    const initial =
      panel === "add-acc" ? "acc-name"
      : panel === "add-tx" ? "tx-amount"
      : panel === "export" ? "export-pdf"
      : panel === "import-acc" ? "import-name"
      : panel === "rename-acc" ? "rename-name"
      : "confirm-cancel";
    document.getElementById(initial)?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { setPanel(null); setErr(""); setConfirmId(null); setConfirmTx(null); setEditTx(null); setImportRows(null); setImportName(""); setRename(null); }
      if (e.key !== "Tab") return;
      const node = panelRef.current;
      if (!node) return;
      const focusables = node.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !node.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (active === last || !node.contains(active))) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, activeId]);

  // Auto-dismiss the export/import toast after ~3s.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), Math.max(3000, notice.length * 70));
    return () => clearTimeout(t);
  }, [notice]);

  // Mobile drawer: close on any navigation / dialog, and on Escape.
  useEffect(() => { setNavOpen(false); }, [view, activeId, panel, isMobile]);
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setNavOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  const activeAcc = useMemo(() => data.accounts.find((a) => a.id === activeId), [data.accounts, activeId]);

  // The open account was deleted on another device → go back to the dashboard.
  useEffect(() => { if (loaded && view === "account" && !activeAcc) setView("dashboard"); }, [loaded, view, activeAcc]);

  const stats = useMemo(() => data.accounts.map((acc) => {
    const txs = data.transactions.filter((t) => t.accountId === acc.id);
    const credit = txs.filter((t) => t.type === "credit").reduce((s, t) => s + toC(t.amount), 0);
    const debit = txs.filter((t) => t.type === "debit").reduce((s, t) => s + toC(t.amount), 0);
    return { ...acc, credit: fromC(credit), debit: fromC(debit), balance: fromC(toC(acc.opening) + credit - debit), count: txs.length };
  }), [data]);

  const filteredStats = useMemo(() => {
    const q = accQuery.trim().toLowerCase();
    if (!q) return stats;
    return stats.filter((a) => a.name.toLowerCase().includes(q));
  }, [stats, accQuery]);

  const totals = useMemo(() => ({
    credit: fromC(stats.reduce((s, a) => s + toC(a.credit), 0)),
    debit: fromC(stats.reduce((s, a) => s + toC(a.debit), 0)),
    balance: fromC(stats.reduce((s, a) => s + toC(a.balance), 0)),
  }), [stats]);

  const accTxs = useMemo(() => {
    if (!activeId) return [];
    return data.transactions
      .filter((t) => t.accountId === activeId)
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (new Date(a.createdAt) - new Date(b.createdAt) || 0));
  }, [data.transactions, activeId]);

  const txsWithBalance = useMemo(() => {
    let bal = toC(activeAcc?.opening);
    return accTxs.map((tx) => {
      bal += tx.type === "credit" ? toC(tx.amount) : -toC(tx.amount);
      return { ...tx, runBal: fromC(bal) };
    });
  }, [accTxs, activeAcc]);

  const chartData = useMemo(() => {
    const map = {};
    data.transactions.forEach((t) => {
      const [y, m] = (t.date || "").split("-").map(Number);
      if (!y || !m) return;
      const key = `${y}-${String(m - 1).padStart(2, "0")}`;
      if (!map[key]) map[key] = { name: MONTHS[m - 1], year: y, credit: 0, debit: 0 };
      map[key][t.type] += toC(t.amount);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-7)
      .map(([, v]) => ({ ...v, credit: fromC(v.credit), debit: fromC(v.debit) }));
  }, [data.transactions]);

  const openAcc = (id) => { setActiveId(id); setView("account"); setPanel(null); };

  const closePanel = () => { setPanel(null); setErr(""); setConfirmId(null); setConfirmTx(null); setEditTx(null); setImportRows(null); setImportName(""); setRename(null); };

  const doAddAcc = () => {
    const name = accForm.name.trim();
    if (!name) { setErr("Account name is required"); return; }
    if (name.length > 100) { setErr("Account name is too long (100 characters max)"); return; }
    const opening = parseMoney(accForm.opening, { negative: true, empty: 0 });
    if (opening === null) { setErr("Opening balance must be a number with at most 2 decimals"); return; }
    const acc = { id: uid(), name, currency: "NPR", opening, createdAt: new Date().toISOString() };
    setData((d) => ({ ...d, accounts: [...d.accounts, acc] }));
    enqueue([{ t: "acc", k: "up", row: acc }]);
    setAccForm({ name: "", opening: "" });
    setErr(""); setPanel(null);
    openAcc(acc.id);
  };

  const doAddTx = () => {
    const amount = parseMoney(txForm.amount);
    if (amount === null) { setErr(String(txForm.amount ?? "").trim() === "" ? "Enter an amount (0 is allowed)" : "Amount must be a number with at most 2 decimals"); return; }
    const description = txForm.description.trim();
    if (!description) { setErr("Description is required"); return; }
    if (description.length > 500) { setErr("Description is too long (500 characters max)"); return; }
    if (!isValidYmd(txForm.date)) { setErr("Pick a valid date"); return; }
    if (editTx) {
      const cur = data.transactions.find((t) => t.id === editTx.id) || editTx;
      const updated = { ...cur, type: txForm.type, amount, description, date: txForm.date };
      setData((d) => ({ ...d, transactions: d.transactions.map((t) => (t.id === updated.id ? updated : t)) }));
      enqueue([{ t: "tx", k: "up", row: updated }]);
    } else {
      const tx = { id: uid(), accountId: activeId, type: txForm.type, amount, description, date: txForm.date, createdAt: new Date().toISOString() };
      setData((d) => ({ ...d, transactions: [...d.transactions, tx] }));
      enqueue([{ t: "tx", k: "up", row: tx }]);
    }
    setTxForm({ type: "credit", amount: "", description: "", date: todayStr() });
    setEditTx(null);
    setErr(""); setPanel(null);
  };

  const requestDeleteTx = (tx) => { setConfirmTx(tx); setErr(""); setPanel("confirm-del-tx"); };

  const doConfirmDeleteTx = () => {
    if (confirmTx) {
      setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== confirmTx.id) }));
      enqueue([{ t: "tx", k: "del", id: confirmTx.id }]);
    }
    closePanel();
  };

  // ── Excel export / import ─────────────────────────────
  // All-accounts export rows: per-account running balance across a date-sorted flat list.
  const exportRows = useMemo(() => {
    const bal = {};
    data.accounts.forEach((a) => { bal[a.id] = toC(a.opening); });
    const name = new Map(data.accounts.map((a) => [a.id, a.name]));
    return [...data.transactions]
      .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.createdAt || "").localeCompare(b.createdAt || ""))
      .map((t) => {
        bal[t.accountId] = (bal[t.accountId] ?? 0) + (t.type === "credit" ? toC(t.amount) : -toC(t.amount));
        return {
          date: t.date,
          account: name.get(t.accountId) || "",
          description: t.description,
          credit: t.type === "credit" ? t.amount : 0,
          debit: t.type === "debit" ? t.amount : 0,
          balance: fromC(bal[t.accountId]),
        };
      });
  }, [data]);

  const fmtMoney = (n) => `${n < 0 ? "-" : ""}${RS}${fmtNum(n)}`;

  // Shared per-export data: flat rows (xlsx numbers) + display mirror (pdf strings)
  // + one-line summary (grand totals for "all", this account's for a single account).
  const buildExportPayload = (scope) => {
    const single = scope !== "all";
    const rows = scope === "all"
      ? exportRows
      : txsWithBalance.map((tx) => ({
          date: tx.date,
          account: activeAcc?.name || "",
          description: tx.description,
          credit: tx.type === "credit" ? tx.amount : 0,
          debit: tx.type === "debit" ? tx.amount : 0,
          balance: tx.runBal,
        }));
    // PDF rows: money as display strings (fpdf2 calls .encode() on cells), "" for empty side.
    const pdfRows = rows.map((r) => ({
      date: r.date,
      account: r.account,
      description: r.description,
      credit: r.credit ? fmtMoney(r.credit) : "",
      debit: r.debit ? fmtMoney(r.debit) : "",
      balance: fmtMoney(r.balance),
    }));
    const sum = scope === "all" ? totals : stats.find((a) => a.id === scope);
    const summary = sum
      ? { credit: fmtMoney(sum.credit), debit: fmtMoney(sum.debit), balance: fmtMoney(sum.balance) }
      : null;
    return { rows, pdfRows, summary, single };
  };

  // shared export runner: builds payload + file name, calls the api fn, toasts result.
  const runExport = async (scope, fmt) => {
    const { rows, pdfRows, summary, single } = buildExportPayload(scope);
    const base = (activeAcc?.name || "account").replace(/[^\w]+/g, "-").toLowerCase();
    const file = scope === "all"
      ? `ledger-${todayStr()}.${fmt === "pdf" ? "pdf" : "xlsx"}`
      : `ledger-${base}-${todayStr()}.${fmt === "pdf" ? "pdf" : "xlsx"}`;
    setNotice(fmt === "pdf" ? "Exporting PDF…" : "Exporting…");
    try {
      const msg = fmt === "pdf"
        ? await exportPdf({ rows: pdfRows, summary, single, defaultName: file })
        : await exportXlsx({ rows, defaultName: file });
      setNotice(msg && msg.startsWith("ERROR:") ? msg : (msg || "Exported"));
    } catch (e) { setNotice(`Export failed: ${e?.message || e}`); }
  };

  const openExport = (scope) => { setExportScope(scope); setErr(""); setPanel("export"); };

  // Import: every row goes to the account named in its own Account column (created if missing).
  // Legacy .xls rows already carry the sheet name as their account. Bad rows are reported, never guessed.
  const doImport = async () => {
    let res;
    try { res = await importXlsx(); }
    catch (e) { setNotice(`Import failed: ${e?.message || e}`); return; }
    if (!res) return; // file picker cancelled
    const { rows, invalid } = res;
    if (rows.length === 0 && invalid.length === 0) { setNotice("Nothing to import"); return; }

    const nameKey = (x) => (x || "").trim().toLowerCase();
    const byKey = new Map(data.accounts.map((a) => [nameKey(a.name), a]));
    const sig = (accId, r) => `${accId}|${r.date}|${r.description}|${r.type}|${toC(r.amount)}`;
    const existing = new Set(data.transactions.map((t) => sig(t.accountId, t)));
    const newAccs = [], imported = [];
    let skipped = 0;

    for (const r of rows) {
      const key = nameKey(r.account);
      let acc = byKey.get(key);
      if (!acc) {
        acc = { id: uid(), name: r.account.trim(), currency: "NPR", opening: 0, createdAt: new Date().toISOString() };
        byKey.set(key, acc); newAccs.push(acc);
      }
      if (existing.has(sig(acc.id, r))) { skipped++; continue; }
      imported.push({ id: uid(), accountId: acc.id, type: r.type, amount: r.amount, description: r.description, date: r.date, createdAt: new Date().toISOString() });
    }

    if (newAccs.length || imported.length) {
      setData((d) => ({ accounts: [...d.accounts, ...newAccs], transactions: [...d.transactions, ...imported] }));
      enqueue([...newAccs.map((row) => ({ t: "acc", k: "up", row })), ...imported.map((row) => ({ t: "tx", k: "up", row }))]);
    }

    const parts = [`${imported.length} imported`];
    if (skipped) parts.push(`${skipped} duplicate${skipped !== 1 ? "s" : ""} skipped`);
    if (newAccs.length) parts.push(`${newAccs.length} account${newAccs.length !== 1 ? "s" : ""} created`);
    if (invalid.length) {
      const shown = invalid.slice(0, 3).map((x) => `row ${x.row}: ${x.reason}`).join("; ");
      parts.push(`${invalid.length} invalid row${invalid.length !== 1 ? "s" : ""} ignored (${shown}${invalid.length > 3 ? "; …" : ""})`);
    }
    setNotice(parts.join(", "));
  };

  const requestDeleteAcc = (id) => { setConfirmId(id); setErr(""); setPanel("confirm-del"); };

  const requestRenameAcc = (id) => {
    const acc = data.accounts.find((a) => a.id === id);
    if (!acc) return;
    setErr("");
    setRename({ id, name: acc.name });
    setPanel("rename-acc");
  };

  const doRenameAcc = () => {
    const target = (rename?.name || "").trim();
    if (!target) { setErr("Account name is required"); return; }
    const clash = data.accounts.some(
      (a) => a.id !== rename.id && a.name.trim().toLowerCase() === target.toLowerCase());
    if (clash) { setErr("An account with this name already exists"); return; }
    const cur = data.accounts.find((a) => a.id === rename.id);
    if (!cur) { closePanel(); return; }
    const updated = { ...cur, name: target };
    setData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === rename.id ? updated : a)) }));
    enqueue([{ t: "acc", k: "up", row: updated }]);
    setRename(null); setErr(""); setPanel(null);
  };

  // Called from the confirm dialog's "Delete" action.
  const doConfirmDeleteAcc = () => {
    enqueue([{ t: "acc", k: "del", id: confirmId }]); // the database also removes its entries (ON DELETE CASCADE)
    setData((d) => ({
      accounts: d.accounts.filter((a) => a.id !== confirmId),
      transactions: d.transactions.filter((t) => t.accountId !== confirmId),
    }));
    setView("dashboard"); setActiveId(null); closePanel();
  };

  const openPanel = (type, txType = "credit") => {
    setErr(""); setEditTx(null);
    if (type === "add-tx") setTxForm((f) => ({ ...f, type: txType, amount: "", description: "" }));
    setPanel(type);
  };

  const openEditTx = (tx) => {
    setErr(""); setEditTx(tx);
    setTxForm({ type: tx.type, amount: String(tx.amount), description: tx.description, date: tx.date });
    setPanel("add-tx");
  };

  if (loadError && !loaded) return (
    <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT.body, padding: SP.lg }}>
      <style>{globalCss}</style>
      <div role="alert" style={{ background: C.card, borderTop: `3px solid ${C.debit}`, padding: 28, width: 380, maxWidth: "100%", boxShadow: C.shadowModal, textAlign: "center" }}>
        <div style={{ width: 48, height: 48, background: C.debitBg, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <AlertTriangle size={22} color={C.debit} />
        </div>
        <div style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600, color: C.textPrimary }}>Couldn't load your ledger</div>
        <p style={{ fontSize: T.body, color: C.textSecondary, margin: "8px 0 20px", overflowWrap: "anywhere" }}>{loadError}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onSignOut} className="press"
            style={{ flex: 1, padding: 11, background: C.bg, color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>Sign out</button>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="press"
            style={{ flex: 1, padding: 11, background: C.accent, color: "#fff", border: "none", borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>Try again</button>
        </div>
      </div>
    </div>
  );

  if (!loaded) return (
    <div style={{ display: "flex", height: "100dvh", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT.body }}>
      <style>{globalCss}</style>
      <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="skel" style={{ height: 16, width: "55%" }} />
        <div className="skel" style={{ height: 14 }} />
        <div className="skel" style={{ height: 14 }} />
        <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
          Loading ledger
        </span>
      </div>
    </div>
  );

  const activeStat = stats.find((a) => a.id === activeId);
  const syncText = sync.error ? "A change couldn't be saved"
    : sync.saving ? "Saving…"
    : sync.pending > 0 ? `${sync.pending} unsaved change${sync.pending !== 1 ? "s" : ""}`
    : "All changes saved";
  const syncWarn = !!sync.error || (sync.pending > 0 && !sync.saving);
  const confirmAcc = data.accounts.find((a) => a.id === confirmId);
  const confirmTxCount = confirmAcc ? data.transactions.filter((t) => t.accountId === confirmAcc.id).length : 0;

  return (
    <div style={{ display: "flex", height: "100dvh", fontFamily: FONT.body, background: C.bg, overflow: "hidden", position: "relative" }}>
      <style>{globalCss}</style>

      {/* ── Sidebar ── */}
      {isMobile && navOpen && (
        <div onClick={() => setNavOpen(false)} aria-hidden="true"
          style={{ position: "fixed", inset: 0, background: "rgba(19,15,10,0.5)", zIndex: 140 }} />
      )}
      <aside aria-label="Primary" id="primary-nav" className={isMobile ? "nav-drawer" + (navOpen ? " open" : "") : undefined}
        style={{ width: isMobile ? "min(280px, 85vw)" : 220, background: C.sidebar, display: "flex", flexDirection: "column", flexShrink: 0, borderRight: `1px solid ${C.sidebarBorder}`,
          ...(isMobile ? { position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 150, transform: navOpen ? "translateX(0)" : "translateX(-100%)", visibility: navOpen ? "visible" : "hidden" } : {}) }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${C.sidebarBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, background: C.accent, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <BookOpen size={15} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: FONT.display, color: "#F2EDDF", fontSize: 15, fontWeight: 600 }}>Ledger Book</div>
              <div style={{ color: C.sidebarLabel, fontSize: 11, marginTop: 1 }}>Personal ledger</div>
            </div>
          </div>
        </div>

        <nav className="snav-scroll" style={{ flex: 1, padding: "8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }} aria-label="Navigation">
          {[
            { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={14} strokeWidth={1.8} /> },
            { id: "charts", label: "Charts", icon: <BarChart2 size={14} strokeWidth={1.8} /> },
          ].map((n) => (
            <button key={n.id} type="button" onClick={() => { setView(n.id); setPanel(null); }}
              className={"snav" + (view === n.id ? " snav-active" : "")}>
              {n.icon}{n.label}
            </button>
          ))}

          {data.accounts.length > 0 && (
            <div style={{ padding: "12px 10px 6px", fontSize: 11, color: C.sidebarLabel, fontWeight: 600 }}>Accounts</div>
          )}
          {data.accounts.map((acc, i) => {
            const active = view === "account" && activeId === acc.id;
            return (
              <button key={acc.id} type="button" onClick={() => openAcc(acc.id)}
                className={"snav" + (active ? " snav-active" : "")}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", background: ACCENT_COLORS[i % ACCENT_COLORS.length] + "30", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: ACCENT_COLORS[i % ACCENT_COLORS.length], fontWeight: 700, flexShrink: 0 }}>
                  {acc.name.charAt(0).toUpperCase()}
                </div>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.name}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "12px 14px 16px", borderTop: `1px solid ${C.sidebarBorder}`, display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" className="scta" onClick={() => { openPanel("add-acc"); setView("dashboard"); }}>
            <Plus size={13} /> New account
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => openExport("all")} aria-label="Export all accounts"
              className="press" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", background: "rgba(255,255,255,0.06)", color: C.sidebarText, border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <Download size={13} /> Export
            </button>
            <button type="button" onClick={() => { setNavOpen(false); doImport(); }} aria-label="Import from Excel"
              className="press" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", background: "rgba(255,255,255,0.06)", color: C.sidebarText, border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <Upload size={13} /> Import
            </button>
          </div>
          <div style={{ marginTop: 6, paddingTop: 10, borderTop: `1px solid ${C.sidebarBorder}` }}>
            <div title={email} style={{ fontSize: 11, color: C.sidebarLabel, padding: "0 10px 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>
            <div aria-live="polite" style={{ fontSize: 11, padding: "0 10px 6px", color: syncWarn ? C.ringOnDark : C.sidebarLabel }}>{syncText}</div>
            <button type="button" onClick={onSignOut} className="snav">
              <LogOut size={14} strokeWidth={1.8} /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, minWidth: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {isMobile && (
          <div style={{ position: "sticky", top: 0, zIndex: 50, flexShrink: 0, display: "flex", alignItems: "center", gap: SP.sm, padding: `${SP.sm}px ${SP.md}px`, background: C.card, borderBottom: `1px solid ${C.border}` }}>
            <button type="button" onClick={() => setNavOpen(true)} aria-label="Open menu" aria-expanded={navOpen} aria-controls="primary-nav" className="iconbtn"
              style={{ ...resetBtn, padding: 6, borderRadius: 4 }}>
              <Menu size={20} color={C.textPrimary} />
            </button>
            <div style={{ width: 24, height: 24, background: C.accent, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <BookOpen size={13} color="#fff" />
            </div>
            <div style={{ fontFamily: FONT.display, fontSize: 15, fontWeight: 600, color: C.textPrimary }}>Ledger Book</div>
            <div aria-live="polite" style={{ marginLeft: "auto", fontSize: 11, color: syncWarn ? C.debit : C.textSecondary }}>{syncText}</div>
          </div>
        )}
        {(sync.error || (sync.retrying && sync.pending > 0)) && (
          <div role="alert" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: SP.md, flexWrap: "wrap", padding: `${SP.sm}px ${pad}px`, background: C.debitBg, color: C.debit, borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
            <span style={{ overflowWrap: "anywhere" }}>
              {sync.error
                ? `A change couldn't be saved and was skipped: ${sync.error}`
                : `${sync.pending} change${sync.pending !== 1 ? "s" : ""} not saved yet${sync.offline ? ", you're offline" : ""}. Kept on this device and retrying…`}
            </span>
            <button type="button" onClick={sync.error ? dismissError : retryNow} className="press"
              style={{ ...resetBtn, fontWeight: 600, textDecoration: "underline", color: C.debit }}>
              {sync.error ? "Dismiss" : "Retry now"}
            </button>
          </div>
        )}

        {/* Dashboard */}
        {view === "dashboard" && (
          <div className="view-in" style={{ padding: `${SP.xl}px ${pad}px`, flex: 1 }}>
            <div style={{ marginBottom: SP.xl }}>
              <h1 style={{ margin: 0, fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: C.textPrimary }}>Dashboard</h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textSecondary }}>{data.accounts.length} account{data.accounts.length !== 1 ? "s" : ""}, {data.transactions.length} transaction{data.transactions.length !== 1 ? "s" : ""} recorded</p>
            </div>

            {data.accounts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ width: 56, height: 56, background: C.accentBg, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Wallet size={24} color={C.accent} />
                </div>
                <div style={{ fontFamily: FONT.display, fontSize: 17, color: C.textPrimary, fontWeight: 600, marginBottom: 6 }}>No accounts yet</div>
                <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 20 }}>Create your first account to start tracking money</div>
                <button type="button" onClick={() => openPanel("add-acc")} className="press" style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 4, padding: "10px 22px", fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                  + New account
                </button>
              </div>
            ) : (
              <>
                {/* Summary — a single ruled line, the way a ledger totals its columns */}
                <div style={{ marginBottom: SP.sectionGap }}>
                  <StatStrip isMobile={isMobile} items={[
                    { label: "Total credit (in)", val: totals.credit, color: C.credit, pre: "+" },
                    { label: "Total debit (out)", val: totals.debit, color: C.debit, pre: "-" },
                    { label: "Net balance", val: Math.abs(totals.balance), color: totals.balance >= 0 ? C.credit : C.debit, pre: totals.balance < 0 ? "-" : "" },
                  ]} />
                </div>

                {/* Account List */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>All accounts</div>
                </div>
                <div style={{ position: "relative", marginBottom: SP.md }}>
                  <Search size={14} color={C.iconMuted} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <input
                    type="search"
                    value={accQuery}
                    onChange={(e) => setAccQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setAccQuery(""); }}
                    aria-label="Search accounts"
                    placeholder="Search accounts"
                    style={{ width: "100%", padding: "9px 12px 9px 32px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 13, color: C.textPrimary, background: C.inputBg, fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
                <div className="stagger" style={{ display: "flex", flexDirection: "column", border: filteredStats.length ? `1px solid ${C.border}` : "none" }}>
                  {filteredStats.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 0", border: `1px dashed ${C.border}`, fontSize: 13, color: C.textSecondary }}>
                      No accounts match
                    </div>
                  ) : (
                    filteredStats.map((acc, i) => (
                      <div key={acc.id} className="acc-row"
                        style={{ "--i": i, borderBottom: i < filteredStats.length - 1 ? `1px solid ${C.border}` : "none", padding: `${SP.md}px ${SP.cardPad.md}px`, width: "100%", display: "flex", alignItems: "center", gap: SP.md }}>
                        <button type="button" onClick={() => openAcc(acc.id)}
                          style={{ ...resetBtn, flex: 1, minWidth: 0, gap: SP.md, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap" }}>
                          <div style={{ width: 38, height: 38, borderRadius: "50%", background: ACCENT_COLORS[i % ACCENT_COLORS.length] + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: ACCENT_COLORS[i % ACCENT_COLORS.length], flexShrink: 0 }}>
                            {acc.name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acc.name}</div>
                            <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
                              {acc.count} entr{acc.count !== 1 ? "ies" : "y"}
                            </div>
                          </div>
                          <div style={isMobile ? { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" } : { textAlign: "right" }}>
                            <div style={{ fontFamily: FONT.display, fontSize: 16, fontWeight: 600, color: acc.balance >= 0 ? C.credit : C.debit }}>
                              {acc.balance < 0 ? "-" : ""}{RS}{fmtNum(acc.balance)}
                            </div>
                            <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}>
                              <span style={{ color: C.credit }}>+{fmtNum(acc.credit)}</span>
                              <span style={{ margin: "0 4px" }}>/</span>
                              <span style={{ color: C.debit }}>-{fmtNum(acc.debit)}</span>
                            </div>
                          </div>
                          {!isMobile && <ChevronRight size={15} color={C.iconMuted} />}
                        </button>
                        <button type="button" onClick={() => requestRenameAcc(acc.id)} aria-label={`Rename ${acc.name}`} className="iconbtn"
                          style={{ ...resetBtn, color: C.textSecondary, padding: 4, borderRadius: 4, flexShrink: 0 }}>
                          <Pencil size={15} color={C.iconMuted} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Account Detail */}
        {view === "account" && activeAcc && (
          <div className="view-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ padding: `${SP.xl}px ${pad}px 0`, background: C.card, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: isMobile ? SP.md : 0, marginBottom: SP.lg }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button type="button" onClick={() => setView("dashboard")} aria-label="Back to dashboard" className="iconbtn"
                    style={{ ...resetBtn, color: C.textSecondary, padding: 4, borderRadius: 4 }}>
                    <ChevronLeft size={18} />
                  </button>
                  <div>
                    <h1 style={{ margin: 0, fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: C.textPrimary }}>{activeAcc.name}</h1>
                    <div style={{ fontSize: 12, color: C.textSecondary }}>{activeStat?.count ?? 0} entr{activeStat?.count === 1 ? "y" : "ies"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => openPanel("add-tx", "credit")} className="press"
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", ...(isMobile ? { flex: 1, justifyContent: "center" } : {}), background: C.credit, color: "#fff", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    <ArrowDownLeft size={13} /> Credit (in)
                  </button>
                  <button type="button" onClick={() => openPanel("add-tx", "debit")} className="press"
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", ...(isMobile ? { flex: 1, justifyContent: "center" } : {}), background: C.debit, color: "#fff", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    <ArrowUpRight size={13} /> Debit (out)
                  </button>
                  <button type="button" onClick={() => openExport(activeAcc.id)} aria-label={`Export ${activeAcc.name}`} className="iconbtn"
                    style={{ padding: "8px 10px", background: "none", border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", color: C.textSecondary, display: "flex" }}>
                    <Download size={13} />
                  </button>
                  <button type="button" onClick={() => requestDeleteAcc(activeAcc.id)} aria-label={`Delete ${activeAcc.name} account`} className="iconbtn"
                    style={{ padding: "8px 10px", background: "none", border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", color: C.debit, display: "flex" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div style={{ paddingBottom: SP.lg }}>
                <StatStrip isMobile={isMobile} items={[
                  { label: "Total credit", val: activeStat?.credit || 0, color: C.credit, pre: "" },
                  { label: "Total debit", val: activeStat?.debit || 0, color: C.debit, pre: "" },
                  { label: "Balance", val: activeStat?.balance || 0, color: (activeStat?.balance || 0) >= 0 ? C.credit : C.debit, pre: (activeStat?.balance || 0) < 0 ? "-" : "" },
                ]} />
              </div>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: `0 ${pad}px ${SP.xxl}px` }}>
              {txsWithBalance.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px 0", color: C.textSecondary }}>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>No transactions yet</div>
                  <div style={{ fontSize: 12 }}>Use the Credit / Debit buttons above to record entries</div>
                </div>
              ) : isMobile ? (
                <ul style={{ listStyle: "none", margin: `${SP.md}px 0 0`, padding: 0, display: "flex", flexDirection: "column" }}>
                  {txsWithBalance.map((tx, i) => (
                    <li key={tx.id} style={{ borderBottom: i < txsWithBalance.length - 1 ? `1px solid ${C.border}` : "none", padding: `${SP.md}px 4px` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SP.md }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, minWidth: 0, overflowWrap: "anywhere" }}>{tx.description}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: tx.type === "credit" ? C.credit : C.debit, flexShrink: 0 }}>
                          {tx.type === "credit" ? "+" : "-"}{fmtNum(tx.amount)}
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: SP.xs }}>
                        <div style={{ fontSize: 12, color: tx.runBal < 0 ? C.debit : C.textSecondary, display: "flex", gap: 8 }}>
                          <span>{fmtDate(tx.date)}</span>
                          <span>Bal {tx.runBal < 0 ? "Dr " : ""}{fmtNum(tx.runBal)}</span>
                        </div>
                        <div style={{ display: "flex", gap: 2, margin: "-8px -8px -8px 0" }}>
                          <button type="button" onClick={() => openEditTx(tx)} aria-label={`Edit transaction: ${tx.description}`} className="iconbtn"
                            style={{ ...resetBtn, color: C.iconGhost, padding: 4, borderRadius: 4 }}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" onClick={() => requestDeleteTx(tx)} aria-label={`Delete transaction: ${tx.description}`} className="iconbtn"
                            style={{ ...resetBtn, color: C.iconGhost, padding: 4, borderRadius: 4 }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.body, marginTop: SP.lg }}>
                  <thead>
                    <tr>
                      {[
                        { label: "Date", align: "left", w: "110px" },
                        { label: "Description", align: "left", w: "auto" },
                        { label: `Credit (${RS.trim()})`, align: "right", w: "130px" },
                        { label: `Debit (${RS.trim()})`, align: "right", w: "130px" },
                        { label: "Balance", align: "right", w: "130px" },
                        { label: "", align: "right", w: "64px" },
                      ].map((h, i) => (
                        <th key={i} style={{ padding: `${SP.feet.t}px 12px`, textAlign: h.align, fontSize: 12, color: C.textSecondary, borderBottom: `2px solid ${C.textPrimary}`, width: h.w, fontWeight: 600, whiteSpace: "nowrap" }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {txsWithBalance.map((tx, i) => (
                      <tr key={tx.id} style={{ background: i % 2 === 0 ? C.card : C.zebra }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = C.hoverRow)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? C.card : C.zebra)}>
                        <td style={{ padding: `${SP.feet.t}px 12px`, color: C.textSecondary, fontSize: 12, whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}` }}>
                          {fmtDate(tx.date)}
                        </td>
                        <td style={{ padding: `${SP.feet.t}px 12px`, color: C.textPrimary, borderBottom: `1px solid ${C.border}` }}>
                          {tx.description}
                        </td>
                        <td style={{ padding: `${SP.feet.t}px 12px`, textAlign: "right", color: C.credit, fontWeight: tx.type === "credit" ? 600 : 400, borderBottom: `1px solid ${C.border}` }}>
                          {tx.type === "credit" ? fmtNum(tx.amount) : <span style={{ color: C.border }}>—</span>}
                        </td>
                        <td style={{ padding: `${SP.feet.t}px 12px`, textAlign: "right", color: C.debit, fontWeight: tx.type === "debit" ? 600 : 400, borderBottom: `1px solid ${C.border}` }}>
                          {tx.type === "debit" ? fmtNum(tx.amount) : <span style={{ color: C.border }}>—</span>}
                        </td>
                        <td style={{ padding: `${SP.feet.t}px 12px`, textAlign: "right", fontWeight: 600, color: tx.runBal >= 0 ? C.textPrimary : C.debit, borderBottom: `1px solid ${C.border}` }}>
                          {tx.runBal < 0 && <span style={{ fontSize: 10, color: C.debit, marginRight: 3 }}>Dr</span>}
                          {fmtNum(tx.runBal)}
                        </td>
                        <td style={{ padding: `${SP.feet.t}px 8px`, textAlign: "right", borderBottom: `1px solid ${C.border}` }}>
                          <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                            <button type="button" onClick={() => openEditTx(tx)} aria-label={`Edit transaction: ${tx.description}`} className="iconbtn"
                              style={{ ...resetBtn, color: C.iconGhost, padding: 4, borderRadius: 4 }}>
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => requestDeleteTx(tx)} aria-label={`Delete transaction: ${tx.description}`} className="iconbtn"
                              style={{ ...resetBtn, color: C.iconGhost, padding: 4, borderRadius: 4 }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Charts */}
        {view === "charts" && (
          <Suspense fallback={
            <div className="view-in" style={{ padding: `${SP.xl}px ${pad}px`, flex: 1, color: C.textSecondary, fontSize: 13 }}>
              <h1 style={{ margin: 0, fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: C.textPrimary }}>Charts</h1>
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="skel" style={{ height: 14, width: "100%" }} />
                <div className="skel" style={{ height: 14, width: "85%" }} />
                <div className="skel" style={{ height: 14, width: "70%" }} />
              </div>
            </div>
          }>
            <ChartsView stats={stats} chartData={chartData} onOpenAcc={openAcc} />
          </Suspense>
        )}
      </main>

      {/* ── Side Panels (Overlay) ── */}
      {panel && (
        <div ref={panelRef} className="overlay" style={{ position: "fixed", inset: 0, background: "rgba(19,15,10,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={(e) => { if (e.target === e.currentTarget) closePanel(); }}>
          {/* add-tx */}
          {panel === "add-tx" && activeAcc && (
            <div role="dialog" aria-modal="true" aria-labelledby="addtx-title" className="dialog-pop"
              style={{ background: C.card, borderTop: `3px solid ${txForm.type === "credit" ? C.credit : C.debit}`, padding: 28, width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", boxShadow: C.shadowModal }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div id="addtx-title" style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600, color: C.textPrimary }}>{editTx ? "Edit entry" : "Add entry"} in {activeAcc.name}</div>
                <button type="button" onClick={closePanel} aria-label="Close" className="iconbtn" style={{ ...resetBtn, borderRadius: 4, padding: 3 }}>
                  <X size={17} color={C.textSecondary} />
                </button>
              </div>

              <div style={{ display: "flex", background: C.bg, borderRadius: 4, padding: 3, marginBottom: 20 }}>
                {[
                  { type: "credit", label: "Credit (money in)", icon: <ArrowDownLeft size={13} />, color: C.credit },
                  { type: "debit", label: "Debit (money out)", icon: <ArrowUpRight size={13} />, color: C.debit },
                ].map((t) => (
                  <button key={t.type} type="button" aria-pressed={txForm.type === t.type} onClick={() => setTxForm((f) => ({ ...f, type: t.type }))}
                    style={{ flex: 1, padding: "8px 6px", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 12, fontWeight: 600,
                      fontFamily: "inherit",
                      background: txForm.type === t.type ? (t.type === "credit" ? C.credit : C.debit) : "transparent",
                      color: txForm.type === t.type ? "#fff" : C.textSecondary,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "all 0.12s" }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {[
                { label: `Amount (${RS})`, key: "amount", type: "number", placeholder: "0.00", id: "tx-amount" },
                { label: "Description", key: "description", type: "text", placeholder: "What is this for?", id: "tx-desc" },
                { label: "Date", key: "date", type: "date", placeholder: "", id: "tx-date" },
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label htmlFor={f.id} style={captionStyle}>{f.label}</label>
                  <input id={f.id} type={f.type} placeholder={f.placeholder} value={txForm[f.key]}
                    onChange={(e) => setTxForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && doAddTx()}
                    style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: T.body, color: C.textPrimary, background: C.inputBg, boxSizing: "border-box", fontFamily: "inherit" }} />
                </div>
              ))}

              {err && <div style={{ color: C.debit, fontSize: 12, marginBottom: 12 }}>{err}</div>}

              <button type="button" onClick={doAddTx} className="press"
                style={{ width: "100%", padding: 11, background: txForm.type === "credit" ? C.credit : C.debit, color: "#fff", border: "none", borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                {editTx ? "Save changes" : `Add ${txForm.type === "credit" ? "credit" : "debit"} entry`}
              </button>
            </div>
          )}

          {/* add-acc */}
          {panel === "add-acc" && (
            <div role="dialog" aria-modal="true" aria-labelledby="addacc-title" className="dialog-pop"
              style={{ background: C.card, borderTop: `3px solid ${C.accent}`, padding: 28, width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", boxShadow: C.shadowModal }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div id="addacc-title" style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600, color: C.textPrimary }}>New account</div>
                <button type="button" onClick={closePanel} aria-label="Close" className="iconbtn" style={{ ...resetBtn, borderRadius: 4, padding: 3 }}>
                  <X size={17} color={C.textSecondary} />
                </button>
              </div>

              {[
                { label: "Account name", key: "name", type: "text", placeholder: "e.g. Cash, Savings, Business…", id: "acc-name" },
                { label: "Opening balance (optional)", key: "opening", type: "number", placeholder: "0.00", id: "acc-opening" },
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label htmlFor={f.id} style={captionStyle}>{f.label}</label>
                  <input id={f.id} type={f.type} placeholder={f.placeholder} value={accForm[f.key]}
                    onChange={(e) => setAccForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && doAddAcc()}
                    style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: T.body, color: C.textPrimary, background: C.inputBg, boxSizing: "border-box", fontFamily: "inherit" }} />
                </div>
              ))}

              {err && <div style={{ color: C.debit, fontSize: 12, marginBottom: 12 }}>{err}</div>}

              <button type="button" onClick={doAddAcc} className="press"
                style={{ width: "100%", padding: 11, background: C.accent, color: "#fff", border: "none", borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                Create account
              </button>
            </div>
          )}

          {/* rename-acc */}
          {panel === "rename-acc" && rename && (
            <div role="dialog" aria-modal="true" aria-labelledby="rename-acc-title" className="dialog-pop"
              style={{ background: C.card, borderTop: `3px solid ${C.accent}`, padding: 28, width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", boxShadow: C.shadowModal }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div id="rename-acc-title" style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600, color: C.textPrimary }}>Rename account</div>
                <button type="button" onClick={closePanel} aria-label="Close" className="iconbtn" style={{ ...resetBtn, borderRadius: 4, padding: 3 }}>
                  <X size={17} color={C.textSecondary} />
                </button>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label htmlFor="rename-name" style={captionStyle}>Account name</label>
                <input id="rename-name" type="text" placeholder="e.g. Cash, Savings, Business…" value={rename.name}
                  onChange={(e) => setRename((r) => ({ ...r, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && doRenameAcc()}
                  style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: T.body, color: C.textPrimary, background: C.inputBg, boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
              {err && <div style={{ color: C.debit, fontSize: 12, marginBottom: 12 }}>{err}</div>}
              <button type="button" onClick={doRenameAcc} id="rename-ok" className="press"
                style={{ width: "100%", padding: 11, background: C.accent, color: "#fff", border: "none", borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                Save
              </button>
            </div>
          )}

          {/* export — format chooser */}
          {panel === "export" && (
            <div role="dialog" aria-modal="true" aria-labelledby="export-title" className="dialog-pop"
              style={{ background: C.card, borderTop: `3px solid ${C.accent}`, padding: 28, width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", boxShadow: C.shadowModal }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div id="export-title" style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600, color: C.textPrimary }}>Export</div>
                <button type="button" onClick={closePanel} aria-label="Close" className="iconbtn" style={{ ...resetBtn, borderRadius: 4, padding: 3 }}>
                  <X size={17} color={C.textSecondary} />
                </button>
              </div>
              <p style={{ margin: "0 0 18px", fontSize: 13, color: C.textSecondary }}>
                {exportScope === "all"
                  ? "All accounts"
                  : `Account: ${data.accounts.find((a) => a.id === exportScope)?.name || ""}`}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button type="button" onClick={() => { runExport(exportScope, "xlsx"); closePanel(); }} id="export-xlsx" className="press"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: C.bg, color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <FileSpreadsheet size={18} color={C.accent} />
                  <span>Excel (.xlsx)</span>
                </button>
                <button type="button" onClick={() => { runExport(exportScope, "pdf"); closePanel(); }} id="export-pdf" className="press"
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: C.bg, color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                  <FileText size={18} color={C.debit} />
                  <span>PDF, print-ready report</span>
                </button>
              </div>
            </div>
          )}

          {/* confirm-del-tx */}
          {panel === "confirm-del-tx" && confirmTx && (
            <div role="alertdialog" aria-modal="true" aria-labelledby="confirmtx-title" aria-describedby="confirmtx-desc" className="dialog-pop"
              style={{ background: C.card, borderTop: `3px solid ${C.debit}`, padding: 28, width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", boxShadow: C.shadowModal, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, background: C.debitBg, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <AlertTriangle size={22} color={C.debit} />
              </div>
              <div id="confirmtx-title" style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600, color: C.textPrimary }}>Delete this entry?</div>
              <p id="confirmtx-desc" style={{ fontSize: T.body, color: C.textSecondary, margin: "8px 0 20px" }}>
                {confirmTx.description}, {RS}{fmtNum(confirmTx.amount)} on {fmtDate(confirmTx.date)}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={closePanel} id="confirm-cancel" className="press"
                  style={{ flex: 1, padding: 11, background: C.bg, color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                  Keep
                </button>
                <button type="button" onClick={doConfirmDeleteTx} id="confirm-ok" className="press"
                  style={{ flex: 1, padding: 11, background: C.debit, color: "#fff", border: "none", borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                  Delete
                </button>
              </div>
            </div>
          )}

          {/* confirm-del */}
          {panel === "confirm-del" && confirmAcc && (
            <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc" className="dialog-pop"
              style={{ background: C.card, borderTop: `3px solid ${C.debit}`, padding: 28, width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto", boxShadow: C.shadowModal, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, background: C.debitBg, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <AlertTriangle size={22} color={C.debit} />
              </div>
              <div id="confirm-title" style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600, color: C.textPrimary }}>Delete {confirmAcc.name}?</div>
              <p id="confirm-desc" style={{ fontSize: T.body, color: C.textSecondary, margin: "8px 0 20px" }}>
                This permanently removes the account and its {confirmTxCount} entr{confirmTxCount !== 1 ? "ies" : "y"} from the ledger.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={closePanel} id="confirm-cancel" className="press"
                  style={{ flex: 1, padding: 11, background: C.bg, color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                  Keep
                </button>
                <button type="button" onClick={doConfirmDeleteAcc} id="confirm-ok" className="press"
                  style={{ flex: 1, padding: 11, background: C.debit, color: "#fff", border: "none", borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Export/import toast */}
      {notice && (
        <div role="status" aria-live="polite" className="dialog-pop"
          style={{ position: "fixed", top: SP.lg, right: SP.lg, ...(isMobile ? { left: SP.lg } : {}), zIndex: 300, background: C.card, borderLeft: `3px solid ${C.accent}`, padding: "10px 16px", fontSize: 13, color: C.textPrimary, boxShadow: C.shadowModal }}>
          {notice}
        </div>
      )}
    </div>
  );
}

// ── Login ────────────────────────────────────────────────
function Login() {
  const [mode, setMode] = useState("in"); // "in" | "up"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: "", text: "" });

  const submit = async () => {
    if (!email.trim() || !password) { setMsg({ kind: "err", text: "Enter your email and password" }); return; }
    setBusy(true); setMsg({ kind: "", text: "" });
    try {
      const { data, error } = mode === "in"
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password);
      if (error) setMsg({ kind: "err", text: error.message });
      else if (mode === "up" && !data.session) setMsg({ kind: "ok", text: "Account created. Check your email to confirm it, then sign in." });
    } catch (e) {
      setMsg({ kind: "err", text: e?.message || "Something went wrong" });
    }
    setBusy(false);
  };

  const field = (label, id, type, value, set, auto) => (
    <div style={{ marginBottom: 14 }}>
      <label htmlFor={id} style={captionStyle}>{label}</label>
      <input id={id} type={type} value={value} autoComplete={auto}
        onChange={(e) => set(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 4, fontSize: T.body, color: C.textPrimary, background: C.inputBg, boxSizing: "border-box", fontFamily: "inherit" }} />
    </div>
  );

  return (
    <div style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT.body, padding: SP.lg }}>
      <style>{globalCss}</style>
      <div className="dialog-pop" style={{ background: C.card, borderTop: `3px solid ${C.accent}`, padding: 28, width: 380, maxWidth: "100%", boxShadow: C.shadowModal }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 32, height: 32, background: C.accent, borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontFamily: FONT.display, fontSize: 17, fontWeight: 600, color: C.textPrimary }}>Ledger Book</div>
            <div style={{ fontSize: 12, color: C.textSecondary }}>{mode === "in" ? "Sign in to your ledger" : "Create your account"}</div>
          </div>
        </div>

        {field("Email", "auth-email", "email", email, setEmail, "email")}
        {field("Password", "auth-password", "password", password, setPassword, mode === "in" ? "current-password" : "new-password")}

        {msg.text && (
          <div role={msg.kind === "err" ? "alert" : "status"} style={{ fontSize: 12, marginBottom: 12, color: msg.kind === "err" ? C.debit : C.credit }}>{msg.text}</div>
        )}

        <button type="button" onClick={submit} disabled={busy} className="press"
          style={{ width: "100%", padding: 11, background: C.accent, color: "#fff", border: "none", borderRadius: 4, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
        </button>

        <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg({ kind: "", text: "" }); }}
          style={{ ...resetBtn, justifyContent: "center", width: "100%", marginTop: 14, fontSize: 13, color: C.accent, fontWeight: 600 }}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

// ── Auth gate (default export, used by main.jsx) ─────────
export default function LedgerApp() {
  const [session, setSession] = useState(undefined); // undefined = still checking, null = signed out
  useEffect(() => onAuthChange(setSession), []);

  if (session === undefined) return (
    <div style={{ display: "flex", height: "100dvh", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT.body, color: C.textSecondary, fontSize: 13 }}>
      <style>{globalCss}</style>
      Loading…
    </div>
  );
  if (!session) return <Login />;
  // key = user id: switching accounts fully resets in-memory ledger state
  return <Ledger key={session.user.id} userId={session.user.id} email={session.user.email} onSignOut={signOut} />;
}