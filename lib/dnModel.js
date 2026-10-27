// update480: the Delivery Note as a document — ONE model shared by the on-screen preview, browser print, the server
// PDF and the public link page. Built from a challan row; carries NO vendor name, vendor DC number, rate or amount.
// Plain functions, no React, no browser APIs (also used by the server routes and the unit tests).

export const DN_LINK_DAYS = 30;                       // public link validity (days) — change here only
export const COMPANY = {
  name: "Pipeskool Projects Pvt. Ltd.", legal: "PROJECTS PVT. LTD.",
  addr: "102, Darshak Building, Opp. Shrey Hospital, Punjabi Hall Lane, Navrangpura, Ahmedabad 380009",
  gstin: "24AAMCP3389A1ZF", pan: "AAMCP3389A", cin: "U26956GJ2021PTC126015", state: "Gujarat", code: "24", email: "pipeskoolprojects@gmail.com",
};

const addrLines = b => b ? [b.line1, b.line2, [b.city, b.pincode].filter(Boolean).join(" - ")].filter(x => x && String(x).trim()).map(String) : [];
const shipBlock = c => !c ? null : c.ship_same !== false
  ? { line1: c.bill_line1, line2: c.bill_line2, city: c.bill_city, state: c.bill_state, state_code: c.bill_state_code, pincode: c.bill_pincode }
  : { line1: c.ship_line1, line2: c.ship_line2, city: c.ship_city, state: c.ship_state, state_code: c.ship_state_code, pincode: c.ship_pincode };

export const fmtDate = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); if (!m) return String(iso || ""); const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return `${Number(m[3])} ${M[Number(m[2]) - 1]} ${m[1]}`; };
export const ddmmyyyy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso || ""); };
export const qty = n => Number(n || 0).toFixed(2);

/**
 * challan: the row getDeliveryChallans() returns (dc_ref, date, site, po_no, client, clientRow, lines[], vendor_dc_no …)
 * hsn: { item_id: hsn_code }
 */
export function noteFromChallan(dc, hsn = {}) {
  const lines = (dc.lines || []).map((l, i) => ({ sr: i + 1, desc: String(l.item_name || ""), hsn: hsn[l.item_id] || l.hsn || "", qty: Number(l.received_qty || l.ordered_qty || 0), unit: String(l.unit || "NOS") }));
  const units = [...new Set(lines.map(l => l.unit))];
  const c = dc.clientRow || null, ship = shipBlock(c);
  const consignee = c ? { name: c.name, site: dc.site, lines: addrLines(ship), state: ship?.state || "Gujarat", code: ship?.state_code || "24", contact: [c.contact_name, c.mobile].filter(Boolean).join(" · ") }
    : { name: dc.client || dc.site || "", site: dc.client ? dc.site : "", lines: [], state: "Gujarat", code: "24", contact: "" };
  const buyer = c ? { name: c.company_name || c.name, lines: addrLines({ line1: c.bill_line1, line2: c.bill_line2, city: c.bill_city, pincode: c.bill_pincode }), gstin: c.gstin || "", state: c.bill_state || "Gujarat", code: c.bill_state_code || "24" }
    : { name: dc.client || dc.site || "", lines: [], gstin: "", state: "Gujarat", code: "24" };
  return {
    id: dc.id, no: String(dc.dc_ref || ""), date: String(dc.date || ""), po: String(dc.po_no || ""), destination: String(dc.site || ""),
    consignee, buyer, lines, totalQty: lines.reduce((t, l) => t + l.qty, 0), unitLabel: units.length === 1 ? units[0] : "",
    refNo: "",       // "Reference No. & Date" is the vendor's DC number in the register — deliberately NOT carried onto the note
    terms: "",       // Terms of Delivery: shown only when a value exists (none is stored today)
    cancelled: dc.status === "cancelled",
  };
}

export const safeFileName = no => "Delivery-Note-" + String(no || "DN").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".pdf";

/** the message for WhatsApp / SMS / email — never vendor, never rates */
export function dnMessage(note, link) {
  const first = note.lines[0];
  const more = note.lines.length > 1 ? ` + ${note.lines.length - 1} more item${note.lines.length > 2 ? "s" : ""}` : "";
  const item = first ? `${first.desc}${more}, ${qty(note.totalQty)}${note.unitLabel ? " " + note.unitLabel : ""}` : "—";
  return `${COMPANY.name}\nDelivery Note ${note.no} dated ${ddmmyyyy(note.date)}\nAgainst PO: ${note.po || "—"}\nItem: ${item}\nDelivery to: ${note.destination}\n\nView / download: ${link || ""}`;
}
export const dnSubject = note => `Delivery Note ${note.no} - Pipeskool Projects`;

// ---- validation / masking (shared by the panel, the server and the tests) ----
export const isMobile = v => /^[6-9]\d{9}$/.test(String(v || ""));
export const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
export const maskMobile = n => { const d = String(n || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? d.slice(0, 5) + " xxxx" + d.slice(-1) : "xxxxx xxxxx"; };
export const maskEmail = e => { const s = String(e || "").trim(); const i = s.indexOf("@"); if (i < 1) return "xxx"; return s.slice(0, Math.min(2, i)) + "xxx" + s.slice(i); };
export const waUrl = (mobile, text) => `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}`;
export const smsUrl = (mobile, text) => `sms:+91${mobile}?&body=${encodeURIComponent(text)}`;
export const mailtoUrl = (email, subject, text) => `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
export const CHANNELS = ["whatsapp", "email", "sms", "share", "copy", "download"];
export const CHANNEL_LABEL = { whatsapp: "WhatsApp", email: "Email", sms: "SMS", share: "Share", copy: "Copy link", download: "Download PDF" };
