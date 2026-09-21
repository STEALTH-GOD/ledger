// Shared helpers.
//  • Money is summed in integer paisa (cents) so totals never drift (0.1 + 0.2 problems).
//  • Dates are plain "YYYY-MM-DD" strings and are NEVER pushed through `new Date("YYYY-MM-DD")`,
//    which parses as UTC and shifts the day/month in other timezones.

export const toC = (n) => Math.round((Number(n) || 0) * 100);
export const fromC = (c) => c / 100;

const pad = (n) => String(n).padStart(2, "0");

// Local calendar date (not UTC) — correct in every timezone.
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => ymd(new Date());

// Returns "YYYY-MM-DD" if y/m/d is a real calendar date in 1950–2100, else null.
export function validYmd(y, m, d) {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1950 || y > 2100) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function isValidYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return !!m && validYmd(+m[1], +m[2], +m[3]) === s;
}

// "2026-09-04" → "04 Sep 2026", built from local parts so the day never shifts.
export function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return s || "—";
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Strict money input: digits with at most 2 decimals. Returns a number, or `empty` for a blank
// field, or null when the text isn't a valid amount.
export function parseMoney(v, { negative = false, empty = null } = {}) {
  const s = String(v ?? "").trim();
  if (s === "") return empty;
  const re = negative ? /^-?\d{1,13}(\.\d{1,2})?$/ : /^\d{1,13}(\.\d{1,2})?$/;
  return re.test(s) ? Number(s) + 0 : null; // + 0 turns -0 into 0
}