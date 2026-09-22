// Spacing scale — 4pt base, semantic names. Every layout literal should come from here.
export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xl2: 44,
  // page-level
  pagePad: 32,        // main-content horizontal gutter
  sectionGap: 28,     // gap between distinct sections (dashboard metrics → list)
  cardPad: { sm: 16, md: 18, lg: 24 },   // card internal padding
  // glyph/label rhythm
  track: 5,           // between sidebar label + content
  feet: { t: 10, b: 12 },  // table cell vertical padding
};

// Design tokens — single source of truth for Ledger Book.
//
// The subject is a literal ledger: ruled paper, ink, a cloth-bound cover with brass corners.
// That's where every choice below comes from, not a generic "finance app" palette —
//   • paper-toned surfaces instead of card-and-shadow chrome; sections are divided by rules
//     (hairlines), the way a ledger page divides columns, not by boxes and drop shadows.
//   • credit is written in black/green ink, debit in red ink ("in the red") — the oldest
//     color convention in bookkeeping, not a repurposed dashboard red/green.
//   • the sidebar reads as a cloth cover (deep bottle green, brass fittings), not a generic
//     near-black rail with a bright accent chip.
// Values chosen for WCAG AA wherever they appear as text (≥4.5:1 on their bg).

// Type tokens — a serif for anything that reads as a heading or a wordmark (the "printed" part
// of a ledger — cover, titles, running totals), a grotesk for everything you interact with or
// scan quickly (inputs, buttons, table cells). Two families, clearly distinct roles.
export const FONT = {
  display: "'Source Serif 4', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif",
  body: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
};
export const FONT_IMPORT_URL =
  "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap";

export const T = {
  body: 14,        // inputs, buttons, table cells, empty states — legible but compact
};

export const C = {
  // surfaces — warm, paper-toned; not a "SaaS grey"
  bg: "#F5F2E9",
  card: "#FFFFFF",
  border: "#DBD4BF",
  borderStrong: "#B6AC8E",
  tableHead: "#F5F2E9",
  zebra: "#FAF8F1",
  hoverRow: "#EFEADA",
  inputBg: "#FCFBF6",

  // sidebar — a cloth-bound cover, not a generic dark rail
  sidebar: "#132420",
  sidebarBorder: "#20362F",
  sidebarText: "#9DB2AA",
  sidebarLabel: "#71887F",
  sidebarHover: "#1B322B",
  sidebarActiveBg: "#3B2E13",   // brass-dark — carries the accent onto the active item
  sidebarActiveText: "#F2EDDF",

  // text — warm ink, not flat black
  textPrimary: "#241F17",
  textSecondary: "#69614F",
  placeholder: "#8D8570",

  // semantic — ledger ink convention: black/green for credit, red for debit
  credit: "#215E43",
  creditBg: "#E9F1E7",
  debit: "#8A3324",
  debitBg: "#F5E9E3",
  accent: "#A3751F",     // brass
  accentBg: "#F1E7CC",
  accentHover: "#875E15",

  // focus ring on dark surfaces
  ringOnDark: "#D9AE54",

  // icons
  iconMuted: "#867E68",
  iconGhost: "#948C74",

  // elevation — soft and shallow; paper doesn't float
  shadowModal: "0 18px 40px rgba(30,26,18,0.16)",
};

// Per-account marker colors, cycled by index — muted, ink-like hues (no bright SaaS palette),
// all ≥4.25:1 on white.
export const ACCENT_COLORS = ["#8A4B30", "#7C6A2E", "#3F6B4D", "#236E63", "#4A5C82", "#7A4F6E", "#6B4226", "#3F6178"];

// Shared number formatter (en-IN grouping, 2dp, sign-stripped).
export const fmtNum = (n) =>
  Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });