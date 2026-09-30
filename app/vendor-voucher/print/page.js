"use client";
// update355: LOCAL PURCHASE VOUCHER — A4, Print -> Save as PDF, on the company letterhead,
// in the same style as the expense and advance vouchers. Reads the stored row; computes
// nothing.
import { useEffect, useRef, useState } from "react";
import BillSheet from "@/components/BillSheet";   // update447: shared A4 bill layout
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
  const voucherRef = useRef(null);   // update447: measured so bills fit under the voucher on page 1

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

  if (err) return <div style={{ padding: 24 }}><div className="error" style={{ whiteSpace: "pre-wrap" }}>{err}</div></div>;
  if (!v || !c) return <div style={{ padding: 24 }} className="muted">Loading…</div>;

  const th = { fontSize: 10.5, textAlign: "left", padding: "6px 8px", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb" };
  const td = { fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #f0f1f3" };
  const unpaid = v.payment_status !== "paid";

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 28, background: "#fff", color: "#111", fontFamily: "Inter, Arial, sans-serif", minHeight: "100vh", position: "relative" }}>
      <style>{`
        @media print {
          .no-print { display:none !important; }
          body { background:#fff; }
          @page { size: A4; margin: 12mm; }
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
        <button className="primary" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <button onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/vendor-voucher"); }}>← Back</button>
      </div>

      <div ref={voucherRef}>{/* update447: everything measured for the bill layout */}
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

      {/* update447: bills auto-fitted to A4 (1 full / 2 side by side / 3 two-up + one across / 4 grid / 5+ overflow pages) */}
      <BillSheet bills={billUrls.map((b, i) => ({ url: b.url, pdf: b.pdf, label: "Bill " + (i + 1) + " · " + v.voucher_no }))}
        voucherRef={voucherRef} heading="Attached bill / receipt" accent={NAVY} footer={c.name + " · Direct Vendor Payment " + v.voucher_no} />

      <div style={{ marginTop: 28, paddingTop: 8, borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 9.5, fontWeight: 700, color: "#4b5563", lineHeight: 1.7 }}>
        <div>CIN No: {c.cin} &nbsp; GSTIN: {c.gstin}</div>
        <div>Email ID: {c.email}</div>
        <div style={{ fontWeight: 400, color: "#9ca3af", marginTop: 4 }}>
          Direct purchase — no purchase order was raised. Recorded as a company expense against {v.site}. Printed {new Date().toLocaleDateString("en-IN")}.
        </div>
      </div>
    </div>
  );
}
