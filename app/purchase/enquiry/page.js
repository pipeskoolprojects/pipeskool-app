"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getIndentEnquiry } from "@/lib/stock";

function EnquiryView() {
  const params = useSearchParams();
  const indentId = params.get("indent");
  const itemFilter = params.get("items");          // comma-separated item ids (optional)
  const heading = params.get("title") || "Material Enquiry";
  const [enq, setEnq] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!indentId) { setLoading(false); return; }
    getIndentEnquiry(indentId).then(d => { setEnq(d); setLoading(false); });
  }, [indentId]);

  useEffect(() => { if (enq) setTimeout(() => window.print(), 600); }, [enq]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading enquiry…</div>;
  if (!enq) return <div style={{ padding: 40, textAlign: "center" }}>Indent not found. Open this from Procurement → open an indent → Download enquiry.</div>;

  const ids = itemFilter ? itemFilter.split(",").map(s => s.trim()) : null;
  const items = ids ? enq.items.filter(it => ids.includes(String(it.id))) : enq.items;
  const cats = Array.from(new Set(items.map(i => i.category)));
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 36, background: "#fff", color: "#111", fontFamily: "Newsreader, Georgia, serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "3px solid #FF7A1A", paddingBottom: 14 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Pipeskool Projects Pvt. Ltd.</div>
          <div style={{ fontSize: 12.5, color: "#555" }}>Plumbing & Piping Contractors · Ahmedabad</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{heading}</div>
          <div style={{ fontSize: 12.5, color: "#555" }}>Date: {today}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", margin: "16px 0", fontSize: 13.5 }}>
        <div>
          <div><b>Project:</b> {enq.site}</div>
          <div><b>Indent ref:</b> {enq.indent_no}</div>
          {enq.required_by && <div><b>Required by:</b> {enq.required_by}</div>}
        </div>
        <div style={{ textAlign: "right", maxWidth: 320 }}>
          <div><b>Category:</b> {cats.join(", ")}</div>
          <div style={{ color: "#555", fontSize: 12 }}>Kindly quote your best rates for the items below.</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "#0F1419", color: "#fff" }}>
            <th style={{ padding: "8px 6px", textAlign: "left" }}>#</th>
            <th style={{ padding: "8px 6px", textAlign: "left" }}>Category</th>
            <th style={{ padding: "8px 6px", textAlign: "left" }}>Description</th>
            <th style={{ padding: "8px 6px", textAlign: "right" }}>Qty</th>
            <th style={{ padding: "8px 6px", textAlign: "left" }}>Unit</th>
            <th style={{ padding: "8px 6px", textAlign: "right", width: 90 }}>List Rate</th>
            <th style={{ padding: "8px 6px", textAlign: "right", width: 70 }}>Disc %</th>
            <th style={{ padding: "8px 6px", textAlign: "right", width: 90 }}>Net Rate</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={it.id} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "8px 6px" }}>{idx + 1}</td>
              <td style={{ padding: "8px 6px" }}>{it.category}</td>
              <td style={{ padding: "8px 6px", fontWeight: 600 }}>{it.item_name}{it.spec ? <span style={{ fontWeight: 400 }}> — {it.spec}</span> : ""}{it.purpose ? <span style={{ color: "#777", fontWeight: 400 }}> — {it.purpose}</span> : ""}</td>
              <td style={{ padding: "8px 6px", textAlign: "right" }}>{it.qty}</td>
              <td style={{ padding: "8px 6px" }}>{it.unit}</td>
              <td style={{ padding: "8px 6px" }}></td>
              <td style={{ padding: "8px 6px" }}></td>
              <td style={{ padding: "8px 6px" }}></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 18, fontSize: 12.5, color: "#555" }}>
        <div>• Net Rate = List Rate − Discount %. Please mention brand/make where applicable.</div>
        <div>• Quote validity, delivery time and GST to be specified separately.</div>
      </div>
      <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
        <div>Vendor name & seal: ____________________</div>
        <div>For Pipeskool Projects Pvt. Ltd.</div>
      </div>

      <style>{`@media print { @page { margin: 14mm; } button { display:none; } }`}</style>
    </div>
  );
}

export default function EnquiryPage() {
  return <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}><EnquiryView /></Suspense>;
}
