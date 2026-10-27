// update480 fixture shared by the server mock (mocksb.js) and the browser mock (mockdn.js). Synthetic data.
const CLIENT = { id: 5, name: "SCHOOL OF ULTIMATE LEADERSHIP FOUNDATION", company_name: null, gstin: "24AAACS1234A1Z5", bill_line1: "924, Maple Trade Center, Surdhara Circle", bill_line2: "Thaltej", bill_city: "Ahmedabad", bill_pincode: "380054", bill_state: "Gujarat", bill_state_code: "24", ship_same: true, contact_name: "Site store", mobile: "9000000001", is_active: true };
const lines30 = Array.from({ length: 30 }, (_, i) => ({ id: 2000 + i, challan_id: 320, po_item_id: null, item_id: 100 + i, item_name: `Fitting - UPVC Reducer Tee ${20 + i}x15mm (SCHEDULE 80) [ASTRAL]` + (i % 7 === 0 ? " with a deliberately long description to check wrapping of the goods column on both the screen and the PDF" : ""), unit: "Nos", ordered_qty: 10 + i, received_qty: 10 + i }));
module.exports = {
  CLIENT,
  tables: {
    sites: [{ id: 2, name: "SOUL Campus, GIFT City", client_name: "SOUL" }, { id: 1, name: "KEI Industries, Sanand", client_name: null }],
    purchase_orders: [{ id: 144, po_no: "PO/2610/0190" }, { id: 145, po_no: "PO/2610/0201" }],
    clients: [CLIENT],
    app_users: [{ id: 7, auth_id: "auth-7", full_name: "SATYAM CHAURASIYA", role: "it_executive", is_active: true, mobile: "9000000007" }, { id: 1, auth_id: "auth-1", full_name: "Keyal Shah", role: "director", is_active: true, mobile: "9000000011" },
      { id: 12, auth_id: "auth-12", full_name: "Satyendra Yadav", role: "supervisor", is_active: true, mobile: "9000000012" }, { id: 10, auth_id: "auth-10", full_name: "Sanjan", role: "storekeeper", is_active: true, mobile: "9000000010" }, { id: 8, auth_id: "auth-8", full_name: "Mukesh", role: "ho_admin", is_active: true, mobile: "9000000008" }],
    user_sites: [{ id: 1, user_id: 12, site_id: 2 }, { id: 2, user_id: 10, site_id: 2 }, { id: 3, user_id: 7, site_id: 2 }],
    admin_rights: [{ user_id: 7, capability: "challan.send", allowed: true }, { user_id: 12, capability: "challan.send", allowed: true }],   // storekeeper 10 and ho_admin 8 deliberately without it
    item_master: [{ id: 15, hsn_code: "3917" }, { id: 103, hsn_code: "3917" }],
    delivery_challans: [
      { id: 312, dc_ref: "PSP/319/2026-27", site_id: 2, vendor_name: "SECRET VENDOR LTD", vendor_dc_no: "VDC-991", dc_date: "2026-10-27", po_id: 144, source: "manual", status: "matched", client_id: 5, created_at: "2026-10-27T06:00:00Z", posted_to_tally: false },
      { id: 320, dc_ref: "PSP/320/2026-27", site_id: 2, vendor_name: "SECRET VENDOR LTD", vendor_dc_no: "VDC-992", dc_date: "2026-10-27", po_id: 145, source: "manual", status: "matched", client_id: 5, created_at: "2026-10-27T07:00:00Z", posted_to_tally: false },
      { id: 300, dc_ref: "PSP/300/2026-27", site_id: 1, vendor_name: "OLD VENDOR", vendor_dc_no: "", dc_date: "2026-09-02", po_id: 144, source: "manual", status: "matched", client_id: null, created_at: "2026-09-02T07:00:00Z", posted_to_tally: true },   // old note, no client master, no HSN
    ],
    delivery_challan_items: [
      { id: 9001, challan_id: 312, po_item_id: 501, item_id: 15, item_name: "HDPE - DUTRON HDPE PIPE PE-80 110 X 10 KG", unit: "Rmt", ordered_qty: 400, received_qty: 400 },
      ...lines30,
      { id: 9101, challan_id: 300, po_item_id: null, item_id: 999, item_name: "Pipe - UPVC SCH 40 50mm 6 M [ASTRAL]", unit: "Nos", ordered_qty: 100, received_qty: 40 },
      { id: 9102, challan_id: 300, po_item_id: null, item_id: 998, item_name: "Solvent cement 500 ml", unit: "Nos", ordered_qty: 6, received_qty: 6 },
    ],
    delivery_note_links: [], delivery_note_sends: [], module_audit_log: [],
  },
};
