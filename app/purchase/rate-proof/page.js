"use client";
// update254: RATE COMPARISON PROOF SHEET — a separate reference document.
// Deliberately NOT part of the purchase order: the PO is the commercial document sent to the
// vendor, and the quotation evidence is internal, for rate matching and audit only. Printing
// them apart keeps the PO exactly as it was.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { getSession } from "@/lib/auth";
import { getIndentProofSheet } from "@/lib/procure";
import { billUrl, isPdf } from "@/lib/bills";

const dmy = s => { const p = String(s || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s || ""; };

function Sheet() {
  const params = useSearchParams();
  const indentId = params.get("indent");
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    if (!indentId) { setErr("No indent selected."); return; }
    getIndentProofSheet(indentId).then(r => r ? setD(r) : setErr("That indent was not found."))
      .catch(e => setErr(e?.message || String(e)));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div style={{ margin: 40, fontFamily: "system-ui" }}>{err}</div>;
  if (!d) return <div style={{ margin: 40, fontFamily: "system-ui" }}>Loading…</div>;

  // one proof per page when there is a single image (it gets the full sheet), 2-up otherwise
  const perPage = d.proofs.length <= 1 ? 1 : 4;
  const pages = [];
  for (let i = 0; i < d.proofs.length; i += perPage) pages.push(d.proofs.slice(i, i + perPage));

  return (
    <div style={{ fontFamily: "system-ui", color: "#0F1419", background: "#fff" }}>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { .no-print { display: none !important; } }
        .sheet { max-width: 186mm; margin: 0 auto; }
        .pbreak { break-before: page; page-break-before: always; }
        .pgrid { display: grid; gap: 8mm; }
        .pgrid.one { grid-template-columns: 1fr; }
        .pgrid.many { grid-template-columns: 1fr 1fr; }
        .pbox { border: 1px solid #c9d4e6; border-radius: 6px; padding: 6px; break-inside: avoid; page-break-inside: avoid; }
        /* contain, never cover — a cropped quotation is useless as evidence */
        .pbox img { width: 100%; height: auto; max-height: 105mm; object-fit: contain; display: block; }
        .pgrid.one .pbox img { max-height: 200mm; }
      `}</style>

      <div className="no-print" style={{ display: "flex", gap: 8, padding: "14px 20px", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => window.print()} style={{ fontWeight: 700 }}>🖨 Print / Save as PDF</button>
        <button onClick={() => window.close()}>Close</button>
        <span className="muted" style={{ fontSize: 12 }}>{d.proofs.length} proof(s) · {pages.length} page(s)</span>
      </div>

      <div className="sheet">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ paddingTop: 2 }}><Logo height={24} /></div>
          <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>PIPESKOOL PROJECTS PVT. LTD.</div>
            <div style={{ fontSize: 10, color: "#374151", marginTop: 2 }}>
              102, Darshak, Opp. Shrey Hospital, Punjabi Hall Lane, Navrangpura, Ahmedabad</div>
          </div>
          <div style={{ border: "2px solid #123a7a", borderRadius: 4, padding: "7px 11px", textAlign: "center",
            fontSize: 11, fontWeight: 800, color: "#123a7a", lineHeight: 1.25, whiteSpace: "nowrap" }}>
            RATE<br />COMPARISON<br />PROOF</div>
        </div>

        <div style={{ display: "flex", gap: 26, marginTop: 14, paddingTop: 10, borderTop: "1px solid #d6ddea", fontSize: 12 }}>
          <span><span style={{ color: "#6b7280" }}>Indent: </span><b>{d.indentNo}</b></span>
          <span><span style={{ color: "#6b7280" }}>Site: </span><b>{d.site || "—"}</b></span>
          <span><span style={{ color: "#6b7280" }}>Date: </span><b>{dmy(d.date)}</b></span>
        </div>

        <div style={{ fontSize: 10.5, color: "#6b7280", marginTop: 8, fontStyle: "italic" }}>
          Internal reference only — evidence for the rates quoted against this indent.
          This sheet is not part of the purchase order and is not sent to the vendor.
        </div>

        {d.proofs.length === 0
          ? <div style={{ marginTop: 24, textAlign: "center", color: "#6b7280", fontSize: 12.5 }}>
              No rate-comparison proof was attached to this indent.</div>
          : pages.map((group, gi) => (
              <div key={gi} className={gi === 0 ? "" : "pbreak"} style={{ marginTop: 14 }}>
                {gi > 0 && <div style={{ textAlign: "center", fontWeight: 800, color: "#123a7a", fontSize: 12, marginBottom: 10 }}>
                  {d.indentNo} · proofs continued ({gi * perPage + 1}–{gi * perPage + group.length} of {d.proofs.length})
                </div>}
                <div className={"pgrid " + (perPage === 1 ? "one" : "many")}>
                  {group.map((pr, i) => {
                    const n = gi * perPage + i + 1;
                    return (
                      <div key={pr.id} className="pbox">
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#123a7a", marginBottom: 4 }}>
                          {n}. {pr.vendor_name || "Vendor quotation"}{pr.note ? " · " + pr.note : ""}
                        </div>
                        {isPdf(pr.path)
                          ? <div style={{ fontSize: 11, padding: "18px 10px", textAlign: "center", background: "#f7f9fc", borderRadius: 4 }}>
                              PDF quotation — printed separately.<br />
                              <a href={billUrl(pr.path)} target="_blank" rel="noreferrer" style={{ fontSize: 10.5 }}>{String(pr.path).split("/").pop()}</a>
                            </div>
                          : <img src={billUrl(pr.path)} alt={"Proof " + n} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

        <div style={{ textAlign: "center", fontSize: 10, color: "#6b7280", marginTop: 18 }}>
          Pipeskool Site Management Software · rate-matching reference
        </div>
      </div>
    </div>
  );
}

export default function RateProofPage() {
  return <Suspense fallback={<div style={{ margin: 40, fontFamily: "system-ui" }}>Loading…</div>}><Sheet /></Suspense>;
}
