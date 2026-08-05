import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BarChart2 } from "lucide-react";
import { C, T, SP, ACCENT_COLORS, fmtNum } from "../theme.js";

const RS = "Rs. ";

// Lazy-loaded so recharts stays out of the initial bundle.
export default function ChartsView({ stats, chartData, onOpenAcc }) {
  return (
    <div style={{ padding: `${SP.xl}px ${SP.pagePad}px`, flex: 1 }}>
      <div style={{ marginBottom: SP.xl }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: C.textPrimary }}>Charts</h1>
      </div>

      {chartData.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: C.textSecondary }}>
          <BarChart2 size={36} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
          <div style={{ fontSize: 14 }}>No data to chart yet</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Add transactions to see your charts</div>
        </div>
      ) : (
        <>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px", marginBottom: SP.lg }}>
            <div style={{ fontSize: T.body, fontWeight: 600, color: C.textPrimary, marginBottom: SP.lg }}>Monthly credit vs debit</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={3} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F2" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} width={55}
                  tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} />
                <Tooltip formatter={(v, n) => [fmtNum(v), n]}
                  contentStyle={{ borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, boxShadow: "none" }} />
                <Bar dataKey="credit" name="Credit (In)" fill={C.credit} radius={[3, 3, 0, 0]} />
                <Bar dataKey="debit" name="Debit (Out)" fill={C.debit} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 8 }}>
              {[{ c: C.credit, l: "Credit (In)" }, { c: C.debit, l: "Debit (Out)" }].map((x, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: C.textSecondary }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: x.c }} />
                  {x.l}
                </div>
              ))}
            </div>
          </div>

          {stats.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px" }}>
              <div style={{ fontSize: T.body, fontWeight: 600, color: C.textPrimary, marginBottom: SP.lg }}>Account balances</div>
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <PieChart width={160} height={160}>
                  <Pie data={stats.filter((a) => a.balance > 0)} cx={75} cy={75} innerRadius={45} outerRadius={72} dataKey="balance" paddingAngle={2}>
                    {stats.map((_, i) => <Cell key={i} fill={ACCENT_COLORS[i % ACCENT_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [fmtNum(v), n]}
                    contentStyle={{ borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12 }} />
                </PieChart>
                <div style={{ flex: 1 }}>
                  {stats.map((acc, i) => (
                    <button key={acc.id} className="legend-row" onClick={() => onOpenAcc(acc.id)}
                      style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", cursor: "pointer", border: "none", borderBottom: `1px solid ${C.border}`, textAlign: "left", fontFamily: "inherit", fontSize: 13 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: ACCENT_COLORS[i % ACCENT_COLORS.length] }} />
                        <span style={{ fontSize: 13, color: C.textPrimary }}>{acc.name}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: acc.balance >= 0 ? C.credit : C.debit }}>
                        {RS}{fmtNum(Math.abs(acc.balance))}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
