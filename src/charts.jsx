import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, BarChart,
} from "recharts";
import { BarChart2, TrendingUp, PieChart as PieIcon, Wallet } from "lucide-react";
import { C, T, SP, FONT, ACCENT_COLORS, fmtNum } from "../theme.js";

const RS = "Rs. ";

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

// Three figures on one ruled line — same footing convention as the dashboard's StatStrip,
// so Charts reads as the same ledger, not a different app bolted on.
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

// A bordered panel to contain each chart — plots need visual containment to read as a unit,
// but the radius is small (paper corners, not a SaaS card) and there's no drop shadow.
function Panel({ icon, title, subtitle, children, isMobile }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, padding: `${SP.lg}px ${SP.cardPad.md}px`, marginBottom: SP.md }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        {icon}
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{title}</div>
      </div>
      {subtitle && <div style={{ fontSize: 11, color: C.textSecondary, marginBottom: SP.md }}>{subtitle}</div>}
      {!subtitle && <div style={{ marginBottom: SP.sm }} />}
      <div style={{ width: "100%", height: isMobile ? 220 : 280 }}>{children}</div>
    </div>
  );
}

const tooltipBox = {
  background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, padding: "8px 12px",
  fontSize: 12, boxShadow: C.shadowModal,
};

function MoneyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={tooltipBox}>
      <div style={{ fontWeight: 600, color: C.textPrimary, marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16, color: p.color }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{RS}{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChartsView({ stats, chartData, onOpenAcc }) {
  const isMobile = useIsMobile();
  const pad = isMobile ? SP.lg : SP.pagePad;

  // Cumulative net (credit − debit) across the trailing months, layered on the same axis as the bars.
  const trend = useMemo(() => {
    let cum = 0;
    return chartData.map((m) => {
      cum += m.credit - m.debit;
      return { ...m, net: m.credit - m.debit, cumulative: cum };
    });
  }, [chartData]);

  // Every account ranked by balance, colored the same way the sidebar/dashboard color them.
  const ranked = useMemo(
    () => [...stats].sort((a, b) => b.balance - a.balance).map((a, i) => ({ ...a, color: ACCENT_COLORS[stats.indexOf(a) % ACCENT_COLORS.length] })),
    [stats]
  );

  // Share of total activity (credit + debit) per account — where the money is actually moving.
  const activityShare = useMemo(() => {
    return stats
      .map((a) => ({ name: a.name, value: a.credit + a.debit, color: ACCENT_COLORS[stats.indexOf(a) % ACCENT_COLORS.length] }))
      .filter((a) => a.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [stats]);

  const totalCredit = chartData.reduce((s, m) => s + m.credit, 0);
  const totalDebit = chartData.reduce((s, m) => s + m.debit, 0);
  const netTrend = trend.length ? trend[trend.length - 1].cumulative : 0;

  if (stats.length === 0) {
    return (
      <div className="view-in" style={{ padding: `${SP.xl}px ${pad}px`, flex: 1 }}>
        <h1 style={{ margin: 0, fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: C.textPrimary }}>Charts</h1>
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ width: 56, height: 56, background: C.accentBg, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <BarChart2 size={24} color={C.accent} />
          </div>
          <div style={{ fontFamily: FONT.display, fontSize: 17, color: C.textPrimary, fontWeight: 600, marginBottom: 6 }}>Nothing to chart yet</div>
          <div style={{ fontSize: 13, color: C.textSecondary }}>Add an account and a few entries to see trends here</div>
        </div>
      </div>
    );
  }

  return (
    <div className="view-in" style={{ padding: `${SP.xl}px ${pad}px`, flex: 1 }}>
      <div style={{ marginBottom: SP.xl }}>
        <h1 style={{ margin: 0, fontFamily: FONT.display, fontSize: 22, fontWeight: 600, color: C.textPrimary }}>Charts</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textSecondary }}>Last {chartData.length} month{chartData.length !== 1 ? "s" : ""} of activity across all accounts</p>
      </div>

      {/* ── Quick stats: one ruled line, same footing convention as the dashboard ── */}
      <div style={{ marginBottom: SP.sectionGap }}>
        <StatStrip isMobile={isMobile} items={[
          { label: "Credit, trailing period", val: totalCredit, color: C.credit, pre: "+" },
          { label: "Debit, trailing period", val: totalDebit, color: C.debit, pre: "-" },
          { label: "Net over period", val: Math.abs(netTrend), color: netTrend >= 0 ? C.credit : C.debit, pre: netTrend < 0 ? "-" : "+" },
        ]} />
      </div>

      {/* ── Monthly cash flow: credit/debit bars + cumulative net line ── */}
      <Panel icon={<TrendingUp size={15} color={C.accent} />} title="Cash flow trend" subtitle="Monthly credit vs. debit, with the running net balance overlaid" isMobile={isMobile}>
        <ResponsiveContainer>
          <ComposedChart data={trend} margin={{ top: 8, right: isMobile ? 8 : 16, left: isMobile ? -12 : 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} width={isMobile ? 40 : 56}
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
            <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(36,31,23,0.04)" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="credit" name="Credit" fill={C.credit} radius={[2, 2, 0, 0]} barSize={isMobile ? 14 : 20} />
            <Bar dataKey="debit" name="Debit" fill={C.debit} radius={[2, 2, 0, 0]} barSize={isMobile ? 14 : 20} />
            <Line type="monotone" dataKey="cumulative" name="Net (cumulative)" stroke={C.accent} strokeWidth={2.5} dot={{ r: 3, fill: C.accent }} activeDot={{ r: 5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr 0.9fr", gap: SP.md }}>
        {/* ── Balance leaderboard ── */}
        <Panel icon={<Wallet size={15} color={C.accent} />} title="Balance by account" subtitle="Click a bar to open that account" isMobile={isMobile}>
          <ResponsiveContainer>
            <BarChart data={ranked} layout="vertical" margin={{ top: 0, right: isMobile ? 16 : 24, left: 0, bottom: 0 }}
              onClick={(e) => { const id = e?.activePayload?.[0]?.payload?.id; if (id) onOpenAcc?.(id); }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false}
                tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} />
              <YAxis type="category" dataKey="name" width={isMobile ? 70 : 90} tick={{ fontSize: 11, fill: C.textPrimary }} axisLine={false} tickLine={false} />
              <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(36,31,23,0.04)" }} />
              <Bar dataKey="balance" name="Balance" radius={[0, 2, 2, 0]} barSize={isMobile ? 14 : 18} cursor="pointer">
                {ranked.map((a) => (
                  <Cell key={a.id} fill={a.balance >= 0 ? a.color : C.debit} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        {/* ── Where activity is concentrated ── */}
        <Panel icon={<PieIcon size={15} color={C.accent} />} title="Activity mix" subtitle="Share of total credit + debit, by account" isMobile={isMobile}>
          {activityShare.length === 0 ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSecondary, fontSize: 12 }}>
              No transactions yet
            </div>
          ) : (
            <ResponsiveContainer>
              <PieChart>
                <Pie data={activityShare} dataKey="value" nameKey="name" innerRadius={isMobile ? 48 : 62} outerRadius={isMobile ? 72 : 92} paddingAngle={2}>
                  {activityShare.map((a, i) => <Cell key={i} fill={a.color} stroke={C.card} strokeWidth={2} />)}
                </Pie>
                <Tooltip content={<MoneyTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} layout={isMobile ? "horizontal" : "vertical"} verticalAlign={isMobile ? "bottom" : "middle"} align={isMobile ? "center" : "right"} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}