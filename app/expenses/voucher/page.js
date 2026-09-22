"use client";
// update247: CASH VOUCHER — print-ready A4, same pattern as the DC and RTV prints
// (browser Print → Save as PDF, which is why it works identically on Web and Android).
//
// LAYOUT RULES (Director, 27 Aug):
//   voucher at the top of page 1, proofs BELOW it
//   1 proof  -> fills the space it has
//   2+       -> a proportional grid, never cropped
//   overflow -> flows onto the next A4 page, nothing cut and nothing overlapping
// Proofs are `object-fit: contain` inside a fixed box, so the whole bill is always visible;
// they are never `cover`, which is what would crop them.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import { getSession } from "@/lib/auth";
import { getVoucher } from "@/lib/voucher";

const inr2 = n => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = s => { const p = String(s || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s || ""; };

function Voucher() {
  const params = useSearchParams();
  const ids = (params.get("ids") || "").split(",").map(x => x.trim()).filter(Boolean);
  const [v, setV] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    if (!ids.length) { setErr("No expenses selected."); return; }
    getVoucher(ids).then(r => r ? setV(r) : setErr("Those expenses were not found."))
      .catch(e => setErr(e?.message || String(e)));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div style={{ margin: 40, fontFamily: "system-ui" }}>{err}</div>;
  if (!v) return <div style={{ margin: 40, fontFamily: "system-ui" }}>Loading voucher…</div>;

  // proofs per page: 1 alone gets the full width, 2 side by side, 3+ in a 2-up grid.
  const perPage = v.proofs.length <= 1 ? 1 : 4;
  const pages = [];
  for (let i = 0; i < v.proofs.length; i += perPage) pages.push(v.proofs.slice(i, i + perPage));

  const L = { fontSize: 11.5, fontWeight: 700, color: "#123a7a", whiteSpace: "nowrap" };
  const F = { borderBottom: "1px solid #123a7a", padding: "2px 6px 3px", fontSize: 12.5, minHeight: 18 };

  return (
    <div style={{ fontFamily: "system-ui", color: "#0F1419", background: "#fff" }}>
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { .no-print { display: none !important; } body { background: #fff; } }
        .sheet { max-width: 186mm; margin: 0 auto; }
        .pbreak { break-before: page; page-break-before: always; }
        .proofgrid { display: grid; gap: 8mm; }
        .proofgrid.one { grid-template-columns: 1fr; }
        .proofgrid.many { grid-template-columns: 1fr 1fr; }
        .proofbox { border: 1px solid #c9d4e6; border-radius: 6px; padding: 6px; break-inside: avoid; page-break-inside: avoid; }
        /* contain, never cover — a cropped bill is the one thing this must never do */
        .proofbox img { width: 100%; height: auto; max-height: 105mm; object-fit: contain; display: block; }
        .proofgrid.one .proofbox img { max-height: 150mm; }
        table { border-collapse: collapse; width: 100%; }
        /* update268: diagonal NOT APPROVED watermark — prints on EVERY page (fixed), never covers data (low opacity) */
        .wm { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 5; }
        .wm span { transform: rotate(-30deg); font-size: 84px; font-weight: 900; letter-spacing: 6px; white-space: nowrap; color: rgba(220,38,38,0.12); }
        @media print { .wm { display: flex !important; } .wm span { color: rgba(220,38,38,0.16); } }
      `}</style>
      {v.notApproved > 0 && <div className="wm"><span>NOT APPROVED</span></div>}{/* update268 */}

      <div className="no-print" style={{ display: "flex", gap: 8, padding: "14px 20px", alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => window.print()} style={{ fontWeight: 700 }}>🖨 Print / Save as PDF</button>
        <button onClick={() => window.close()}>Close</button>
        <span className="muted" style={{ fontSize: 12 }}>{v.proofs.length} proof(s) · {pages.length || 0} proof page(s)</span>
        {v.notApproved > 0 && <span style={{ fontSize: 12, color: "#b45309", fontWeight: 700 }}>
          ⚠ {v.notApproved} of these claims is not approved yet</span>}
        {v.mixedClaimants && <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
          ⚠ These claims belong to more than one person — a voucher should cover one payee</span>}
      </div>

      <div className="sheet">
        {v.notApproved > 0 && (   /* update268: printed banner — the toolbar warning above never reached paper */
          <div style={{ border: "2px solid #b91c1c", color: "#b91c1c", background: "#fef2f2", borderRadius: 6, padding: "6px 10px", fontWeight: 800, fontSize: 12, textAlign: "center", marginBottom: 8 }}>
            NOT APPROVED — {v.notApproved} of {v.lines.length} claim(s) on this voucher {v.notApproved === 1 ? "is" : "are"} still pending / under query · not valid for payment
          </div>
        )}
        {/* ---------- header: the official logo component, unmodified ---------- */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ paddingTop: 2 }}><Logo height={26} /></div>
          <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "0.01em" }}>PIPESKOOL PROJECTS PVT. LTD.</div>
            <div style={{ fontSize: 10.5, lineHeight: 1.45, marginTop: 2 }}>
              102, Darshak, Opp Shrey Hospital, Punjabi Hall Lane,<br />Navrangpura, Ahmedabad<br />
              GSTIN: 24AAMCP3389A1ZF &nbsp;|&nbsp; pipeskoolprojects@gmail.com
            </div>
          </div>
          <div style={{ border: "2px solid #123a7a", borderRadius: 4, padding: "8px 14px", textAlign: "center",
            fontSize: 15, fontWeight: 800, color: "#123a7a", lineHeight: 1.15 }}>VOUCHER</div>
        </div>

        {/* ---------- voucher head ---------- */}
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 18, marginTop: 16 }}>
          <div style={{ display: "grid", gap: 9 }}>
            {[["Pay to", v.payTo], ["Rs. in words", v.words], ["Being", v.being], ["and Debit", v.debitTo]].map(([k, val]) => (
              <div key={k} style={{ display: "grid", gridTemplateColumns: "82px 10px 1fr", alignItems: "end" }}>
                <span style={L}>{k}</span><span style={L}>:</span><span style={F}>{val}</span>
              </div>
            ))}
          </div>
          <div>
            {[["Voucher No.", v.no], ["Voucher Date", dmy(v.date)], ["Site", v.site]].map(([k, val]) => (   /* update300 · update413: "Generated" row removed on Director instruction */
              <div key={k} style={{ display: "grid", gridTemplateColumns: "92px 10px 1fr", alignItems: "end", marginBottom: 9 }}>
                <span style={L}>{k}</span><span style={L}>:</span><span style={{ ...F, textAlign: "center" }}>{val}</span>
              </div>
            ))}
            <div style={{ border: "2px solid #123a7a", borderRadius: 4, marginTop: 10, padding: "10px 14px",
              display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: "#123a7a" }}>Rs.</span>
              <span style={{ fontSize: 17, fontWeight: 800 }}>{inr2(v.total)}</span>
            </div>
          </div>
        </div>

        {/* ---------- particulars ---------- */}
        <table style={{ marginTop: 16, border: "1.5px solid #123a7a" }}>
          <thead>
            <tr style={{ background: "#f2f6fc" }}>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 12.5, color: "#123a7a", borderBottom: "1.5px solid #123a7a" }}>Particulars</th>
              <th style={{ textAlign: "right", padding: "8px 12px", fontSize: 12.5, color: "#123a7a", borderBottom: "1.5px solid #123a7a", width: "30%" }}>Amount (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            {v.lines.map(l => (
              <tr key={l.id}>
                <td style={{ padding: "7px 12px", fontSize: 12, borderBottom: "1px solid #e2e8f2" }}>
                  {l.label}{l.paidTo ? ` (${l.paidTo})` : ""}
                  {l.note ? <span style={{ color: "#5b6572" }}> — {l.note}</span> : null}
                  <span style={{ marginLeft: 6, fontSize: 9.5, color: "#5b6572" }}>[{l.source}]</span>
                </td>
                <td style={{ padding: "7px 12px", fontSize: 12, textAlign: "right", borderBottom: "1px solid #e2e8f2" }}>{inr2(l.amount)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "9px 12px", fontSize: 13, fontWeight: 800, textAlign: "right", borderTop: "1.5px solid #123a7a" }}>Total</td>
              <td style={{ padding: "9px 12px", fontSize: 13.5, fontWeight: 800, textAlign: "right", borderTop: "1.5px solid #123a7a" }}>{inr2(v.total)}</td>
            </tr>
          </tbody>
        </table>

        {/* ---------- signatures ---------- */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 20 }}>
          <div>
            <div style={{ fontStyle: "italic", fontWeight: 700, color: "#123a7a", fontSize: 12.5 }}>Authorised By</div>
            <div style={{ borderBottom: "1px solid #0F1419", marginTop: 26, width: "72%" }} />
            {v.approvedBy && <div style={{ fontWeight: 700, fontSize: 12.5, marginTop: 3 }}>{v.approvedBy} <span style={{ fontWeight: 400, color: "#555" }}>(Approved)</span></div>}{/* update284: the actual approver, never hardcoded */}
            {/* update252: the printed payment mode is fixed to Bank. The empty "Drawn on
                Bank —" cell is gone. The internal source is still on the document: "and Debit"
                reads Petty Cash / Own pocket, and every particulars line keeps its [Petty] /
                [Own] marker. */}
            <div style={{ display: "flex", marginTop: 14, border: "1px solid #123a7a", borderRadius: 3, fontSize: 12 }}>
              <span style={{ padding: "6px 10px", fontStyle: "italic", fontWeight: 700, color: "#123a7a", borderRight: "1px solid #123a7a" }}>Paid by</span>
              <span style={{ padding: "6px 16px", fontWeight: 700 }}>Bank</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontStyle: "italic", fontWeight: 700, color: "#123a7a", fontSize: 12.5 }}>
              Received above sum of Rs. <span style={{ borderBottom: "1px solid #0F1419", padding: "0 26px", fontStyle: "normal", fontWeight: 700 }}>{inr2(v.total)}</span>
            </div>
            <div style={{ marginTop: 40, fontSize: 11.5, color: "#123a7a" }}>
              ......................................<br />
              <span style={{ fontStyle: "italic", fontWeight: 700 }}>Receiver&apos;s Signature</span>
            </div>
          </div>
        </div>

        {/* ---------- proofs ---------- */}
        {v.proofs.length > 0 && (
          <div style={{ marginTop: 22, borderTop: "2px dotted #123a7a", paddingTop: 14 }}>
            <div style={{ textAlign: "center", fontWeight: 800, color: "#123a7a", fontSize: 12.5, marginBottom: 10 }}>
              BILLS / PROOFS ATTACHED ({v.proofs.length})
            </div>
            {pages.map((group, gi) => (
              <div key={gi} className={gi === 0 ? "" : "pbreak"}>
                {gi > 0 && <div style={{ textAlign: "center", fontWeight: 800, color: "#123a7a", fontSize: 12, marginBottom: 10 }}>
                  {v.no} · proofs continued ({gi * perPage + 1}–{gi * perPage + group.length} of {v.proofs.length})
                </div>}
                <div className={"proofgrid " + (perPage === 1 ? "one" : "many")}>
                  {group.map((p, i) => {
                    const n = gi * perPage + i + 1;
                    return (
                      <div key={p.path + i} className="proofbox">
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#123a7a", marginBottom: 4 }}>
                          {n}. {p.label}{p.paidTo ? ` (${p.paidTo})` : ""} · ₹{inr2(p.amount)}
                        </div>
                        {p.isPdf
                          ? <div style={{ fontSize: 11, padding: "18px 10px", textAlign: "center", background: "#f7f9fc", borderRadius: 4 }}>
                              PDF bill — printed separately.<br />
                              <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5 }}>{p.path.split("/").pop()}</a>
                            </div>
                          : <img src={p.url} alt={"Proof " + n} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: "center", fontSize: 10.5, fontStyle: "italic", color: "#123a7a", marginTop: 16 }}>
          This is a system generated voucher. No signature required.
        </div>
      </div>
    </div>
  );
}

export default function VoucherPage() {
  return <Suspense fallback={<div style={{ margin: 40, fontFamily: "system-ui" }}>Loading…</div>}><Voucher /></Suspense>;
}
