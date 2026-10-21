"use client";
// update450: ONE company letterhead for every printed document — letters, salary slips, salary
// certificates, the blank sheet and the wages slip. Reads the company.* settings (Company Rules →
// Company details) so one edit there reaches every future document. Issued letters stay frozen in
// their BODY; the letterhead is the company's current identity and is applied at print time.
//
//   <style>{letterheadCss}</style>          — @page A4 + fixed footer rules (print)
//   <Letterhead company={c} />              — logo + name + address + GSTIN/State/CIN + email/mobile + orange rule
//   <LetterFoot company={c} right="…" />    — fixed footer: company line (left) + optional text (right)
//
// The logo is the OFFICIAL artwork (components/Logo) unless Company details carry an uploaded
// logo_url (Director-only upload) — never redrawn, never stretched: rendered at its own aspect.
import Logo from "@/components/Logo";
import { billUrl } from "@/lib/bills";

export const NAVY = "#0F1419", ORANGE = "#FF7A1A";

export const letterheadCss = `
  @page { size: A4; margin: 12mm 14mm 16mm; }
  @media print { .no-print { display: none !important; } body { background: #fff; } }
  .lh-head { display: flex; gap: 16px; align-items: flex-start; border-bottom: 2.5px solid ${ORANGE}; padding-bottom: 9px; }
  .lh-co { font-weight: 900; font-size: 17px; color: ${NAVY}; letter-spacing: .2px; line-height: 1.2; }
  .lh-ad { font-size: 10.5px; color: #374151; line-height: 1.45; margin-top: 2px; }
  .lh-meta { font-size: 10px; color: #4b5563; margin-top: 3px; line-height: 1.5; }
  .lh-meta b { color: ${NAVY}; }
  .lh-foot { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #d1d5db; padding-top: 4px;
             font-size: 9px; color: #6b7280; display: flex; justify-content: space-between; background: #fff; }
  @media screen { .lh-foot { position: static; margin-top: 28px; } }
  .lh-page { page-break-after: always; break-after: page; }
  .lh-page:last-child { page-break-after: auto; break-after: auto; }
`;

export function Letterhead({ company: c, logoSrc = null }) {
  if (!c) return null;
  const logo = c.logo_url ? <img src={logoSrc || billUrl(c.logo_url)} alt="logo" style={{ height: 40, width: "auto", display: "block", marginTop: 2 }} /> : <div style={{ marginTop: 4 }}><Logo height={26} /></div>;
  const meta1 = [c.gstin && <><b>GSTIN/UIN:</b> {c.gstin}</>, (c.state || c.state_code) && <><b>State:</b> {c.state}{c.state_code ? `, Code ${c.state_code}` : ""}</>, c.cin && <><b>CIN:</b> {c.cin}</>].filter(Boolean);
  const meta2 = [c.email && <><b>Email:</b> {c.email}</>, c.mobile && <><b>Mobile:</b> {c.mobile}</>].filter(Boolean);
  const join = arr => arr.map((x, i) => <span key={i}>{i > 0 && <span> &nbsp;·&nbsp; </span>}{x}</span>);
  return (
    <div className="lh-head">
      {logo}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lh-co">{c.name}</div>
        {c.address && <div className="lh-ad">{c.address}</div>}
        {meta1.length > 0 && <div className="lh-meta">{join(meta1)}</div>}
        {meta2.length > 0 && <div className="lh-meta" style={{ marginTop: 0 }}>{join(meta2)}</div>}
      </div>
    </div>
  );
}

export function LetterFoot({ company: c, right }) {
  if (!c) return null;
  const line = c.footer_line || [c.name && titleCase(c.name), c.address && shortAddr(c.address)].filter(Boolean).join(" · ");
  return <div className="lh-foot"><span>{line}</span><span>{right || ""}</span></div>;
}

function titleCase(s) { return String(s).toLowerCase().replace(/\b\w/g, m => m.toUpperCase()).replace(/\bPvt\b/i, "Pvt").replace(/\bLtd\b/i, "Ltd"); }
function shortAddr(a) { const parts = String(a).split(",").map(x => x.trim()).filter(Boolean); return parts.slice(-2).join(", "); }
