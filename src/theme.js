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

// Design tokens — single source of truth for Ledger Book colors.
// Cool-neutral surfaces; warm amber #9E6210 is the sole identity accent.
// Values chosen for WCAG AA wherever they appear as text (≥4.5:1 on their bg).

// Type tokens — product register (dense app, money-centric).
export const T = {
  body: 14,        // inputs, buttons, table cells, empty states — legible but compact
};

export const C = {
  // surfaces
  bg: "#F5F6F7",
  card: "#FFFFFF",
  border: "#E2E4E7",
  borderStrong: "#C7CAD0",
  tableHead: "#EEF0F2",
  zebra: "#FAFBFC",
  hoverRow: "#ECEEF1",
  inputBg: "#FAFAFB",

  // dark sidebar
  sidebar: "#18161A",
  sidebarBorder: "#2C2830",
  sidebarText: "#A29AA9",
  sidebarLabel: "#9A93A5",
  sidebarHover: "#242127",
  sidebarActiveBg: "#3A2A16",  // warm amber-dark — carries the brand accent onto the active item
  sidebarActiveText: "#F0EDE8",

  // text
  textPrimary: "#1A1714",
  textSecondary: "#62646A",
  placeholder: "#6B6E74",

  // semantic
  credit: "#1A7A4A",
  creditBg: "#EDFAF3",
  debit: "#C0392B",
  debitBg: "#FEF0EE",
  accent: "#9E6210",
  accentBg: "#FAF1DF",
  accentHover: "#8A520D",

  // focus ring on dark surfaces
  ringOnDark: "#E4A950",

  // icons
  iconMuted: "#7A7F87",
  iconGhost: "#8A8F97",

  // elevation
  shadowModal: "0 24px 64px rgba(0,0,0,0.18)",
};

// Per-account avatar + pie-slice colors, cycled by index.
// Curated OKLCH hues, all ≥4.25:1 on white (existing wheel had 5/7 under 3:1).
export const ACCENT_COLORS = ["#B95B3D", "#A96B00", "#727F35", "#238A71", "#5376B8", "#9D5E94", "#8A4B30", "#005B8F"];

// Shared number formatter (en-IN grouping, 2dp, sign-stripped).
export const fmtNum = (n) =>
  Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
