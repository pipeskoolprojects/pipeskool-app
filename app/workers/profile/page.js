"use client";
// update336: EMPLOYEE FULL DETAILS — A4 sheet, Print -> Save as PDF.
//
// Same pattern as every other Pipeskool document (/letters/print, vouchers, wages): a
// letterhead page rendered in the browser, then Print -> Save as PDF. That works on Android
// through the share sheet and needs no PDF library, so there is nothing new to break.
//
// Everything on this page is READ from the worker record. Nothing is computed or inferred —
// a field with no value prints an em dash rather than a guess.
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { supabase, isDemo } from "@/lib/supabase";
import { getCompany, fmtDate } from "@/lib/letters";

const NAVY = "#1f2a4b";
const ORANGE = "#FF7A1A";

function cap(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, " ") : ""; }
const dash = v => (v === null || v === undefined || String(v).trim() === "") ? "—" : String(v);

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 18, breakInside: "avoid" }}>
      <div style={{ fontWeight: 800, fontSize: 11.5, letterSpacing: "0.06em", color: NAVY,
                    borderBottom: "1.5px solid " + ORANGE, paddingBottom: 4, marginBottom: 8 }}>
        {title.toUpperCase()}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}><tbody>{children}</tbody></table>
    </div>
  );
}
function Row({ a, av, b, bv }) {
  const lb = { fontSize: 10, color: "#6b7280", padding: "3px 8px 3px 0", width: "17%", verticalAlign: "top" };
  const vl = { fontSize: 12, color: "#111", padding: "3px 16px 3px 0", width: "33%", fontWeight: 600, verticalAlign: "top" };
  return (
    <tr>
      <td style={lb}>{a}</td><td style={vl}>{dash(av)}</td>
      <td style={lb}>{b || ""}</td><td style={vl}>{b ? dash(bv) : ""}</td>
    </tr>
  );
}
function Wide({ a, av }) {
  return (
    <tr>
      <td style={{ fontSize: 10, color: "#6b7280", padding: "3px 8px 3px 0", width: "17%", verticalAlign: "top" }}>{a}</td>
      <td colSpan={3} style={{ fontSize: 12, color: "#111", padding: "3px 0", fontWeight: 600 }}>{dash(av)}</td>
    </tr>
  );
}

export default function WorkerProfilePrint() {
  const [w, setW] = useState(null);
  const [sitesAllotted, setSitesAllotted] = useState([]);
  const [c, setC] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const id = sp.get("id");
        const isStaff = sp.get("staff") === "1";   // update360: the same sheet serves both masters
        if (!id) { setErr("No employee selected."); return; }
        if (isDemo) { setErr("Not available in demo mode."); return; }

        if (isStaff) {
          const [{ data: u, error: e2 }, comp2] = await Promise.all([
            supabase.from("app_users")
              .select("id, full_name, mobile, role, monthly_salary, ot_eligible, annual_paid_leaves, joining_date, requires_punch, bank_account_no, bank_ifsc, bank_name, pan_no, aadhaar_doc_url, aadhaar_docs, bank_doc_url, last_working_day, exit_reason, is_active, emergency_name, emergency_relation, emergency_mobile, emergency_alt_mobile, emergency_address")
              .eq("id", id).maybeSingle(),
            getCompany(),
          ]);
          if (e2) throw new Error(e2.message);
          if (!u) { setErr("That staff member was not found, or you do not have rights to open the record."); return; }
          const { data: us } = await supabase.from("user_sites").select("sites(name)").eq("user_id", id);
          setW({ ...u, isStaff: true, category: u.role, labour_type: "staff",
                 daily_wage: null, sites: null, contractors: null });
          setC(comp2);
          setSitesAllotted((us || []).map(x => x.sites?.name).filter(Boolean));
          return;
        }
        const [{ data: row, error }, comp] = await Promise.all([
          supabase.from("workers")
            .select("id, full_name, mobile, category, labour_type, daily_wage, is_active, ot_eligible, proxy_authority, joining_date, last_working_day, exit_reason, bank_account_no, bank_ifsc, bank_name, aadhaar_doc_url, aadhaar_docs, bank_doc_url, emergency_name, emergency_relation, emergency_mobile, emergency_alt_mobile, emergency_address, site_id, sites!workers_site_id_fkey(name), contractors(name)")
            .eq("id", id).maybeSingle(),
          getCompany(),
        ]);
        if (error) throw new Error(error.message);
        if (!row) { setErr("That employee was not found, or you do not have rights to open the record."); return; }
        setW(row); setC(comp);
        const { data: al } = await supabase.from("worker_sites").select("sites(name)").eq("worker_id", id);
        setSitesAllotted((al || []).map(x => x.sites?.name).filter(Boolean));
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  if (err) return <div style={{ padding: 24 }}><div className="error" style={{ whiteSpace: "pre-wrap" }}>{err}</div></div>;
  if (!w || !c) return <div style={{ padding: 24 }} className="muted">Loading…</div>;

  const allSites = [w.sites?.name, ...sitesAllotted].filter(Boolean);
  const uniqueSites = [...new Set(allSites)];
  const kycDone = !!(w.bank_account_no && w.bank_ifsc && w.aadhaar_doc_url);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 28, background: "#fff", color: "#111",
                  fontFamily: "Inter, Arial, sans-serif", minHeight: "100vh" }}>
      <style>{`
        @media print { .kyc-page { break-before: page; page-break-before: always; break-inside: avoid; page-break-inside: avoid; margin-top: 12px; } .no-print { display:none !important; } body { background:#fff; } @page { size: A4; margin: 14mm; } }
        @media screen and (max-width: 640px) { body { font-size: 13px; } }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="primary" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <button onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.assign("/workers"); }}>← Back</button>
      </div>

      {/* letterhead */}
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", borderBottom: "3px solid " + ORANGE, paddingBottom: 10 }}>
        <Logo height={22} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: NAVY }}>{c.name}</div>
          <div style={{ fontSize: 11, color: "#6b7280", fontStyle: "italic", lineHeight: 1.5 }}>{c.address}</div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 18, gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "#6b7280", fontWeight: 700 }}>EMPLOYEE DETAILS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, lineHeight: 1.2 }}>{w.full_name}</div>
          <div style={{ fontSize: 12, color: "#4b5563" }}>{cap(w.category)} · {w.isStaff ? "Staff" : cap(w.labour_type) + " labour"}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800,
            background: w.is_active === false ? "#fde8e8" : "#e8f6ee", color: w.is_active === false ? "#b91c1c" : "#15803d" }}>
            {w.is_active === false ? "INACTIVE" : "ACTIVE"}
          </span>
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>Employee ID: {w.id}</div>
        </div>
      </div>

      <Section title="Personal information">
        <Row a="Full name" av={w.full_name} b="Mobile" bv={w.mobile} />
        <Row a="Category" av={cap(w.category)} b="Labour type" bv={cap(w.labour_type)} />
        <Row a="Contractor" av={w.contractors?.name} b="Employee ID" bv={w.id} />
      </Section>

      <Section title="Engagement">
        <Row a="Joining date" av={fmtDate(w.joining_date)}
             b={w.isStaff ? "Monthly salary" : "Daily wage"}
             bv={w.isStaff
                   ? (w.monthly_salary ? "Rs. " + Number(w.monthly_salary).toLocaleString("en-IN") + " per month" : "")
                   : (w.daily_wage ? "Rs. " + Number(w.daily_wage).toLocaleString("en-IN") + " per day" : "")} />
        <Row a="Last working day" av={fmtDate(w.last_working_day)} b="OT eligible" bv={w.ot_eligible === false ? "No" : "Yes"} />
        <Row a="Reason for exit" av={w.exit_reason}
             b={w.isStaff ? "Paid leaves / yr" : "Proxy authority"}
             bv={w.isStaff ? (w.annual_paid_leaves ?? "—") : (w.proxy_authority ? "Yes" : "No")} />
      </Section>

      <Section title="Site posting">
        {!w.isStaff && <Wide a="Primary site" av={w.sites?.name} />}
        <Wide a={w.isStaff ? "Sites assigned" : "Also allotted to"} av={sitesAllotted.length ? sitesAllotted.join(", ") : "—"} />
        <Wide a="Total sites" av={uniqueSites.length} />
      </Section>

      <Section title="KYC & bank">
        <Row a="Bank account no" av={w.bank_account_no} b="IFSC" bv={w.bank_ifsc} />
        <Row a="Bank name" av={w.bank_name} b={w.isStaff ? "PAN" : "Aadhaar on file"} bv={w.isStaff ? w.pan_no : (((w.aadhaar_docs || []).length || w.aadhaar_doc_url) ? "Yes" : "No")} />
        {/* update374: the two KYC documents. Printed as a row on the sheet, and as tappable
            links in the on-screen version — a printed PDF cannot open a URL, so the row
            simply says "attached" against each one and the sheet is the record. */}
        {/* update377: one link per uploaded Aadhaar file, or the legacy fallback if any */}
        <Row a="Aadhaar on file"
             av={(w.aadhaar_docs || []).length
               ? <>{(w.aadhaar_docs || []).map((u, i) => <a key={u + i} href={u} target="_blank" rel="noreferrer" style={{ color: "var(--copper)", marginRight: 8 }}>file {i + 1}</a>)}</>
               : (w.aadhaar_doc_url ? <a href={w.aadhaar_doc_url} target="_blank" rel="noreferrer" style={{ color: "var(--copper)" }}>view (legacy)</a> : "—")}
             b="Bank doc on file"
             bv={w.bank_doc_url ? <a href={w.bank_doc_url} target="_blank" rel="noreferrer" style={{ color: "var(--copper)" }}>view</a> : "—"} />
      </Section>

      <Section title="Emergency contact">
        <Row a="Contact name" av={w.emergency_name} b="Relationship" bv={w.emergency_relation} />
        <Row a="Mobile" av={w.emergency_mobile} b="Alternate mobile" bv={w.emergency_alt_mobile} />
        <Wide a="Address" av={w.emergency_address} />
      </Section>

      {!w.emergency_mobile && (
        <div style={{ marginTop: 12, background: "#fff7ed", border: "1px solid #fdba74", color: "#9a3412",
                      padding: "8px 12px", borderRadius: 6, fontSize: 11.5 }}>
          No emergency contact is on file for this employee. Please collect it and update the record.
        </div>
      )}

      <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between", gap: 40, fontSize: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1px solid #333", width: 200, paddingTop: 4, marginTop: 34, fontStyle: "italic", color: "#374151" }}>
            {c.signatory_title || "Authorized Signatory"}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ borderTop: "1px solid #333", width: 200, paddingTop: 4, marginTop: 34, fontStyle: "italic", color: "#374151" }}>
            Employee signature
          </div>
        </div>
      </div>

      <div style={{ marginTop: 34, paddingTop: 8, borderTop: "1px solid #e5e7eb", textAlign: "center",
                    fontSize: 9.5, fontWeight: 700, color: "#4b5563", lineHeight: 1.7 }}>
        <div>CIN No: {c.cin} &nbsp; GSTIN: {c.gstin}</div>
        <div>Email ID: {c.email}</div>
        <div style={{ fontWeight: 400, color: "#9ca3af", marginTop: 4 }}>
          Printed {new Date().toLocaleDateString("en-IN")} · this sheet reflects the record at the time of printing
        </div>
      </div>
    
      {/* update379: fixed a JSX inline-comment bug (// on the same line as the gate condition
           made the whole KYC block silently render nothing) — moved the comment above,
           and added a bank passbook page here that never existed on the printed sheet. */}
      {(((w.aadhaar_docs || []).length) || w.aadhaar_doc_url || w.bank_doc_url) && (
        <>
          {(w.aadhaar_docs || []).map((u, i) => {
            const isPdf = /\.pdf(\?|$)/i.test(u);
            return (
              <div key={u + i} className="kyc-page">
                <div style={{ fontSize: 10.5, fontWeight: 800, color: "#1f2a4b", marginBottom: 6 }}>ATTACHED — AADHAAR {i + 1} OF {(w.aadhaar_docs || []).length} · {w.full_name}</div>
                {isPdf
                  ? <iframe title={"aadhaar-" + i} src={u} style={{ width: "100%", height: "245mm", border: "1px solid #e5e7eb" }} />
                  : <img alt={"aadhaar-" + i} src={u} style={{ maxWidth: "100%", maxHeight: "245mm", objectFit: "contain", display: "block", margin: "0 auto", border: "1px solid #e5e7eb" }} />}
              </div>
            );
          })}
          {!(w.aadhaar_docs || []).length && w.aadhaar_doc_url && (
            <div className="kyc-page">
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "#1f2a4b", marginBottom: 6 }}>ATTACHED — AADHAAR (legacy upload) · {w.full_name}</div>
              {/\.pdf(\?|$)/i.test(w.aadhaar_doc_url)
                ? <iframe title="aadhaar-legacy" src={w.aadhaar_doc_url} style={{ width: "100%", height: "245mm", border: "1px solid #e5e7eb" }} />
                : <img alt="aadhaar-legacy" src={w.aadhaar_doc_url} style={{ maxWidth: "100%", maxHeight: "245mm", objectFit: "contain", display: "block", margin: "0 auto", border: "1px solid #e5e7eb" }} />}
            </div>
          )}
          {w.bank_doc_url && (
            <div className="kyc-page">
              <div style={{ fontSize: 10.5, fontWeight: 800, color: "#1f2a4b", marginBottom: 6 }}>ATTACHED — BANK PASSBOOK / CANCELLED CHEQUE · {w.full_name}</div>
              {/\.pdf(\?|$)/i.test(w.bank_doc_url)
                ? <iframe title="bank-doc" src={w.bank_doc_url} style={{ width: "100%", height: "245mm", border: "1px solid #e5e7eb" }} />
                : <img alt="bank-doc" src={w.bank_doc_url} style={{ maxWidth: "100%", maxHeight: "245mm", objectFit: "contain", display: "block", margin: "0 auto", border: "1px solid #e5e7eb" }} />}
            </div>
          )}
        </>
      )}
</div>
  );
}
