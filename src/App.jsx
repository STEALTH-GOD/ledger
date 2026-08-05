import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import {
  Plus, Trash2, ArrowUpRight, ArrowDownLeft, LayoutDashboard, BarChart2,
  BookOpen, ChevronLeft, ChevronRight, X, Wallet, AlertTriangle, Download, Upload,
} from "lucide-react";
import { loadData, saveData, exportXlsx, importXlsx } from "./api.js";
import { C, T, SP, ACCENT_COLORS, fmtNum } from "./theme.js";

// Code-split: recharts + lucide-heavy chart view loaded only when Charts is opened.
const ChartsView = lazy(() => import("./views/Charts.jsx"));

const RS = "Rs. ";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
const todayStr = () => new Date().toISOString().split("T")[0];

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

// Sequential focus (CSS, not CSS-in-JS) for global focus-visible rings.
const globalCss = `
* { box-sizing: border-box; }

/* Money + table digits align in columns — zero jitter when figures change. */
body { font-variant-numeric: tabular-nums; }
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
.iconbtn:hover { background-color: rgba(26,23,20,0.06); }
.iconbtn:active { transform: scale(0.9); }
.iconbtn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ── Account row hover lift ── */
.acc-row {
  transition: border-color 0.15s ease-out, transform 0.15s ease-out, box-shadow 0.15s ease-out;
}
.acc-row:hover { border-color: ${C.borderStrong}; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.acc-row:active { transform: translateY(0); box-shadow: none; }

/* ── Skeleton pulse ── */
.skel { background: ${C.border}; border-radius: 4px; animation: skelPulse 1.2s ease-in-out infinite; }
@keyframes skelPulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .skel { animation: none; }
}

/* ── Dark sidebar rail ── */
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
  border-radius: 6px;
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
  border-radius: 7px;
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
  background: rgba(10,8,12,0.45);
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

/* ── Dashboard stat-card count-up lift ── */
.stat-card { transition: box-shadow 0.18s ease-out, transform 0.18s ease-out; }
.stat-card:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,0.07); }
.stat-card:active { transform: translateY(0); box-shadow: none; }

/* ── Sibling stagger for account rows / stat cards ── */
.stagger > * { animation: viewIn 0.24s cubic-bezier(0.16, 1, 0.3, 1) backwards; animation-delay: calc(var(--i, 0) * 45ms); }
@media (prefers-reduced-motion: reduce) {
  .stagger > * { animation: none; }
  .stat-card, .acc-row { transform: none !important; transition: none !important; }
}
`;

export default function LedgerApp() {
  const [data, setData] = useState({ accounts: [], transactions: [] });
  const [view, setView] = useState("dashboard");
  const [activeId, setActiveId] = useState(null);
  const [panel, setPanel] = useState(null); // "add-tx" | "add-acc" | "confirm-del"
  const [txForm, setTxForm] = useState({ type: "credit", amount: "", desc: "", date: todayStr() });
  const [accForm, setAccForm] = useState({ name: "", opening: "" });
  const [confirmId, setConfirmId] = useState(null);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const saveTimer = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await loadData();
        if (raw) setData(JSON.parse(raw));
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // Debounced save: fires ~500ms after last change, never on first load.
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveData(JSON.stringify(data)).catch(() => {});
    }, 500);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded]);

  // Focus first field, trap Tab within the dialog, ESC to close.
  useEffect(() => {
    if (!panel) return;
    const initial = panel === "add-acc" ? "acc-name" : panel === "add-tx" ? "tx-amount" : "confirm-cancel";
    document.getElementById(initial)?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { setPanel(null); setErr(""); setConfirmId(null); }
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
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const activeAcc = useMemo(() => data.accounts.find((a) => a.id === activeId), [data.accounts, activeId]);

  const stats = useMemo(() => data.accounts.map((acc) => {
    const txs = data.transactions.filter((t) => t.accountId === acc.id);
    const credit = txs.filter((t) => t.type === "credit").reduce((s, t) => s + t.amount, 0);
    const debit = txs.filter((t) => t.type === "debit").reduce((s, t) => s + t.amount, 0);
    const opening = acc.opening || 0;
    return { ...acc, credit, debit, balance: opening + credit - debit, count: txs.length };
  }), [data]);

  const totals = useMemo(() => ({
    credit: stats.reduce((s, a) => s + a.credit, 0),
    debit: stats.reduce((s, a) => s + a.debit, 0),
    balance: stats.reduce((s, a) => s + a.balance, 0),
  }), [stats]);

  const accTxs = useMemo(() => {
    if (!activeId) return [];
    return data.transactions
      .filter((t) => t.accountId === activeId)
      .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));
  }, [data.transactions, activeId]);

  const txsWithBalance = useMemo(() => {
    let bal = activeAcc?.opening || 0;
    return accTxs.map((tx) => {
      bal += tx.type === "credit" ? tx.amount : -tx.amount;
      return { ...tx, runBal: bal };
    });
  }, [accTxs, activeAcc]);

  const chartData = useMemo(() => {
    const map = {};
    data.transactions.forEach((t) => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!map[key]) map[key] = { name: MONTHS[d.getMonth()], year: d.getFullYear(), credit: 0, debit: 0 };
      map[key][t.type] += t.amount;
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(-7).map(([, v]) => v);
  }, [data.transactions]);

  const openAcc = (id) => { setActiveId(id); setView("account"); setPanel(null); };

  const closePanel = () => { setPanel(null); setErr(""); setConfirmId(null); };

  const doAddAcc = () => {
    const name = accForm.name.trim();
    if (!name) { setErr("Account name is required"); return; }
    const opening = parseFloat(accForm.opening) || 0;
    const acc = { id: uid(), name, currency: "NPR", opening, createdAt: new Date().toISOString() };
    setData((d) => ({ ...d, accounts: [...d.accounts, acc] }));
    setAccForm({ name: "", opening: "" });
    setErr(""); setPanel(null);
    openAcc(acc.id);
  };

  const doAddTx = () => {
    const amount = parseFloat(txForm.amount);
    if (!amount || amount <= 0) { setErr("Enter a valid amount"); return; }
    if (!txForm.desc.trim()) { setErr("Description is required"); return; }
    const tx = { id: uid(), accountId: activeId, type: txForm.type, amount, desc: txForm.desc.trim(), date: txForm.date, createdAt: new Date().toISOString() };
    setData((d) => ({ ...d, transactions: [...d.transactions, tx] }));
    setTxForm({ type: "credit", amount: "", desc: "", date: todayStr() });
    setErr(""); setPanel(null);
  };

  const doDeleteTx = (id) => setData((d) => ({ ...d, transactions: d.transactions.filter((t) => t.id !== id) }));

  // ── Excel export / import ─────────────────────────────
  // All-accounts export rows: per-account running balance across a date-sorted flat list.
  const exportRows = useMemo(() => {
    const bal = {};
    data.accounts.forEach((a) => { bal[a.id] = a.opening || 0; });
    const name = new Map(data.accounts.map((a) => [a.id, a.name]));
    return [...data.transactions]
      .sort((a, b) => new Date(a.date) - new Date(b.date) || (a.createdAt || "").localeCompare(b.createdAt || ""))
      .map((t) => {
        bal[t.accountId] += t.type === "credit" ? t.amount : -t.amount;
        return {
          date: t.date,
          account: name.get(t.accountId) || "",
          desc: t.desc,
          credit: t.type === "credit" ? t.amount : 0,
          debit: t.type === "debit" ? t.amount : 0,
          balance: Math.round(bal[t.accountId] * 100) / 100,
        };
      });
  }, [data]);

  const doExport = async (scope) => {
    const rows = scope === "all"
      ? exportRows
      : txsWithBalance.map((tx) => ({
          date: tx.date,
          account: activeAcc?.name || "",
          desc: tx.desc,
          credit: tx.type === "credit" ? tx.amount : 0,
          debit: tx.type === "debit" ? tx.amount : 0,
          balance: tx.runBal,
        }));
    const base = (activeAcc?.name || "account").replace(/[^\w]+/g, "-").toLowerCase();
    const file = scope === "all" ? `ledger-${todayStr()}.xlsx` : `ledger-${base}-${todayStr()}.xlsx`;
    setNotice("Exporting…");
    try {
      const msg = await exportXlsx({ rows, defaultName: file });
      setNotice(msg && msg.startsWith("ERROR:") ? msg : (msg || "Exported"));
          } catch (e) { setNotice(`Export failed: ${e?.message || e}`); }
  };

  const doImport = async () => {
    let rows;
    try { rows = await importXlsx(); }
    catch { setErr("Import failed"); return; }
    if (!rows || rows.length === 0) return;
    const nameKey = (s) => (s || "").trim().toLowerCase();
    const accs = [...data.accounts];
    const byKey = new Map(accs.map((a) => [nameKey(a.name), a]));
    const imported = [];
    let skipped = 0;
    rows.forEach((r) => {
      const accName = (r.account || "").trim();
      if (!accName) { skipped++; return; }
      let acc = byKey.get(nameKey(accName));
      if (!acc) {
        acc = { id: uid(), name: accName, currency: "NPR", opening: 0, createdAt: new Date().toISOString() };
        accs.push(acc);
        byKey.set(nameKey(accName), acc);
      }
      const dup = data.transactions.some((t) =>
        t.accountId === acc.id && t.date === r.date && t.desc === r.desc && t.amount === r.amount);
      if (dup) { skipped++; return; }
      imported.push({ id: uid(), accountId: acc.id, type: r.type, amount: r.amount, desc: r.desc, date: r.date, createdAt: new Date().toISOString() });
    });
    setData({ accounts: accs, transactions: [...data.transactions, ...imported] });
    setNotice(`${imported.length} imported, ${skipped} skipped`);
  };

  const requestDeleteAcc = (id) => { setConfirmId(id); setErr(""); setPanel("confirm-del"); };

  // Called from the confirm dialog's "Delete" action.
  const doConfirmDeleteAcc = () => {
    setData((d) => ({
      accounts: d.accounts.filter((a) => a.id !== confirmId),
      transactions: d.transactions.filter((t) => t.accountId !== confirmId),
    }));
    setView("dashboard"); setActiveId(null); closePanel();
  };

  const openPanel = (type, txType = "credit") => {
    setErr("");
    if (type === "add-tx") setTxForm((f) => ({ ...f, type: txType, amount: "", desc: "" }));
    setPanel(type);
  };

  if (!loaded) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
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
  const confirmAcc = data.accounts.find((a) => a.id === confirmId);
  const confirmTxCount = confirmAcc ? data.transactions.filter((t) => t.accountId === confirmAcc.id).length : 0;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Segoe UI', system-ui, sans-serif", background: C.bg, overflow: "hidden", position: "relative" }}>
      <style>{globalCss}</style>

      {/* ── Sidebar ── */}
      <aside aria-label="Primary" style={{ width: 220, background: C.sidebar, display: "flex", flexDirection: "column", flexShrink: 0, borderRight: `1px solid ${C.sidebarBorder}` }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${C.sidebarBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, background: C.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <BookOpen size={15} color="#fff" />
            </div>
            <div>
              <div style={{ color: "#F0EDE8", fontSize: 13, fontWeight: 600, letterSpacing: "-0.3px" }}>Ledger Book</div>
              <div style={{ color: C.sidebarLabel, fontSize: 10, letterSpacing: "0.5px", marginTop: 1 }}>ACCOUNT MANAGER</div>
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
            <div style={{ padding: "12px 10px 6px", fontSize: 10, color: C.sidebarLabel, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 }}>Accounts</div>
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
            <Plus size={13} /> New Account
          </button>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => doExport("all")} aria-label="Export all accounts to Excel"
              className="press" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", background: "rgba(255,255,255,0.06)", color: C.sidebarText, border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <Download size={13} /> Export
            </button>
            <button type="button" onClick={doImport} aria-label="Import from Excel"
              className="press" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "8px", background: "rgba(255,255,255,0.06)", color: C.sidebarText, border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              <Upload size={13} /> Import
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>

        {/* Dashboard */}
        {view === "dashboard" && (
          <div className="view-in" style={{ padding: `${SP.xl}px ${SP.pagePad}px`, flex: 1 }}>
            <div style={{ marginBottom: SP.xl }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: C.textPrimary }}>Dashboard</h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textSecondary }}>{data.accounts.length} account{data.accounts.length !== 1 ? "s" : ""} · {data.transactions.length} transaction{data.transactions.length !== 1 ? "s" : ""}</p>
            </div>

            {data.accounts.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ width: 56, height: 56, background: C.accentBg, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <Wallet size={24} color={C.accent} />
                </div>
                <div style={{ fontSize: 16, color: C.textPrimary, fontWeight: 500, marginBottom: 6 }}>No accounts yet</div>
                <div style={{ fontSize: 13, color: C.textSecondary, marginBottom: 20 }}>Create your first account to start tracking money</div>
                <button type="button" onClick={() => openPanel("add-acc")} className="press" style={{ background: C.accent, color: "#fff", border: "none", borderRadius: 7, padding: "10px 22px", fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                  + New Account
                </button>
              </div>
            ) : (
              <>
                {/* Summary Stats */}
                <div className="stagger" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: SP.md, marginBottom: SP.sectionGap }}>
                  {[
                    { label: "Total Credit (In)", val: totals.credit, color: C.credit, pre: "+" },
                    { label: "Total Debit (Out)", val: totals.debit, color: C.debit, pre: "-" },
                    { label: "Net Balance", val: Math.abs(totals.balance), color: totals.balance >= 0 ? C.credit : C.debit, pre: totals.balance < 0 ? "-" : "" },
                  ].map((s, i) => (
                    <div key={i} className="stat-card" style={{ "--i": i, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: `${SP.lg}px ${SP.cardPad.md}px` }}>
                      <div style={{ fontSize: 11, color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: SP.sm }}>{s.label}</div>
                      <div style={{ fontSize: 21, color: s.color, fontWeight: 700, letterSpacing: "-0.5px" }}>
                        {s.pre}{RS}{fmtNum(s.val)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Account List */}
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, marginBottom: 10 }}>All accounts</div>
                <div className="stagger" style={{ display: "flex", flexDirection: "column", gap: SP.sm }}>
                  {stats.map((acc, i) => (
                    <button key={acc.id} type="button" onClick={() => openAcc(acc.id)} className="acc-row"
                      style={{ "--i": i, ...resetBtn, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: `${SP.md}px ${SP.cardPad.md}px`, cursor: "pointer", width: "100%", alignItems: "center", gap: SP.md }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: ACCENT_COLORS[i % ACCENT_COLORS.length] + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: ACCENT_COLORS[i % ACCENT_COLORS.length], flexShrink: 0 }}>
                        {acc.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary }}>{acc.name}</div>
                        <div style={{ fontSize: 12, color: C.textSecondary, marginTop: 2 }}>
                          {acc.count} entr{acc.count !== 1 ? "ies" : "y"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: acc.balance >= 0 ? C.credit : C.debit }}>
                          {RS}{fmtNum(acc.balance)}
                        </div>
                        <div style={{ fontSize: 11, color: C.textSecondary, marginTop: 2 }}>
                          <span style={{ color: C.credit }}>+{fmtNum(acc.credit)}</span>
                          <span style={{ margin: "0 4px" }}>/</span>
                          <span style={{ color: C.debit }}>-{fmtNum(acc.debit)}</span>
                        </div>
                      </div>
                      <ChevronRight size={15} color={C.iconMuted} />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Account Detail */}
        {view === "account" && activeAcc && (
          <div className="view-in" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ padding: `${SP.xl}px ${SP.pagePad}px 0`, background: C.card, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SP.lg }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button type="button" onClick={() => setView("dashboard")} aria-label="Back to dashboard" className="iconbtn"
                    style={{ ...resetBtn, color: C.textSecondary, padding: 4, borderRadius: 6 }}>
                    <ChevronLeft size={18} />
                  </button>
                  <div>
                    <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: C.textPrimary }}>{activeAcc.name}</h1>
                    <div style={{ fontSize: 12, color: C.textSecondary }}>{activeStat?.count ?? 0} entr{activeStat?.count === 1 ? "y" : "ies"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => openPanel("add-tx", "credit")} className="press"
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", background: C.credit, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    <ArrowDownLeft size={13} /> Credit (In)
                  </button>
                  <button type="button" onClick={() => openPanel("add-tx", "debit")} className="press"
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", background: C.debit, color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    <ArrowUpRight size={13} /> Debit (Out)
                  </button>
                  <button type="button" onClick={() => doExport(activeAcc.id)} aria-label={`Export ${activeAcc.name} to Excel`} className="iconbtn"
                    style={{ padding: "8px 10px", background: "none", border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", color: C.textSecondary, display: "flex" }}>
                    <Download size={13} />
                  </button>
                  <button type="button" onClick={() => requestDeleteAcc(activeAcc.id)} aria-label={`Delete ${activeAcc.name} account`} className="iconbtn"
                    style={{ padding: "8px 10px", background: "none", border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", color: C.debit, display: "flex" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: SP.md, paddingBottom: SP.lg }}>
                {[
                  { label: "Total Credit", val: activeStat?.credit || 0, color: C.credit },
                  { label: "Total Debit", val: activeStat?.debit || 0, color: C.debit },
                  { label: "Balance", val: Math.abs(activeStat?.balance || 0), color: (activeStat?.balance || 0) >= 0 ? C.credit : C.debit },
                ].map((s, i) => (
                  <div key={i} className="stat-card" style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: `${SP.lg}px ${SP.cardPad.md}px` }}>
                    <div style={{ fontSize: 11, color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: SP.sm }}>{s.label}</div>
                    <div style={{ fontSize: 16, color: s.color, fontWeight: 700 }}>{RS}{fmtNum(s.val)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: `0 ${SP.pagePad}px ${SP.xxl}px` }}>
              {txsWithBalance.length === 0 ? (
                <div style={{ textAlign: "center", padding: "80px 0", color: C.textSecondary }}>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>No transactions yet</div>
                  <div style={{ fontSize: 12 }}>Use the Credit / Debit buttons above to record entries</div>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: T.body, marginTop: SP.lg }}>
                  <thead>
                    <tr style={{ background: C.tableHead }}>
                      {[
                        { label: "Date", align: "left", w: "110px" },
                        { label: "Description", align: "left", w: "auto" },
                        { label: `Credit (${RS.trim()})`, align: "right", w: "130px" },
                        { label: `Debit (${RS.trim()})`, align: "right", w: "130px" },
                        { label: "Balance", align: "right", w: "130px" },
                        { label: "", align: "right", w: "36px" },
                      ].map((h, i) => (
                        <th key={i} style={{ padding: `${SP.feet.t}px 12px`, textAlign: h.align, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.7px", color: C.textSecondary, borderBottom: `2px solid ${C.border}`, width: h.w, fontWeight: 600, whiteSpace: "nowrap" }}>
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
                          {new Date(tx.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td style={{ padding: `${SP.feet.t}px 12px`, color: C.textPrimary, borderBottom: `1px solid ${C.border}` }}>
                          {tx.desc}
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
                          <button type="button" onClick={() => doDeleteTx(tx.id)} aria-label={`Delete transaction: ${tx.desc}`} className="iconbtn"
                            style={{ ...resetBtn, color: C.iconGhost, padding: 3, borderRadius: 4 }}>
                            <Trash2 size={12} />
                          </button>
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
            <div className="view-in" style={{ padding: `${SP.xl}px ${SP.pagePad}px`, flex: 1, color: C.textSecondary, fontSize: 13 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: C.textPrimary }}>Charts</h1>
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
        <div ref={panelRef} className="overlay" style={{ position: "fixed", inset: 0, background: "rgba(10,8,12,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}
          onClick={(e) => { if (e.target === e.currentTarget) closePanel(); }}>
          {/* add-tx */}
          {panel === "add-tx" && activeAcc && (
            <div role="dialog" aria-modal="true" aria-labelledby="addtx-title" className="dialog-pop"
              style={{ background: C.card, borderRadius: 12, padding: 28, width: 380, boxShadow: C.shadowModal }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div id="addtx-title" style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary }}>Add entry — {activeAcc.name}</div>
                <button type="button" onClick={closePanel} aria-label="Close" className="iconbtn" style={{ ...resetBtn, borderRadius: 6, padding: 3 }}>
                  <X size={17} color={C.textSecondary} />
                </button>
              </div>

              <div style={{ display: "flex", background: C.bg, borderRadius: 8, padding: 3, marginBottom: 20 }}>
                {[
                  { type: "credit", label: "Credit (Money In)", icon: <ArrowDownLeft size={13} />, color: C.credit },
                  { type: "debit", label: "Debit (Money Out)", icon: <ArrowUpRight size={13} />, color: C.debit },
                ].map((t) => (
                  <button key={t.type} type="button" aria-pressed={txForm.type === t.type} onClick={() => setTxForm((f) => ({ ...f, type: t.type }))}
                    style={{ flex: 1, padding: "8px 6px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600,
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
                { label: "Description", key: "desc", type: "text", placeholder: "What is this for?", id: "tx-desc" },
                { label: "Date", key: "date", type: "date", placeholder: "", id: "tx-date" },
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label htmlFor={f.id} style={{ display: "block", fontSize: 11, color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 5 }}>{f.label}</label>
                  <input id={f.id} type={f.type} placeholder={f.placeholder} value={txForm[f.key]}
                    onChange={(e) => setTxForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && doAddTx()}
                    style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: T.body, color: C.textPrimary, background: C.inputBg, boxSizing: "border-box", fontFamily: "inherit" }} />
                </div>
              ))}

              {err && <div style={{ color: C.debit, fontSize: 12, marginBottom: 12 }}>{err}</div>}

              <button type="button" onClick={doAddTx} className="press"
                style={{ width: "100%", padding: 11, background: txForm.type === "credit" ? C.credit : C.debit, color: "#fff", border: "none", borderRadius: 7, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                Add {txForm.type === "credit" ? "Credit" : "Debit"} Entry
              </button>
            </div>
          )}

          {/* add-acc */}
          {panel === "add-acc" && (
            <div role="dialog" aria-modal="true" aria-labelledby="addacc-title" className="dialog-pop"
              style={{ background: C.card, borderRadius: 12, padding: 28, width: 380, boxShadow: C.shadowModal }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div id="addacc-title" style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary }}>New account</div>
                <button type="button" onClick={closePanel} aria-label="Close" className="iconbtn" style={{ ...resetBtn, borderRadius: 6, padding: 3 }}>
                  <X size={17} color={C.textSecondary} />
                </button>
              </div>

              {[
                { label: "Account name", key: "name", type: "text", placeholder: "e.g. Cash, Savings, Business…", id: "acc-name" },
                { label: "Opening balance (optional)", key: "opening", type: "number", placeholder: "0.00", id: "acc-opening" },
              ].map((f) => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                  <label htmlFor={f.id} style={{ display: "block", fontSize: 11, color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 5 }}>{f.label}</label>
                  <input id={f.id} type={f.type} placeholder={f.placeholder} value={accForm[f.key]}
                    onChange={(e) => setAccForm((x) => ({ ...x, [f.key]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && doAddAcc()}
                    style={{ width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 7, fontSize: T.body, color: C.textPrimary, background: C.inputBg, boxSizing: "border-box", fontFamily: "inherit" }} />
                </div>
              ))}

              {err && <div style={{ color: C.debit, fontSize: 12, marginBottom: 12 }}>{err}</div>}

              <button type="button" onClick={doAddAcc} className="press"
                style={{ width: "100%", padding: 11, background: C.accent, color: "#fff", border: "none", borderRadius: 7, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                Create Account
              </button>
            </div>
          )}

          {/* confirm-del */}
          {panel === "confirm-del" && confirmAcc && (
            <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc" className="dialog-pop"
              style={{ background: C.card, borderRadius: 12, padding: 28, width: 380, boxShadow: C.shadowModal, textAlign: "center" }}>
              <div style={{ width: 48, height: 48, background: C.debitBg, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                <AlertTriangle size={22} color={C.debit} />
              </div>
              <div id="confirm-title" style={{ fontSize: 16, fontWeight: 600, color: C.textPrimary }}>Delete {confirmAcc.name}?</div>
              <p id="confirm-desc" style={{ fontSize: T.body, color: C.textSecondary, margin: "8px 0 20px" }}>
                This permanently removes the account and its {confirmTxCount} entr{confirmTxCount !== 1 ? "ies" : "y"} from the ledger.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={closePanel} id="confirm-cancel" className="press"
                  style={{ flex: 1, padding: 11, background: C.bg, color: C.textPrimary, border: `1px solid ${C.border}`, borderRadius: 7, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
                  Keep
                </button>
                <button type="button" onClick={doConfirmDeleteAcc} id="confirm-ok" className="press"
                  style={{ flex: 1, padding: 11, background: C.debit, color: "#fff", border: "none", borderRadius: 7, fontSize: T.body, fontWeight: 600, cursor: "pointer" }}>
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
          style={{ position: "fixed", top: SP.lg, right: SP.lg, zIndex: 300, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, color: C.textPrimary, boxShadow: C.shadowModal }}>
          {notice}
        </div>
      )}
    </div>
  );
}