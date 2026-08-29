"use client";
// update257: VENDOR FOLLOW-UP REMINDER — a printable letter for one PO.
// Same print-to-PDF mechanism as the vouchers and the DC print, so Web and Android behave
// identically. It reads the live pending figures; it never stores or recalculates anything.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { getSession } from "@/lib/auth";
import { getFollowupDoc } from "@/lib/pending";

const NAVY = "#1a2f5e";
const dmy = s => { const p = String(s || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s || ""; };
const inr2 = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

function Letter() {
  const params = useSearchParams();
  const poId = params.get("po");
  const note = params.get("note") || "";
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    if (!poId) { setErr("No purchase order selected."); return; }
    getFollowupDoc(poId).then(r => r ? setD(r) : setErr("That purchase order was not found."))
      .catch(e => setErr(e?.message || String(e)));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div style={{ margin: 40, fontFamily: "system-ui" }}>{err}</div>;
  if (!d) return <div style={{ margin: 40, fontFamily: "system-ui" }}>Loading…</div>;

  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

  // plain-text version, for WhatsApp and email — the same figures, no formatting to lose
  const asText = [
    `Pipeskool Projects Pvt. Ltd. — pending delivery reminder`,
    `PO ${d.po_no} dated ${dmy(d.po_date)} · Site: ${d.site}`,
    ``,
    ...d.items.map(i => `• ${i.name}: ordered ${i.ordered} ${i.unit}, received ${i.received} ${i.unit}, PENDING ${i.pending} ${i.unit} (${i.days} days)`),
    ``,
    note ? note : `Please confirm the dispatch date for the balance quantity.`,
  ].join("\n");

  const wa = "https://wa.me/?text=" + encodeURIComponent(asText);
  const mail = "mailto:?subject=" + encodeURIComponent("Pending delivery reminder — PO " + d.po_no) +
               "&body=" + encodeURIComponent(asText);

  return (
    <div style={{ fontFamily: "system-ui", color: "#0F1419", background: "#fff" }}>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { .no-print { display: none !important; } }
        .sheet { max-width: 182mm; margin: 0 auto; }
        table { border-collapse: collapse; width: 100%; }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 8, padding: "14px 20px", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => window.print()} style={{ fontWeight: 700 }}>🖨 Print / Save as PDF</button>
        <a href={wa} target="_blank" rel="noreferrer"><button>💬 WhatsApp</button></a>
        <a href={mail}><button>✉ Email</button></a>
        <button onClick={() => { navigator.clipboard?.writeText(asText); }}>📋 Copy text</button>
        <button onClick={() => window.close()}>Close</button>
        <span className="muted" style={{ fontSize: 12 }}>{d.items.length} item(s) pending · oldest {d.oldest} days</span>
      </div>

      <div className="sheet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ borderLeft: "3px solid " + NAVY, paddingLeft: 10 }}><Logo height={26} /></div>
          <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>PIPESKOOL PROJECTS PVT. LTD.</div>
            <div style={{ fontSize: 10, lineHeight: 1.5, marginTop: 2, color: "#374151" }}>
              102, Darshak, Opp. Shrey Hospital, Punjabi Hall Lane, Navrangpura, Ahmedabad<br />
              GSTIN: 24AAMCP3389A1ZF &nbsp;|&nbsp; Email: pipeskoolprojects@gmail.com
            </div>
          </div>
          <div style={{ border: "2px solid " + NAVY, borderRadius: 4, padding: "8px 12px", textAlign: "center",
            fontSize: 11.5, fontWeight: 800, color: NAVY, lineHeight: 1.25, whiteSpace: "nowrap" }}>
            DELIVERY<br />REMINDER</div>
        </div>

        <div style={{ borderTop: "1px solid #d6ddea", margin: "14px 0 16px" }} />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, fontSize: 12 }}>
          <div style={{ display: "grid", gap: 6 }}>
            {[["To", d.vendor], ["PO No.", d.po_no], ["PO date", dmy(d.po_date)], ["Site", d.site]].map(([k, v]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "70px 1fr", gap: 8 }}>
                <span style={{ color: "#6b7280" }}>{k}</span><b>{v || "—"}</b>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Date</div>
            <b>{today}</b>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>Oldest pending</div>
            <b style={{ color: d.oldest >= 15 ? "#b91c1c" : "#b45309" }}>{d.oldest} days</b>
          </div>
        </div>

        <div style={{ fontSize: 12.5, marginTop: 18, lineHeight: 1.6 }}>
          Dear Sir / Madam,<br />
          The following material against our purchase order <b>{d.po_no}</b> is still outstanding.
          We request you to arrange the balance delivery at the earliest and confirm the dispatch schedule.
        </div>

        <table style={{ marginTop: 14, border: "1px solid " + NAVY }}>
          <thead>
            <tr style={{ background: NAVY, color: "#fff" }}>
              <th style={{ textAlign: "left", padding: "7px 10px", fontSize: 11.5 }}>Sr</th>
              <th style={{ textAlign: "left", padding: "7px 10px", fontSize: 11.5 }}>Item</th>
              <th style={{ textAlign: "right", padding: "7px 10px", fontSize: 11.5 }}>Ordered</th>
              <th style={{ textAlign: "right", padding: "7px 10px", fontSize: 11.5 }}>Received</th>
              <th style={{ textAlign: "right", padding: "7px 10px", fontSize: 11.5 }}>Pending</th>
              <th style={{ textAlign: "right", padding: "7px 10px", fontSize: 11.5 }}>Days</th>
            </tr>
          </thead>
          <tbody>
            {d.items.map((i, n) => (
              <tr key={i.name + n} style={{ borderBottom: "1px solid #e3e9f3" }}>
                <td style={{ padding: "7px 10px", fontSize: 12 }}>{n + 1}</td>
                <td style={{ padding: "7px 10px", fontSize: 12 }}>{i.name}</td>
                <td style={{ padding: "7px 10px", fontSize: 12, textAlign: "right" }}>{i.ordered} {i.unit}</td>
                <td style={{ padding: "7px 10px", fontSize: 12, textAlign: "right" }}>{i.received} {i.unit}</td>
                <td style={{ padding: "7px 10px", fontSize: 12, textAlign: "right", fontWeight: 800, color: "#b91c1c" }}>{i.pending} {i.unit}</td>
                <td style={{ padding: "7px 10px", fontSize: 12, textAlign: "right" }}>{i.days}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {note && (
          <div style={{ border: "1px solid #f0c9a4", background: "#fff7ed", borderRadius: 6,
            padding: "10px 14px", marginTop: 14, fontSize: 12.5 }}>
            <b style={{ color: "#b45309" }}>Note: </b>{note}
          </div>
        )}

        <div style={{ fontSize: 12.5, marginTop: 18, lineHeight: 1.6 }}>
          Kindly treat this as urgent. For any clarification on specifications or quantities,
          please contact the undersigned.
        </div>

        <div style={{ marginTop: 34, fontSize: 12 }}>
          For <b>Pipeskool Projects Pvt. Ltd.</b>
          <div style={{ borderTop: "1px solid #0F1419", width: 190, marginTop: 34, paddingTop: 4, fontSize: 11 }}>
            Authorised Signatory
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 9.5, color: "#6b7280", marginTop: 20 }}>
          System generated from the Pending Deliveries register · quantities as recorded against GRNs on {today}
        </div>
      </div>
    </div>
  );
}

export default function FollowupPage() {
  return <Suspense fallback={<div style={{ margin: 40, fontFamily: "system-ui" }}>Loading…</div>}><Letter /></Suspense>;
}
