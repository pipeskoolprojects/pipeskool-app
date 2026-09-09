// update278: EXCEL EXPORTS in the reference-workbook format — navy title bands, note row,
// grey column headers, coloured attendance cells, totals row. exceljs is loaded on demand.
const NAVY = "FF1F2A4B", HEAD = "FFF3F4F6", TOTAL = "FFFFF4E5";
const ATT = { P: "FFE8F6EE", H: "FFFFF4CC", A: "FFFDE8E8", WO: "FFEEF2F7", HOL: "FFFCE7F3" };

async function newBook() {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const wb = new ExcelJS.Workbook(); wb.creator = "Pipeskool Projects Pvt. Ltd.";
  return { ExcelJS, wb };
}
function band(ws, row, text, span) {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = text; c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } }; c.alignment = { vertical: "middle" };
  ws.getRow(row).height = 22;
}
function note(ws, row, text, span) {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1); c.value = text; c.font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
}
function header(ws, row, cols) {
  cols.forEach((h, i) => { const c = ws.getCell(row, i + 1); c.value = h; c.font = { bold: true, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD } }; c.border = { bottom: { style: "thin" } }; c.alignment = { horizontal: i === 0 ? "left" : "center" }; });
}
function totalRow(ws, row, vals) {
  vals.forEach((v, i) => { const c = ws.getCell(row, i + 1); c.value = v; c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL } }; c.border = { top: { style: "medium" } }; });
}
function brandRows(ws, title, sub, span) {
  ws.getCell(1, 1).value = "Pipeskool Projects Pvt. Ltd."; ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: "FFFF7A1A" } };
  ws.getCell(2, 1).value = sub; ws.getCell(2, 1).font = { size: 10, color: { argb: "FF6B7280" } };
  band(ws, 4, title, span);
}
function save(wb, name) {
  return wb.xlsx.writeBuffer().then(buf => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}

// ---------- 1. attendance grid ----------
// update332: cells are written as NUMBERS (1 / 0.5 / 0) so the month column totals in
// Excel exactly like the reference workbook. HOL stays text so a holiday is still visible.
const NUMV = { P: 1, H: 0.5, A: 0, L: "L", WO: 0, HOL: "HOL", "": 0 };
export async function exportAttendanceXlsx({ month, siteName, kind, days, rows, wo, hol, cellCode, otOf }) {
  const { wb } = await newBook();
  const ws = wb.addWorksheet(kind === "staff" ? "Attendance_Staff" : "Attendance_Labour");
  const span = 3 + days.length + 4;
  brandRows(ws, `MONTHLY ATTENDANCE — ${siteName.toUpperCase()} · ${kind === "staff" ? "STAFF" : "LABOUR"}`, `${month} · one row per worker per site`, span);
  note(ws, 5, "1 = Present · 0.5 = Half day (a half day on Sunday is paid as a full day) · 0 = Absent · L = leave · HOL = company holiday · OT row = approved overtime hours per day · a cell with an ORANGE BORDER was entered manually under Attendance Override — hover it for who, when and why", span);
  header(ws, 7, ["Sr", "Worker", "Site", ...days.map(d => `${String(d.day).padStart(2, "0")}\n${d.wd}`), "P", "H", "Days", "OT h"]);
  let r = 8;
  rows.forEach((w, i) => {
    ws.getCell(r, 1).value = i + 1; ws.getCell(r, 2).value = w.worker; ws.getCell(r, 3).value = w.site;
    days.forEach((d, j) => { const code = cellCode(w, d, wo, hol); const c = ws.getCell(r, 4 + j); c.value = NUMV[code]; c.alignment = { horizontal: "center" };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ATT[code] || "FFFFFFFF" } }; if (code === "P") c.font = { bold: true };
      // update335: a manually entered day must be as obvious in Excel as it is on screen
      const o = w.ovr && w.ovr[d.iso];
      if (o) {
        const edge = { style: "medium", color: { argb: "FFFF6A1F" } };
        c.border = { top: edge, left: edge, bottom: edge, right: edge };
        c.note = `MANUAL OVERRIDE\nby ${o.by}${o.at ? "\non " + new Date(o.at).toLocaleString("en-IN") : ""}${o.reason ? "\nreason: " + o.reason : ""}`;
      } });
    ws.getCell(r, 4 + days.length).value = w.p; ws.getCell(r, 5 + days.length).value = w.h; ws.getCell(r, 6 + days.length).value = w.daysPaid; ws.getCell(r, 7 + days.length).value = w.otTotal;
    r++;
    ws.getCell(r, 2).value = "  OT (h)"; ws.getCell(r, 2).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
    days.forEach((d, j) => { const v = otOf(w, d); const c = ws.getCell(r, 4 + j); if (v) { c.value = v; c.font = { size: 9, color: { argb: "FF7C2D12" } }; c.alignment = { horizontal: "center" }; } });
    r++;
  });
  ws.getColumn(2).width = 26; ws.getColumn(3).width = 20; days.forEach((_, j) => ws.getColumn(4 + j).width = 4.5);
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 7 }];
  await save(wb, `attendance_${month}_${siteName.replace(/[^\w]+/g, "_")}_${kind}.xlsx`);
}

// ---------- 2. payroll summary ----------
const PAY_COLS = ["Sr", "Worker Name", "Designation", "Daily Rate", "Days Worked", "Basic Wages", "OT Hours", "OT Amount", "Gross Earnings", "PF Deduction", "Professional Tax", "Other Deduction", "Total Deductions", "Advance Deduction", "Net Pay"];
export async function exportPayrollXlsx({ month, siteName, workers, filtered = false }) {
  const { wb } = await newBook();
  const ws = wb.addWorksheet("Payroll Summary");
  brandRows(ws, `PAYROLL SUMMARY — ${siteName.toUpperCase()}`, `${month} · one row per worker, days summed across sites`, PAY_COLS.length);
    // update340: a filtered file must say so on its face — otherwise a subset gets mistaken
  // for the month's full payroll by whoever opens it next.
note(ws, 5, "Basic = daily rate × payable days (incl. holiday pay) · OT rate = daily rate ÷ OT divisor (Settings) · Gross = Basic + OT · PT once per worker when gross exceeds the threshold · Net = Gross − PF − PT − Other − Advance"
    + (filtered ? " · FILTERED VIEW — this file contains only the rows matching the filters on screen, not the whole month" : ""), PAY_COLS.length);
  header(ws, 7, PAY_COLS);
  let r = 8;
  workers.forEach((w, i) => { [i + 1, w.worker, w.designation, w.rate, w.days, w.basic, w.otH, w.otAmt, w.gross, w.pf, w.pt, w.other, w.totalDed, w.adv, w.net].forEach((v, j) => { const c = ws.getCell(r, j + 1); c.value = v; if (j >= 3) c.numFmt = j === 4 || j === 6 ? "0.0" : "#,##0.00"; }); r++; });
  const sum = k => +workers.reduce((n, w) => n + Number(w[k] || 0), 0).toFixed(2);
  totalRow(ws, r, ["", "TOTAL", "", "", sum("days"), sum("basic"), sum("otH"), sum("otAmt"), sum("gross"), sum("pf"), sum("pt"), sum("other"), sum("totalDed"), sum("adv"), sum("net")]);
  ws.getColumn(2).width = 26; ws.getColumn(3).width = 14; for (let j = 4; j <= PAY_COLS.length; j++) ws.getColumn(j).width = 14;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 7 }];
  await save(wb, `payroll_${month}_${siteName.replace(/[^\w]+/g, "_")}${filtered ? "_filtered" : ""}.xlsx`);
}

// ---------- 3. site summary dashboard ----------
export async function exportSiteSummaryXlsx({ month, sites, grand }) {
  const { wb } = await newBook();
  const ws = wb.addWorksheet("Site Summary");
  // update342: staff cost is on the board now, so the sheet carries the same columns as the
  // screen — Staff headcount and OT hours included. A sheet that disagreed with the screen
  // would be worse than no sheet.
  const cols = ["Site", "Workers", "Staff", "Total Days", "Basic Wages (₹)", "OT Hours", "OT Amount (₹)", "Total Site Cost (₹)"];
  brandRows(ws, `SITE SUMMARY DASHBOARD — ${month}`, "Site-attributable cost — labour and staff — days, basic wages and OT split across sites", cols.length);
  note(ws, 5, "Total Site Cost = Basic Wages + OT Amount · labour comes from the generated labour payroll; staff basic is split pro-rata by paid days at each site and staff OT by the actual OT hours recorded at each site · every active site is listed, showing zeros where nothing was recorded", cols.length);
  header(ws, 7, cols);
  let r = 8;
  sites.forEach(s => { [s.site, s.workers, s.staff ?? 0, s.days, s.basic, s.otH ?? 0, s.otAmt, s.total].forEach((v, k) => { const c = ws.getCell(r, k + 1); c.value = v; if (k >= 4) c.numFmt = "#,##0.00"; }); r++; });
  totalRow(ws, r, ["GRAND TOTAL", grand.workers, grand.staff ?? 0, grand.days, grand.basic, grand.otH ?? 0, grand.otAmt, grand.total]);
  ws.getColumn(1).width = 28; for (let k = 2; k <= cols.length; k++) ws.getColumn(k).width = 18;
  await save(wb, `site_summary_${month}.xlsx`);
}

// ---------- 4. single-site workbook: attendance + payroll + site line, all filtered to that site ----------
export async function exportSiteWorkbook({ month, site, gridLabour, gridStaff, payrollWorkers, siteRow, cellCode, otOf }) {
  const { wb } = await newBook();
  const addGrid = (g, kind) => {
    if (!g || !g.rows.length) return;
    const ws = wb.addWorksheet(kind === "staff" ? "Attendance_Staff" : "Attendance_Labour");
    const span = 3 + g.days.length + 4;
    brandRows(ws, `MONTHLY ATTENDANCE — ${site.toUpperCase()} · ${kind === "staff" ? "STAFF" : "LABOUR"}`, `${month}`, span);
    note(ws, 5, "P = Present (1.0) · H = Half day (0.5; Sunday half = full) · A = Absent · HOL = holiday · OT row = approved overtime hours", span);
    header(ws, 7, ["Sr", "Worker", "Site", ...g.days.map(d => `${String(d.day).padStart(2, "0")}\n${d.wd}`), "P", "H", "Days", "OT h"]);
    let r = 8;
    g.rows.forEach((w, i) => {
      ws.getCell(r, 1).value = i + 1; ws.getCell(r, 2).value = w.worker; ws.getCell(r, 3).value = w.site;
      g.days.forEach((d, j) => { const code = cellCode(w, d, g.wo, g.hol); const c = ws.getCell(r, 4 + j); c.value = NUMV[code]; c.alignment = { horizontal: "center" }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ATT[code] || "FFFFFFFF" } }; });
      ws.getCell(r, 4 + g.days.length).value = w.p; ws.getCell(r, 5 + g.days.length).value = w.h; ws.getCell(r, 6 + g.days.length).value = w.daysPaid; ws.getCell(r, 7 + g.days.length).value = w.otTotal; r++;
      ws.getCell(r, 2).value = "  OT (h)"; ws.getCell(r, 2).font = { italic: true, size: 9 };
      g.days.forEach((d, j) => { const v = otOf(w, d); if (v) { const c = ws.getCell(r, 4 + j); c.value = v; c.alignment = { horizontal: "center" }; c.font = { size: 9, color: { argb: "FF7C2D12" } }; } }); r++;
    });
    ws.getColumn(2).width = 26; ws.getColumn(3).width = 20; g.days.forEach((_, j) => ws.getColumn(4 + j).width = 4.5);
    ws.views = [{ state: "frozen", xSplit: 3, ySplit: 7 }];
  };
  addGrid(gridLabour, "labour"); addGrid(gridStaff, "staff");
  const ws = wb.addWorksheet("Payroll Summary");
  brandRows(ws, `PAYROLL SUMMARY — ${site.toUpperCase()}`, `${month}`, PAY_COLS.length);
  note(ws, 5, "This site only · Net = Gross − PF − PT − Other − Advance", PAY_COLS.length);
  header(ws, 7, PAY_COLS);
  let r = 8;
  payrollWorkers.forEach((w, i) => { [i + 1, w.worker, w.designation, w.rate, w.days, w.basic, w.otH, w.otAmt, w.gross, w.pf, w.pt, w.other, w.totalDed, w.adv, w.net].forEach((v, j) => { const c = ws.getCell(r, j + 1); c.value = v; if (j >= 3) c.numFmt = j === 4 || j === 6 ? "0.0" : "#,##0.00"; }); r++; });
  const sum = k => +payrollWorkers.reduce((n, w) => n + Number(w[k] || 0), 0).toFixed(2);
  totalRow(ws, r, ["", "TOTAL", "", "", sum("days"), sum("basic"), sum("otH"), sum("otAmt"), sum("gross"), sum("pf"), sum("pt"), sum("other"), sum("totalDed"), sum("adv"), sum("net")]);
  ws.getColumn(2).width = 26; for (let j = 3; j <= PAY_COLS.length; j++) ws.getColumn(j).width = 14;
  const ss = wb.addWorksheet("Site Summary");
  brandRows(ss, `SITE SUMMARY — ${site.toUpperCase()} · ${month}`, "Total Site Labour Cost = Basic Wages + OT Amount", 6);
  header(ss, 7, ["Site", "Workers Present", "Total Days", "Basic Wages (₹)", "OT Amount (₹)", "Total Site Labour Cost (₹)"]);
  if (siteRow) [siteRow.site, siteRow.workers, siteRow.days, siteRow.basic, siteRow.otAmt, siteRow.total].forEach((v, j) => { ss.getCell(8, j + 1).value = v; });
  ss.getColumn(1).width = 28; for (let j = 2; j <= 6; j++) ss.getColumn(j).width = 18;
  await save(wb, `pipeskool_${site.replace(/[^\w]+/g, "_")}_${month}.xlsx`);
}


// update340: STAFF payroll summary (Office Staff / Site Staff tabs). Real generated amounts
// from staff_payouts — one monthly row per person, nothing apportioned across sites.
const STAFF_PAY_COLS = ["Sr", "Staff Name", "Designation", "Monthly Salary", "Working Days", "Days Present", "Days Absent", "Deduction", "OT Hours", "OT Amount", "Advance", "Net Pay", "Status"];
const TAB_TITLE = { office: "OFFICE STAFF", site_staff: "SITE STAFF" };
export async function exportStaffPayrollXlsx({ month, siteName, tab, rows, filtered = false }) {
  const { wb } = await newBook();
  const ws = wb.addWorksheet("Staff Payroll");
  brandRows(ws, `PAYROLL SUMMARY — ${TAB_TITLE[tab] || "STAFF"} · ${siteName.toUpperCase()}`,
    `${month} · one row per staff member`, STAFF_PAY_COLS.length);
  note(ws, 5, "Net = Monthly Salary − Deduction + OT Amount − Advance · figures come from the generated staff salary for the month"
    + (filtered ? " · FILTERED VIEW — this file contains only the rows matching the filters on screen, not the whole month" : ""), STAFF_PAY_COLS.length);
  header(ws, 7, STAFF_PAY_COLS);
  let r = 8;
  const num = n => Number(n || 0);
  rows.forEach((s, i) => {
    [i + 1, s.name, String(s.role || "").split("_").map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(" "),
     num(s.monthly_salary), num(s.working_days), num(s.days_present), num(s.days_absent),
     num(s.deduction), num(s.ot_hours), num(s.ot_amount), num(s.advances_deducted), num(s.net), s.status]
      .forEach((v, j) => { const c = ws.getCell(r, j + 1); c.value = v; if (j >= 3 && j <= 11) c.numFmt = "#,##0.00"; });
    r++;
  });
  const sum = k => +rows.reduce((n, s) => n + num(s[k]), 0).toFixed(2);
  totalRow(ws, r, ["", `TOTAL · ${rows.length} staff`, "", sum("monthly_salary"), sum("working_days"), sum("days_present"),
    sum("days_absent"), sum("deduction"), sum("ot_hours"), sum("ot_amount"), sum("advances_deducted"), sum("net"), ""]);
  ws.getColumn(2).width = 26; ws.getColumn(3).width = 18;
  for (let j = 4; j <= STAFF_PAY_COLS.length; j++) ws.getColumn(j).width = 14;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 7 }];
  await save(wb, `payroll_summary_${tab}_${month}${filtered ? "_filtered" : ""}.xlsx`);
}
