"use client";
// update440: shared enquiry document (print page + public share page)
const fmtD = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";
export function EnquiryDoc({ enq }) {   // shared by print + public page
  const items = enq.items || []; const today = fmtD(enq.sent_at || new Date());
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 36, background: "#fff", color: "#111", fontFamily: "Newsreader, Georgia, serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "3px solid #FF7A1A", paddingBottom: 10 }}>
        <div><div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.05 }}>Pipeskool Projects Pvt. Ltd.</div><div style={{ fontSize: 12, color: "#666" }}>Plumbing &amp; Piping Contractors · Ahmedabad</div></div>
        <div style={{ textAlign: "right" }}><div style={{ fontSize: 18, fontWeight: 700 }}>Enquiry {enq.enq_no}</div><div style={{ fontSize: 12, color: "#666" }}>To: {enq.vendor_name} · {today}</div></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, margin: "12px 0" }}>
        <div><b>Project:</b> {enq.site_name || "—"} · <b>Indent:</b> {enq.indent_no} · <b>Required by:</b> {fmtD(enq.required_by) || "—"}</div><div style={{ color: "#666" }}>Kindly quote your best rates for the items below.</div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ background: "#111", color: "#fff" }}>{["#", "Category", "Description", "Balance qty", "Unit", "List rate", "Disc %", "Net rate"].map((h, i) => <th key={i} style={{ textAlign: i === 3 ? "right" : "left", padding: "6px 8px", fontWeight: 600, fontSize: 11 }}>{h}</th>)}</tr></thead>
        <tbody>{items.map((it, i) => <tr key={i} style={{ borderBottom: "1px solid #ddd" }}><td style={{ padding: "6px 8px" }}>{i + 1}</td><td style={{ padding: "6px 8px" }}>{it.category}</td><td style={{ padding: "6px 8px", fontWeight: 600 }}>{it.item_name}</td><td style={{ padding: "6px 8px", textAlign: "right" }}>{Number(it.balance_qty)}{Number(it.po_qty) > 0 ? <span style={{ color: "#888", fontWeight: 400 }}> (of {Number(it.indent_qty)})</span> : ""}</td><td style={{ padding: "6px 8px" }}>{it.unit}</td><td style={{ borderLeft: "1px solid #eee" }}></td><td style={{ borderLeft: "1px solid #eee" }}></td><td style={{ borderLeft: "1px solid #eee" }}></td></tr>)}</tbody>
      </table>
      <div style={{ marginTop: 14, fontSize: 10.5, color: "#666", borderTop: "1px solid #ddd", paddingTop: 6 }}>{items.length} item(s){enq.excluded_count ? ` · ${enq.excluded_count} items already under PO excluded` : ""} · Generated {today}{enq.sent_by_name ? " by " + enq.sent_by_name : ""} · Enquiry {enq.enq_no}</div>
    </div>);
}


export { fmtD };
