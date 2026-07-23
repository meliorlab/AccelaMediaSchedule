import ExcelJS from "exceljs";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBookingOrders,
  getCampaignBundle,
  type CampaignBundle,
  type EnrichedPlacement,
} from "../compute.js";
import { MEDIA, type BookingOrder } from "@msb/shared";

const MONEY = "#,##0.00";
const MONEY_LOCAL = '"$"#,##0.00';
const MONEY_ACCT = '"$"#,##0.00;"$("#,##0.00")"';
const INT_FMT = "#,##0";

/**
 * Locate the bundled logo. Locally the assets sit next to this module; on Vercel
 * the function is bundled elsewhere but `includeFiles` preserves the source path
 * relative to the deployment root (process.cwd()). Try both.
 */
function resolveLogoPath(): string | null {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), "assets", "accela-logo.png"),
    join(process.cwd(), "server", "src", "assets", "accela-logo.png"),
    join(process.cwd(), "assets", "accela-logo.png"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const COLORS = {
  headerBg: "FF1F3864",
  headerText: "FFFFFFFF",
  subHeaderBg: "FFD9E1F2",
  totalBg: "FFFCE4D6",
  metaLabel: "FF1F3864",
  metaValue: "FFC00000",
  monthBlue: "FFDDEBF7",
  monthOrange: "FFFCE4D6",
  holidayGreen: "FFC6E0B4",
  brandTeal: "FF1CADD4",
};

const WEEKDAY_LETTER = ["Su", "M", "Tu", "W", "Th", "F", "Sa"];
const NUMBER_WORDS = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six",
  "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
];

// ---------------------------------------------------------------- shared helpers

function thinBorder(): Partial<ExcelJS.Borders> {
  const s: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFBFBFBF" } };
  return { top: s, left: s, bottom: s, right: s };
}

function styleHeaderCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
  cell.font = { bold: true, color: { argb: COLORS.headerText }, size: 10 };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = thinBorder();
}

function styleBand(cell: ExcelJS.Cell, bg: string, textArgb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.font = { bold: true, size: 9, color: { argb: textArgb } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = thinBorder();
}

function cellText(row: ExcelJS.Row, col: number, val: string | number) {
  const c = row.getCell(col);
  c.value = val;
  c.border = thinBorder();
  c.font = { size: 9 };
  c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  return c;
}

function cellMoney(row: ExcelJS.Row, col: number, val: number) {
  const c = row.getCell(col);
  c.value = round(val);
  c.numFmt = MONEY_LOCAL;
  c.border = thinBorder();
  c.font = { size: 9 };
  c.alignment = { vertical: "middle", horizontal: "right" };
  return c;
}

function cellInt(row: ExcelJS.Row, col: number, val: number) {
  const c = row.getCell(col);
  c.value = val;
  c.numFmt = INT_FMT;
  c.border = thinBorder();
  c.font = { size: 9 };
  c.alignment = { vertical: "middle", horizontal: "center" };
  return c;
}

function titleBlock(ws: ExcelJS.Worksheet, lines: string[], span: number) {
  lines.forEach((text, i) => {
    const row = i + 1;
    ws.mergeCells(row, 1, row, Math.max(span, 1));
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = { bold: i === 0, size: i === 0 ? 14 : 10, color: { argb: i === 0 ? COLORS.headerBg : "FF404040" } };
    cell.alignment = { horizontal: "left", vertical: "middle" };
  });
  return lines.length + 1; // next free row
}

function autoWidth(ws: ExcelJS.Worksheet, cols: number, opts?: { fixed?: Record<number, number | undefined> }) {
  for (let c = 1; c <= cols; c++) {
    const fixed = opts?.fixed?.[c];
    if (fixed) {
      ws.getColumn(c).width = fixed;
      continue;
    }
    let max = 8;
    ws.getColumn(c).eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    ws.getColumn(c).width = Math.min(Math.max(max + 2, 10), 18);
  }
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function formatLongDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function joinAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function derivePlacementLength(startISO: string, endISO: string): string {
  const s = new Date(startISO + "T00:00:00");
  const e = new Date(endISO + "T00:00:00");
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return "";
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  if (days <= 10) return `${days} Day${days === 1 ? "" : "s"}`;
  if (days < 56) {
    const weeks = Math.round(days / 7);
    return `${weeks} Week${weeks === 1 ? "" : "s"}`;
  }
  const months = Math.max(1, Math.round(days / 30.44));
  const word = NUMBER_WORDS[months] ?? String(months);
  return `${word} (${months}) Month${months === 1 ? "" : "s"}`;
}

function round(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function styleHeaderGray(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
  cell.font = { bold: true, color: { argb: "FF404040" }, size: 9 };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = thinBorder();
}

/** Draws the logo + title + metadata block + holiday legend on rows 1-6. */
function renderBrandedHeader(
  ws: ExcelJS.Worksheet,
  wb: ExcelJS.Workbook,
  bundle: CampaignBundle,
  opts: { title: string; mediaText: string; countries: string[] },
) {
  try {
    const logoPath = resolveLogoPath();
    if (logoPath) {
      const imgId = wb.addImage({ filename: logoPath, extension: "png" });
      ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 170, height: 72 } });
    }
  } catch {
    /* logo is optional */
  }

  ws.mergeCells(1, 3, 1, 11);
  const title = ws.getCell(1, 3);
  title.value = opts.title;
  title.font = { bold: true, size: 14, color: { argb: COLORS.headerBg } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 26;

  const clientName = bundle.clientName;
  const periodText =
    bundle.campaign.period?.trim() ||
    [formatLongDate(bundle.campaign.startDate), formatLongDate(bundle.campaign.endDate)]
      .filter(Boolean)
      .join(" - ");
  const lengthText =
    bundle.campaign.placementLength?.trim() ||
    derivePlacementLength(bundle.campaign.startDate, bundle.campaign.endDate);
  const preparedText = bundle.campaign.datePrepared ? formatLongDate(bundle.campaign.datePrepared) : "";

  const metaLeft: [string, string][] = [
    ["Client:", clientName],
    ["Campaign:", bundle.campaign.name],
    ["Media Placement:", opts.mediaText],
    ["Country:", joinAnd(opts.countries)],
    ["Job Bag #:", bundle.campaign.jobBag ?? ""],
  ];
  const metaRight: [string, string][] = [
    ["Placement Period:", periodText],
    ["Placement Length:", lengthText],
    ["Prepared By:", bundle.campaign.preparedBy ?? ""],
    ["Date Prepared:", preparedText],
  ];

  metaLeft.forEach(([lab, val], i) => {
    const row = 2 + i;
    const lc = ws.getCell(row, 3);
    lc.value = lab;
    lc.font = { bold: true, size: 10, color: { argb: COLORS.metaLabel } };
    lc.alignment = { horizontal: "left", vertical: "middle" };
    ws.mergeCells(row, 4, row, 6);
    const vc = ws.getCell(row, 4);
    vc.value = val;
    vc.font = { size: 10, color: { argb: COLORS.metaValue } };
    vc.alignment = { horizontal: "left", vertical: "middle" };
  });
  metaRight.forEach(([lab, val], i) => {
    const row = 2 + i;
    const lc = ws.getCell(row, 8);
    lc.value = lab;
    lc.font = { bold: true, size: 10, color: { argb: COLORS.metaLabel } };
    lc.alignment = { horizontal: "left", vertical: "middle" };
    ws.mergeCells(row, 9, row, 12);
    const vc = ws.getCell(row, 9);
    vc.value = val;
    vc.font = { size: 10, color: { argb: COLORS.metaValue } };
    vc.alignment = { horizontal: "left", vertical: "middle" };
  });

  const legendBox = ws.getCell(6, 9);
  legendBox.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.holidayGreen } };
  legendBox.border = thinBorder();
  const legendText = ws.getCell(6, 10);
  legendText.value = "- Public Holiday";
  legendText.font = { size: 9, italic: true, color: { argb: "FF404040" } };
  legendText.alignment = { horizontal: "left", vertical: "middle" };
}

/** Weekdays-only visible periods (weekend days appear only when they carry a spot). */
function visiblePeriods(bundle: CampaignBundle, placements: EnrichedPlacement[]) {
  const isDaily = bundle.campaign.gridMode === "daily";
  const spotDays = new Set<string>();
  for (const p of placements) for (const f of p.flights) if (f.count > 0) spotDays.add(f.periodKey);
  return bundle.periods.filter((per) => {
    if (!isDaily) return true;
    const d = new Date(per.key + "T00:00:00");
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    return !weekend || spotDays.has(per.key);
  });
}

/** Maps every period key to a representative Date (daily = the day, weekly = week start). */
function periodDates(bundle: CampaignBundle): Map<string, Date> {
  const isDaily = bundle.campaign.gridMode === "daily";
  const start = new Date(bundle.campaign.startDate + "T00:00:00");
  const map = new Map<string, Date>();
  bundle.periods.forEach((per, i) => {
    map.set(per.key, isDaily ? new Date(per.key + "T00:00:00") : addDays(start, i * 7));
  });
  return map;
}

interface MonthGroup {
  label: string;
  start: number;
  span: number;
}

/** Builds contiguous month bands over the visible day columns starting at dayStart. */
function monthGroups(visible: { key: string }[], dateByKey: Map<string, Date>, dayStart: number): MonthGroup[] {
  const groups: MonthGroup[] = [];
  visible.forEach((per, idx) => {
    const d = dateByKey.get(per.key)!;
    const label = `${d.toLocaleString("en-US", { month: "long" })}-${String(d.getFullYear()).slice(2)}`;
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.span++;
    else groups.push({ label, start: dayStart + idx, span: 1 });
  });
  return groups;
}

// ---------------------------------------------------------------- schedule tab

interface CostColumn {
  header: string;
  get: (p: EnrichedPlacement) => number;
  money: boolean; // true = currency, false = integer
  totalize: boolean; // include in subtotal / grand-total rows
}

function costColumns(view: "CLIENT" | "ACCELA"): CostColumn[] {
  if (view === "ACCELA") {
    return [
      { header: "Accela Unit Cost XCD", get: (p) => p.agencyUnitCost, money: true, totalize: false },
      { header: "Client Unit Cost XCD", get: (p) => p.clientUnitCost, money: true, totalize: false },
      { header: "No. of Insertions", get: (p) => p.financials.insertions, money: false, totalize: true },
      { header: "Sub Total XCD", get: (p) => p.financials.agencySubTotal, money: true, totalize: true },
      { header: "Tax(es) Total XCD", get: (p) => p.financials.tax, money: true, totalize: true },
      { header: "Grand Total XCD", get: (p) => p.financials.agencyGrandTotal, money: true, totalize: true },
      { header: "Wire Fee XCD", get: (p) => p.wireFee, money: true, totalize: true },
      { header: "Grand Total with Wire Fee XCD", get: (p) => p.financials.grandTotalWithWire, money: true, totalize: true },
      { header: "USD", get: (p) => p.financials.usd, money: true, totalize: true },
      { header: "Margin XCD", get: (p) => p.financials.margin, money: true, totalize: true },
    ];
  }
  return [
    { header: "Client Unit Cost XCD", get: (p) => p.clientUnitCost, money: true, totalize: false },
    { header: "No. of Insertions", get: (p) => p.financials.insertions, money: false, totalize: true },
    { header: "Sub Total XCD", get: (p) => p.financials.subTotal, money: true, totalize: true },
    { header: "Tax(es) Total XCD", get: (p) => p.financials.tax, money: true, totalize: true },
    { header: "Grand Total XCD", get: (p) => p.financials.grandTotal, money: true, totalize: true },
    { header: "Wire Fee XCD", get: (p) => p.wireFee, money: true, totalize: true },
    { header: "Grand Total with Wire Fee XCD", get: (p) => p.financials.grandTotalWithWire, money: true, totalize: true },
  ];
}

/** Branded, template-accurate schedule covering every station grouped by country. */
function addScheduleTab(wb: ExcelJS.Workbook, bundle: CampaignBundle, view: "CLIENT" | "ACCELA") {
  const placements = [...bundle.placements].sort(
    (a, b) =>
      a.countryName.localeCompare(b.countryName) ||
      a.outletName.localeCompare(b.outletName) ||
      a.sortOrder - b.sortOrder,
  );
  if (placements.length === 0) return;

  const isDaily = bundle.campaign.gridMode === "daily";
  const visible = visiblePeriods(bundle, placements);
  const dateByKey = periodDates(bundle);

  const cost = costColumns(view);
  const FIRST_COST = 5; // cols 1..4 are the fixed Country/Station/Product/Time(s)
  const COST_N = cost.length;
  const DAY_START = FIRST_COST + COST_N;
  const lastCol = DAY_START + visible.length - 1;

  const ws = wb.addWorksheet(view === "ACCELA" ? "Accela" : "Client", {
    views: [{ state: "frozen", xSplit: 4, ySplit: 10 }],
  });

  const countryNames = [...new Set(placements.map((p) => p.countryName).filter(Boolean))];
  const mediaList = MEDIA.filter((m) => placements.some((p) => p.medium === m));
  renderBrandedHeader(ws, wb, bundle, {
    title: "MEDIA PLACEMENT SCHEDULE",
    mediaText: mediaList.join(", "),
    countries: countryNames,
  });

  // ---- Header band (rows 8 = groups, 9 = weekday letters, 10 = date numbers) ----
  const HGROUP = 8;
  const HWEEK = 9;
  const HDATE = 10;
  ws.getRow(HGROUP).height = 16;
  ws.getRow(HWEEK).height = 22;
  ws.getRow(HDATE).height = 16;

  // Cost band over the cost columns
  ws.mergeCells(HGROUP, FIRST_COST, HGROUP, FIRST_COST + COST_N - 1);
  const bandCell = ws.getCell(HGROUP, FIRST_COST);
  bandCell.value = view === "ACCELA" ? "ACCELA COST (INTERNAL)" : "CLIENT'S COST";
  styleBand(bandCell, COLORS.subHeaderBg, COLORS.headerBg);

  // Month bands over the day columns
  const groups = monthGroups(visible, dateByKey, DAY_START);
  groups.forEach((g, gi) => {
    ws.mergeCells(HGROUP, g.start, HGROUP, g.start + g.span - 1);
    const c = ws.getCell(HGROUP, g.start);
    c.value = g.label;
    styleBand(c, gi % 2 === 0 ? COLORS.monthBlue : COLORS.monthOrange, COLORS.headerBg);
  });

  // Fixed column labels (span the weekday + date rows)
  ["Country", "Station", "Product", "Time(s)"].forEach((lab, i) => {
    ws.mergeCells(HWEEK, i + 1, HDATE, i + 1);
    const c = ws.getCell(HWEEK, i + 1);
    c.value = lab;
    styleHeaderCell(c);
  });
  // Cost column labels
  cost.forEach((cc, i) => {
    const col = FIRST_COST + i;
    ws.mergeCells(HWEEK, col, HDATE, col);
    const c = ws.getCell(HWEEK, col);
    c.value = cc.header;
    styleHeaderCell(c);
  });

  // Day columns: weekday letter (row 9) + date number (row 10)
  visible.forEach((per, idx) => {
    const col = DAY_START + idx;
    const d = dateByKey.get(per.key)!;
    const wl = ws.getCell(HWEEK, col);
    wl.value = isDaily ? WEEKDAY_LETTER[d.getDay()] : "WK";
    styleHeaderCell(wl);
    wl.font = { bold: true, size: 9, color: { argb: COLORS.headerText } };
    const dn = ws.getCell(HDATE, col);
    dn.value = isDaily ? d.getDate() : idx + 1;
    styleHeaderCell(dn);
    dn.font = { bold: true, size: 9, color: { argb: COLORS.headerText } };
  });

  // ---- Data rows grouped by country ----
  type Acc = { cost: number[]; days: number[] };
  const zero = (): Acc => ({ cost: cost.map(() => 0), days: visible.map(() => 0) });
  const grand = zero();

  const byCountry = new Map<string, EnrichedPlacement[]>();
  for (const p of placements) {
    const k = p.countryName || "(none)";
    if (!byCountry.has(k)) byCountry.set(k, []);
    byCountry.get(k)!.push(p);
  }

  const writeCostTotals = (row: ExcelJS.Row, acc: Acc) => {
    cost.forEach((cc, i) => {
      if (!cc.totalize) return;
      const col = FIRST_COST + i;
      if (cc.money) cellMoney(row, col, acc.cost[i]);
      else cellInt(row, col, acc.cost[i]);
    });
    visible.forEach((_, idx) => {
      const c = row.getCell(DAY_START + idx);
      c.value = acc.days[idx] || null;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
  };

  let r = 11;
  for (const [countryName, ps] of byCountry) {
    const firstRow = r;
    const sub = zero();
    for (const p of ps) {
      const row = ws.getRow(r);
      const flightByKey = new Map(p.flights.map((f) => [f.periodKey, f.count || 0]));
      row.getCell(1).border = thinBorder(); // country column (merged later)
      cellText(row, 2, p.outletName);
      cellText(row, 3, p.productName);
      cellText(row, 4, p.daypart || p.timeSlot || "");
      cost.forEach((cc, i) => {
        const col = FIRST_COST + i;
        const val = cc.get(p);
        if (cc.money) cellMoney(row, col, val);
        else cellInt(row, col, val);
        sub.cost[i] += val;
        grand.cost[i] += val;
      });
      visible.forEach((per, idx) => {
        const col = DAY_START + idx;
        const cnt = flightByKey.get(per.key) || 0;
        const c = row.getCell(col);
        c.value = cnt > 0 ? cnt : null;
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.border = thinBorder();
        c.font = { size: 9 };
        sub.days[idx] += cnt;
        grand.days[idx] += cnt;
      });
      r++;
    }

    // Merge the country cell down its rows
    ws.mergeCells(firstRow, 1, r - 1, 1);
    const cc = ws.getCell(firstRow, 1);
    cc.value = countryName;
    cc.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cc.font = { bold: true, size: 10 };
    cc.border = thinBorder();

    // Country subtotal row
    const tr = ws.getRow(r);
    ws.mergeCells(r, 1, r, 4);
    const tl = ws.getCell(r, 1);
    tl.value = `${countryName.toUpperCase()} TOTAL`;
    tl.alignment = { horizontal: "right", vertical: "middle" };
    writeCostTotals(tr, sub);
    for (let c = 1; c <= lastCol; c++) {
      const cell = tr.getCell(c);
      cell.font = { ...(cell.font ?? {}), bold: true, size: 9 };
      cell.border = thinBorder();
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.subHeaderBg } };
    }
    r++;
  }

  // Grand-total row
  const gr = ws.getRow(r);
  ws.mergeCells(r, 1, r, 4);
  const gl = ws.getCell(r, 1);
  gl.value = "* MEDIA INVESTMENT GRAND TOTAL";
  gl.alignment = { horizontal: "right", vertical: "middle" };
  writeCostTotals(gr, grand);
  for (let c = 1; c <= lastCol; c++) {
    const cell = gr.getCell(c);
    cell.font = { bold: true, size: 9, color: { argb: COLORS.headerText } };
    cell.border = thinBorder();
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
  }
  r++;

  // Footer note
  r++;
  ws.mergeCells(r, 1, r, 8);
  const note = ws.getCell(r, 1);
  note.value = "* The above price is an estimate and is subject to change.";
  note.font = { italic: true, size: 9, color: { argb: "FF404040" } };
  note.alignment = { horizontal: "left", vertical: "middle" };

  // Column widths
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 12;
  cost.forEach((cc, i) => {
    ws.getColumn(FIRST_COST + i).width = cc.header.length > 18 ? 14 : cc.money ? 12 : 9;
  });
  for (let c = DAY_START; c <= lastCol; c++) ws.getColumn(c).width = 3.6;
}

// ---------------------------------------------------------------- cost breakdown tab

/** Per-station cost breakdown (Sub Total / Agency Commission / Net / VAT / Grand Total). */
function addCostBreakdownTab(wb: ExcelJS.Workbook, bundle: CampaignBundle) {
  const orders = buildBookingOrders(bundle);
  if (orders.length === 0) return;

  const ws = wb.addWorksheet("Cost Breakdown");

  try {
    const logoPath = resolveLogoPath();
    if (logoPath) {
      const imgId = wb.addImage({ filename: logoPath, extension: "png" });
      ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 63 } });
    }
  } catch {
    /* logo is optional */
  }

  ws.mergeCells(1, 3, 1, 4);
  const title = ws.getCell(1, 3);
  title.value = "COST BREAKDOWN BY STATION";
  title.font = { bold: true, size: 14, color: { argb: COLORS.headerBg } };
  title.alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell(2, 3).value = `Campaign: ${bundle.campaign.name}`;
  ws.getCell(2, 3).font = { size: 10, color: { argb: "FF404040" } };
  ws.getCell(3, 3).value = bundle.campaign.period || "";
  ws.getCell(3, 3).font = { size: 10, color: { argb: "FF404040" } };
  ws.getRow(1).height = 22;

  const label = (row: ExcelJS.Row, text: string) => {
    ws.mergeCells(row.number, 1, row.number, 2);
    const c = row.getCell(1);
    c.value = text;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.brandTeal } };
    c.font = { bold: true, size: 10, color: { argb: COLORS.headerText } };
    c.alignment = { horizontal: "right", vertical: "middle" };
    c.border = thinBorder();
    row.getCell(2).border = thinBorder();
  };
  const amount = (row: ExcelJS.Row, val: number) => {
    const c = row.getCell(4);
    c.value = round(val);
    c.numFmt = MONEY_ACCT;
    c.font = { bold: true, size: 10 };
    c.alignment = { horizontal: "right", vertical: "middle" };
    c.border = thinBorder();
  };

  let r = 5;
  for (const o of orders) {
    const subTotal = round(o.lines.reduce((a, l) => a + l.subTotal, 0));
    const commission = round(o.lines.reduce((a, l) => a + l.agencyCommission, 0));
    const insertions = o.lines.reduce((a, l) => a + l.insertions, 0);
    const commissionPct = subTotal ? Math.round((-commission / subTotal) * 100) : 15;
    const vatPct = Math.round(o.vatRate * 100);

    // Station header
    ws.mergeCells(r, 1, r, 4);
    const hc = ws.getCell(r, 1);
    hc.value = `${o.outletName}  —  ${o.countryName}  (${o.medium})`;
    hc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.headerBg } };
    hc.font = { bold: true, size: 11, color: { argb: COLORS.headerText } };
    hc.alignment = { horizontal: "left", vertical: "middle" };
    hc.border = thinBorder();
    r++;

    // SUB TOTAL (with insertions count)
    let row = ws.getRow(r);
    label(row, "SUB TOTAL");
    const insCell = row.getCell(3);
    insCell.value = insertions;
    insCell.numFmt = INT_FMT;
    insCell.font = { bold: true, size: 10 };
    insCell.alignment = { horizontal: "center", vertical: "middle" };
    insCell.border = thinBorder();
    amount(row, subTotal);
    r++;

    row = ws.getRow(r);
    label(row, `- ${commissionPct}% AGENCY COMMISSION`);
    row.getCell(3).border = thinBorder();
    amount(row, commission);
    r++;

    row = ws.getRow(r);
    label(row, "NEW SUB TOTAL");
    row.getCell(3).border = thinBorder();
    amount(row, o.totalNetSubTotal);
    r++;

    row = ws.getRow(r);
    label(row, `${vatPct}% VAT TOTAL`);
    row.getCell(3).border = thinBorder();
    amount(row, o.totalVat);
    r++;

    row = ws.getRow(r);
    label(row, "GRAND TOTAL");
    row.getCell(3).border = thinBorder();
    amount(row, o.grandTotal);
    r++;

    r++; // spacer between stations
  }

  ws.getColumn(1).width = 28;
  ws.getColumn(2).width = 6;
  ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 16;
}

// ---------------------------------------------------------------- booking orders (separate file)

function uniqueSheetName(base: string, used: Set<string>): string {
  let name = base.slice(0, 28);
  let n = 2;
  while (used.has(name)) name = `${base} ${n++}`.slice(0, 31);
  used.add(name);
  return name;
}

/**
 * Combined schedule + booking-order sheet for one TV/Radio station.
 * Mirrors the "MEDIA PLACEMENT SCHEDULE/BOOKING ORDER" template: the station's
 * flighting grid on top, with the booking-order cost breakdown underneath.
 */
function addStationScheduleBOSheet(
  wb: ExcelJS.Workbook,
  bundle: CampaignBundle,
  order: BookingOrder,
  placementById: Map<number, EnrichedPlacement>,
  name: string,
) {
  const isDaily = bundle.campaign.gridMode === "daily";
  const rows = order.lines
    .map((line) => ({ line, p: placementById.get(line.placementId) }))
    .filter((x): x is { line: BookingOrder["lines"][number]; p: EnrichedPlacement } => !!x.p);

  const placements = rows.map((x) => x.p);
  const visible = visiblePeriods(bundle, placements);
  const dateByKey = periodDates(bundle);

  const FIRST_COST = 4; // cols 1..3 fixed (Station / Product / Time)
  const COST_N = 3;
  const DAY_START = 7;
  const lastCol = DAY_START + visible.length - 1;

  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 3, ySplit: 10 }] });

  renderBrandedHeader(ws, wb, bundle, {
    title: `MEDIA PLACEMENT SCHEDULE/BOOKING ORDER - ${order.medium}`,
    mediaText: order.medium,
    countries: [order.countryName],
  });

  // ---- Header band (8 = bands, 9 = weekday letters, 10 = date numbers) ----
  const HGROUP = 8;
  const HWEEK = 9;
  const HDATE = 10;
  ws.getRow(HGROUP).height = 16;
  ws.getRow(HWEEK).height = 22;
  ws.getRow(HDATE).height = 16;

  ws.mergeCells(HGROUP, FIRST_COST, HGROUP, FIRST_COST + COST_N - 1);
  const band = ws.getCell(HGROUP, FIRST_COST);
  band.value = "ACCELA'S COST";
  styleBand(band, COLORS.brandTeal, COLORS.headerText);

  const groups = monthGroups(visible, dateByKey, DAY_START);
  const dayColor: string[] = [];
  groups.forEach((g, gi) => {
    const color = gi % 2 === 0 ? COLORS.monthBlue : COLORS.monthOrange;
    ws.mergeCells(HGROUP, g.start, HGROUP, g.start + g.span - 1);
    const c = ws.getCell(HGROUP, g.start);
    c.value = g.label;
    styleBand(c, color, COLORS.headerBg);
    for (let k = 0; k < g.span; k++) dayColor[g.start - DAY_START + k] = color;
  });

  ["Station", "Product", "Time"].forEach((lab, i) => {
    ws.mergeCells(HWEEK, i + 1, HDATE, i + 1);
    const c = ws.getCell(HWEEK, i + 1);
    c.value = lab;
    styleHeaderGray(c);
  });
  ["Rack Rate XCD", "No. of Insertions", "Grand Total XCD"].forEach((lab, i) => {
    const col = FIRST_COST + i;
    ws.mergeCells(HWEEK, col, HDATE, col);
    const c = ws.getCell(HWEEK, col);
    c.value = lab;
    styleHeaderGray(c);
  });

  visible.forEach((per, idx) => {
    const col = DAY_START + idx;
    const d = dateByKey.get(per.key)!;
    const wl = ws.getCell(HWEEK, col);
    wl.value = isDaily ? WEEKDAY_LETTER[d.getDay()] : "WK";
    styleHeaderGray(wl);
    const dn = ws.getCell(HDATE, col);
    dn.value = isDaily ? d.getDate() : idx + 1;
    styleHeaderGray(dn);
  });

  // ---- Data rows (one per product/placement) ----
  const dayTotals = visible.map(() => 0);
  let r = 11;
  const firstRow = r;
  for (const { line, p } of rows) {
    const row = ws.getRow(r);
    row.getCell(1).border = thinBorder(); // station column (merged later)
    cellText(row, 2, line.productName);
    cellText(row, 3, p.daypart || line.timeSlot || "");
    cellMoney(row, 4, line.rackRate);
    cellInt(row, 5, line.insertions);
    cellMoney(row, 6, line.subTotal);
    const flightByKey = new Map(p.flights.map((f) => [f.periodKey, f.count || 0]));
    visible.forEach((per, idx) => {
      const c = row.getCell(DAY_START + idx);
      const cnt = flightByKey.get(per.key) || 0;
      c.value = cnt > 0 ? cnt : null;
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = thinBorder();
      c.font = { size: 9 };
      dayTotals[idx] += cnt;
    });
    r++;
  }
  ws.mergeCells(firstRow, 1, r - 1, 1);
  const sc = ws.getCell(firstRow, 1);
  sc.value = order.outletName;
  sc.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  sc.font = { bold: true, size: 10 };
  sc.border = thinBorder();

  // ---- Booking-order breakdown ----
  const subTotal = round(order.lines.reduce((a, l) => a + l.subTotal, 0));
  const commission = round(order.lines.reduce((a, l) => a + l.agencyCommission, 0));
  const insertions = order.lines.reduce((a, l) => a + l.insertions, 0);
  const commissionPct = subTotal ? Math.round((-commission / subTotal) * 100) : 15;
  const vatPct = Math.round(order.vatRate * 100);

  const brkRow = (text: string, amt: number, withInsertions: boolean, withDays: boolean) => {
    const row = ws.getRow(r);
    ws.mergeCells(r, 1, r, FIRST_COST); // label spans Station..Rack Rate
    for (let c = 1; c <= FIRST_COST; c++) row.getCell(c).border = thinBorder();
    const lc = row.getCell(1);
    lc.value = text;
    lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.brandTeal } };
    lc.font = { bold: true, size: 10, color: { argb: COLORS.headerText } };
    lc.alignment = { horizontal: "right", vertical: "middle" };

    const ins = row.getCell(5);
    if (withInsertions) {
      ins.value = insertions;
      ins.numFmt = INT_FMT;
      ins.font = { bold: true, size: 10 };
      ins.alignment = { horizontal: "center", vertical: "middle" };
    }
    ins.border = thinBorder();

    const am = row.getCell(6);
    am.value = round(amt);
    am.numFmt = MONEY_ACCT;
    am.font = { bold: true, size: 10 };
    am.alignment = { horizontal: "right", vertical: "middle" };
    am.border = thinBorder();

    visible.forEach((_, idx) => {
      const c = row.getCell(DAY_START + idx);
      c.border = thinBorder();
      if (withDays) {
        c.value = dayTotals[idx] || null;
        c.alignment = { horizontal: "center", vertical: "middle" };
        c.font = { bold: true, size: 9 };
        if (dayColor[idx]) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dayColor[idx] } };
      }
    });
    r++;
  };

  brkRow("SUB TOTAL", subTotal, true, true);
  brkRow(`- ${commissionPct}% AGENCY COMMISSION`, commission, false, false);
  brkRow("NEW SUB TOTAL", order.totalNetSubTotal, false, false);
  brkRow(`${vatPct}% VAT TOTAL`, order.totalVat, false, false);
  brkRow("GRAND TOTAL", order.grandTotal, false, false);

  // Column widths
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 26;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 11;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 13;
  for (let c = DAY_START; c <= lastCol; c++) ws.getColumn(c).width = 3.6;
}

/** Detailed line-item booking order for a single station (used for Press / Online). */
function addLineItemBOSheet(wb: ExcelJS.Workbook, bundle: CampaignBundle, o: BookingOrder, name: string) {
  const ws = wb.addWorksheet(name);

  const headers = ["Product", "Time / Slot", "Rack Rate", "Discounted Rate", "Insertions", "Sub Total", "Agency Commission", "Net Sub Total", "VAT", "Grand Total"];
  const nextRow = titleBlock(
    ws,
    [
      `BOOKING ORDER - ${o.outletName}`,
      `${o.countryName}  |  ${o.medium}  |  VAT ${(o.vatRate * 100).toFixed(1)}%`,
      `Campaign: ${bundle.campaign.name}  |  Period: ${bundle.campaign.period}`,
    ],
    headers.length,
  );

  const headerRow = ws.getRow(nextRow);
  headers.forEach((h, i) => {
    styleHeaderCell(headerRow.getCell(i + 1));
    headerRow.getCell(i + 1).value = h;
  });
  headerRow.height = 28;

  let r = nextRow + 1;
  for (const l of o.lines) {
    const row = ws.getRow(r);
    const vals: (string | number)[] = [l.productName, l.timeSlot, l.rackRate, l.discountedRate, l.insertions, l.subTotal, l.agencyCommission, l.netSubTotal, l.vat, l.grandTotal];
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.border = thinBorder();
      if (typeof v === "number" && i >= 2) cell.numFmt = MONEY;
    });
    r++;
  }
  const totalRow = ws.getRow(r);
  totalRow.getCell(1).value = "GRAND TOTAL";
  totalRow.getCell(8).value = o.totalNetSubTotal;
  totalRow.getCell(9).value = o.totalVat;
  totalRow.getCell(10).value = o.grandTotal;
  totalRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.totalBg } };
    cell.border = thinBorder();
    if (typeof cell.value === "number") cell.numFmt = MONEY;
  });
  autoWidth(ws, headers.length, { fixed: { 1: 24, 2: 16 } });
}

function addBookingOrderSheets(wb: ExcelJS.Workbook, bundle: CampaignBundle) {
  const orders = buildBookingOrders(bundle);
  const placementById = new Map(bundle.placements.map((p) => [p.id, p]));
  const usedNames = new Set<string>();
  for (const o of orders) {
    const name = uniqueSheetName(`BO - ${o.outletName}`, usedNames);
    if (o.medium === "TV" || o.medium === "Radio") {
      addStationScheduleBOSheet(wb, bundle, o, placementById, name);
    } else {
      addLineItemBOSheet(wb, bundle, o, name);
    }
  }
}

// ---------------------------------------------------------------- workbook builders

/** Media placement file: exactly three tabs — Client, Accela, Cost Breakdown. */
export async function buildCampaignWorkbook(campaignId: number): Promise<ExcelJS.Buffer> {
  const bundle = await getCampaignBundle(campaignId);
  if (!bundle) throw new Error("Campaign not found");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Accela Media Schedule Builder";
  wb.created = new Date();

  addScheduleTab(wb, bundle, "CLIENT");
  addScheduleTab(wb, bundle, "ACCELA");
  addCostBreakdownTab(wb, bundle);

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet("Media Placement");
    ws.getCell(1, 1).value = "No placements have been added to this campaign yet.";
  }

  return wb.xlsx.writeBuffer();
}

/** Separate booking-orders file: one sheet per media house. */
export async function buildBookingOrdersWorkbook(campaignId: number): Promise<ExcelJS.Buffer> {
  const bundle = await getCampaignBundle(campaignId);
  if (!bundle) throw new Error("Campaign not found");

  const wb = new ExcelJS.Workbook();
  wb.creator = "Accela Media Schedule Builder";
  wb.created = new Date();

  addBookingOrderSheets(wb, bundle);

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet("Booking Orders");
    ws.getCell(1, 1).value = "No booking orders for this campaign yet.";
  }

  return wb.xlsx.writeBuffer();
}
