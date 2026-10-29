// update485: page plan for the Direct Vendor Payment (Local Purchase Voucher) print.
// Page 1 = the voucher + up to 2 bills in the space below it (only when that space is big enough to read them);
// every later page = up to 4 bills in a 2 × 2 grid with fixed slot heights. A bill (or one page of a PDF bill) is one
// slot and is never split. Pure functions — used by the print page and by the tests.
export const A4 = { w: 190, h: 277 };          // printable area in mm (A4 portrait, 10 mm margins)
export const FOOTER_MM = 20;                    // company footer + page number on page 1
export const CONT_HEAD_MM = 9, CONT_FOOT_MM = 8, GAP_MM = 4;
export const MIN_FIRST_MM = 70;                 // below this the bills on page 1 would be too small to read

/** mm left for bills on page 1, given the measured voucher height (mm) */
export function firstPageSpace(voucherMm) { return Math.floor(A4.h - FOOTER_MM - GAP_MM - Number(voucherMm || 0)); }

/** slots → pages. Returns [{ page: 1|2.., slots: [index...], layout: "first1"|"first2"|"grid" }] (page 1 = voucher page) */
export function planPages(nSlots, voucherMm) {
  const pages = [{ page: 1, slots: [], layout: "voucher" }];
  let i = 0;
  if (nSlots > 0 && firstPageSpace(voucherMm) >= MIN_FIRST_MM) {
    const k = Math.min(2, nSlots);
    pages[0] = { page: 1, slots: [...Array(k).keys()], layout: "first" + k };
    i = k;
  }
  while (i < nSlots) {
    const slots = []; for (let k = 0; k < 4 && i < nSlots; k++, i++) slots.push(i);
    pages.push({ page: pages.length + 1, slots, layout: "grid" });
  }
  return pages;
}
/** fixed slot height (mm) for a continuation page (2 rows) */
export const gridSlotMm = () => Math.floor((A4.h - CONT_HEAD_MM - CONT_FOOT_MM - GAP_MM) / 2);
/** the "Attached bills" line on the voucher */
export function attachedLine(names, firstHasBills) {
  if (!names.length) return "No bills attached";
  return `Attached bills: ${names.length} file(s) – ${names.join(", ")}. ${firstHasBills ? (names.length > 2 ? "See below and the next page(s)." : "See below.") : "See next page."}`;
}
export const fileNameOf = (path, name) => String(name || "").trim() || String(path || "").split("/").pop() || "bill";
