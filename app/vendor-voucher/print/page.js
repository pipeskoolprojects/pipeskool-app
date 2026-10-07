"use client";
// update355: LOCAL PURCHASE VOUCHER — A4, Print -> Save as PDF, on the company letterhead,
// in the same style as the expense and advance vouchers. Reads the stored row; computes
// nothing.
import { useEffect, useRef, useState } from "react";
import BillPages from "@/components/BillPages";   // update458: bills on their own A4 pages (1 full / 2 stacked / 3–4 grid / 4 per page)
import Logo from "@/components/Logo";
import { getVendorVoucher, amountInWords } from "@/lib/vendorVoucher";
import { supabase } from "@/lib/supabase";
import { getCompany } from "@/lib/letters";
import { inr } from "@/lib/data";

const NAVY = "#1f2a4b";
const ORANGE = "#FF7A1A";
const d = v => v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—";
const cap = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, " ") : "—";

export default function VoucherPrint() {
  const [v, setV] = useState(null); const [c, setC] = useState(null); const [err, setErr] = useState("");
  const [billUrls, setBillUrls] = useState([]);   // update356: the bill pages go on the voucher
  const voucherRef = useRef(null);
  const [dl, setDl] = useState("");   // update458: Download PDF status

  useEffect(() => {
    (async () => {
      try {
        const id = new URLSearchParams(window.location.search).get("id");
        if (!id) { setErr("No voucher selected."); return; }
        const [row, comp] = await Promise.all([getVendorVoucher(id), getCompany()]);
        if (!row) { setErr("That voucher was not found, or you do not have rights to open it."); return; }
        setV(row); setC(comp);
        // signed URLs for the attached bills, so they print with the voucher
        if (row.bills?.length) {
          const out = [];
          for (const path of row.bills) {
            const { data } = await supabase.storage.from("attendance-photos").createSignedUrl(path, 3600);
            if (data?.signedUrl) out.push({ url: data.signedUrl, pdf: /\.pdf$/i.test(path) });
          }
          setBillUrls(out);
        }
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  // update458: the same document (voucher page + bill pages) as a PDF file — A4, 10 mm margins. Each bill page is
  // rendered separately at 2× and placed on its own PDF page, so the layout is exactly what the print shows.
  async function downloadPdf() {
    try {
      setDl("Preparing PDF…");
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      document.body.classList.add("pdf-rendering");
      const W = 190, H = 277;   // printable mm inside 10 mm margins
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const shoot = el => html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff", ignoreElements: n => n.classList && n.classList.contains("no-print") });
      // page 1..n: the voucher itself (split across pages only if it is longer than one)
      const vc = await shoot(document.getElementById("voucher-page"));
      const vh = vc.height * W / vc.width;
      let y = 0, first = true;
      while (y < vh) {
        if (!first) pdf.addPage(); first = false;
        const sliceH = Math.min(H, vh - y);
        const c2 = document.createElement("canvas"); c2.width = vc.width; c2.height = Math.round(sliceH * vc.width / W);
        c2.getContext("2d").drawImage(vc, 0, Math.round(y * vc.width / W), vc.width, c2.height, 0, 0, vc.width, c2.height);
        pdf.addImage(c2.toDataURL("image/jpeg", 0.95), "JPEG", 10, 10, W, sliceH);
        y += sliceH;
      }
      // then one PDF page per bill page
      for (const bp of Array.from(document.querySelectorAll(".bill-pages .bp"))) {
        const c = await shoot(bp);
        pdf.addPage();
        const h = Math.min(H, c.height * W / c.width);
        pdf.addImage(c.toDataURL("image/jpeg", 0.95), "JPEG", 10, 10, W, h);
      }
      pdf.save(`DVP_${String(v.voucher_no || v.id).replace(/[^A-Za-z0-9]+/g, "-")}.pdf`);
      setDl("");
    } catch (e) { setDl(""); alert("Could not create the PDF: " + (e?.message || e)); }
    finally { document.body.classList.remove("pdf-rendering"); }
  }

  if (err) return <div style={{ padding: 24 }}><div className="error" style={{ whiteSpace: "pre-wrap" }}>{err}</div></div>;
  if (!v || !c) return <div style={{ padding: 24 }} className="muted">Loading…</div>;

  const th = { fontSize: 10.5, textAlign: "left", padding: "6px 8px", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" };
  const td = { fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #f0f1f3" };
  const unpaid = v.payment_status !== "paid";

  return (
    <div id="voucher-doc" style={{ maxWidth: 820, margin: "0 auto", padding: 28, background: "#fff", color: "#111", fontFamily: "Inter, Arial, sans-serif", minHeight: "100vh", position: "relative" }}>
      <style>{`
        @media print {
          .no-print { display:none !important; }
          body { background:#fff; }
          @page { size: A4; margin: 10mm; }
          #voucher-doc { padding: 0 !important; min-height: 0 !important; }
        }
        body.pdf-rendering #voucher-doc { padding: 0 !important; min-height: 0 !important; }
        @media print {
          .sign-row { break-inside: avoid; page-break-inside: avoid; }
          table { break-inside: auto; }
          tr { break-inside: avoid; page-break-inside: avoid; }
        }
        .v-wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
                font-size: 76px; font-weight: 800; color: rgba(180,83,9,0.10); transform: rotate(-30deg);
                pointer-events: none; z-index: 5; letter-spacing: 0.05em; }
      `}</style>

      {unpaid && <div className="v-wm">PAYMENT PENDING</div>}

      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="primary" onClick={() => window.print()}>🖨 Print</button>
        <button onClick={downloadPdf} disabled={!!dl}>{dl || "⬇ Download PDF"}</button>{/* update458 */}
        <button onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/vendor-voucher"); }}>← Back</button>
      </div>

      <div id="voucher-page">{/* update458: page 1 for the PDF download */}
      <div ref={voucherRef}>
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", borderBottom: "3px solid " + ORANGE, paddingBottom: 10 }}>
        <Logo height={22} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: NAVY }}>{c.name}</div>
          <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic" }}>{c.address}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "#6b7280", fontWeight: 700 }}>LOCAL PURCHASE VOUCHER</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{v.voucher_no || "—"}</div>
          <div style={{ fontSize: 11, color: "#6b7280" }}>{d(v.expense_date)}</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 18 }}>
        <tbody>
          <tr>
            <td style={{ ...td, width: "16%", color: "#6b7280", fontSize: 10.5 }}>Vendor</td>
            <td style={{ ...td, fontWeight: 700 }}>{v.vendor}
              {v.vendor_address && <div style={{ fontWeight: 400, fontSize: 10.5, color: "#6b7280" }}>{v.vendor_address}</div>}</td>
            <td style={{ ...td, width: "16%", color: "#6b7280", fontSize: 10.5 }}>Site</td>
            <td style={{ ...td, fontWeight: 700 }}>{v.site}</td>
          </tr>
          <tr>
            <td style={{ ...td, color: "#6b7280", fontSize: 10.5 }}>Payment mode</td>
            <td style={td}>{cap(v.pay_mode)}{v.payment_ref ? ` · ${v.payment_ref}` : ""}</td>
            <td style={{ ...td, color: "#6b7280", fontSize: 10.5 }}>Payment status</td>
            <td style={{ ...td, fontWeight: 700, color: unpaid ? "#b45309" : "#15803d" }}>
              {unpaid ? "PENDING" : `PAID ${d(v.paid_on)}`}
            </td>
          </tr>
          <tr>
            <td style={{ ...td, color: "#6b7280", fontSize: 10.5 }}>Raised by</td>
            <td style={td}>{v.raisedBy}</td>
            <td style={{ ...td, color: "#6b7280", fontSize: 10.5 }}>Approval</td>
            <td style={{ ...td, textTransform: "capitalize" }}>{v.status}</td>
          </tr>
        </tbody>
      </table>

      {v.items.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
          <thead><tr>
            <th style={{ ...th, width: 34 }}>#</th><th style={th}>Item / material</th>
            <th style={{ ...th, textAlign: "right" }}>Qty</th><th style={th}>Unit</th>
            <th style={{ ...th, textAlign: "right" }}>Rate</th><th style={{ ...th, textAlign: "right" }}>Amount</th>
          </tr></thead>
          <tbody>
            {v.items.map((l, i) => (
              <tr key={i}>
                <td style={td}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 600 }}>{l.item_name}</td>
                <td style={{ ...td, textAlign: "right" }}>{l.qty ?? "—"}</td>
                <td style={td}>{l.unit || "—"}</td>
                <td style={{ ...td, textAlign: "right" }}>{l.rate != null ? inr(l.rate) : "—"}</td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{inr(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ marginTop: 16, border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
          <div className="muted" style={{ fontSize: 10.5 }}>Particulars</div>
          <div style={{ fontSize: 12.5 }}>{v.note || "—"}</div>
        </div>
      )}

      {v.items.length > 0 && v.note && (
        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Purchased: {v.note}</div>
      )}
      {v.remarks && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Remarks: {v.remarks}</div>}

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11.5 }}>
          <span className="muted" style={{ fontSize: 10.5 }}>Amount in words</span>
          <div style={{ fontWeight: 700, fontStyle: "italic", color: NAVY }}>{amountInWords(v.amount)}</div>
        </div>
        <div style={{ background: "#fff4e5", border: "1px solid #fdba74", borderRadius: 8, padding: "10px 18px", display: "flex", gap: 24, alignItems: "center" }}>
          <span style={{ fontWeight: 800, fontSize: 13, color: NAVY }}>TOTAL</span>
          <span style={{ fontWeight: 800, fontSize: 19, color: NAVY }}>{inr(v.amount)}</span>
        </div>
      </div>

      <div className="sign-row" style={{ display: "flex", justifyContent: "space-between", gap: 30, marginTop: 46, fontSize: 12 }}>
        {["Prepared by", "Approved by", "Received by (vendor)"].map(l => (
          <div key={l} style={{ flex: 1 }}>
            <div style={{ borderTop: "1px solid #333", paddingTop: 4, marginTop: 34, fontStyle: "italic", color: "#374151" }}>{l}</div>
          </div>
        ))}
      </div>

      </div>{/* end voucherRef */}

      {/* update458: attachments listed on the voucher page; the bills themselves follow on their own A4 pages */}
      {v.bills?.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 11.5, color: "#374151" }}>
          <b style={{ color: NAVY }}>Attached bills:</b> {v.bills.length} file(s) — {billUrls.map((b, i) => `Bill ${i + 1} (${b.pdf ? "PDF" : "image"})`).join(", ")}. See the pages that follow.
        </div>)}
      <div style={{ marginTop: 28, paddingTop: 8, borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 9.5, fontWeight: 700, color: "#4b5563", lineHeight: 1.7 }}>
        <div>CIN No: {c.cin} &nbsp; GSTIN: {c.gstin}</div>
        <div>Email ID: {c.email}</div>
        <div style={{ fontWeight: 400, color: "#9ca3af", marginTop: 4 }}>
          Direct purchase — no purchase order was raised. Recorded as a company expense against {v.site}. Printed {new Date().toLocaleDateString("en-IN")}.
        </div>
      </div>

      </div>{/* end voucher-page */}

      <BillPages bills={billUrls} heading={"Attached bills · Direct Vendor Payment " + v.voucher_no} accent={NAVY} footer={c.name + " · " + v.voucher_no + " · " + v.vendor} />
    </div>
  );
}
