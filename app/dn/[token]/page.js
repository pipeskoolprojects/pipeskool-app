// update480: PUBLIC, read-only Delivery Note — no login, nothing else from the app. Served only while the link is
// live (30 days, revocable). Headers (noindex, no-store) come from next.config.js for /dn/*. Rate-limited per IP.
import { headers } from "next/headers";
import DnDoc, { DN_CSS } from "@/components/DnDoc";
import { publicNote, logOpen, rateLimited } from "@/lib/server/dn";
import { safeFileName, DN_LINK_DAYS } from "@/lib/dnModel";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export const metadata = { title: "Delivery Note", robots: { index: false, follow: false } };

const PAGE_CSS = `
body{margin:0;background:#e6e9ef;font-family:Segoe UI,system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif}
.dnpub{max-width:834px;margin:0 auto;padding:16px 16px 92px}
.dnbar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:0 0 12px;font-size:13px;color:#3a4350;flex-wrap:wrap}
.dnbtn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:12px;background:#f47b20;color:#fff;font-weight:700;text-decoration:none;font-size:15px}
.dnwrap{overflow:hidden;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.14);background:#fff}
.dnfix{position:fixed;left:12px;right:12px;bottom:12px;display:none}
.dnmsg{max-width:520px;margin:60px auto;background:#fff;border-radius:14px;padding:28px;text-align:center;font-size:15px;color:#3a4350;box-shadow:0 6px 24px rgba(0,0,0,.1)}
@media(max-width:860px){.dnfix{display:block}.dnfix .dnbtn{width:100%}.dnbar .top{display:none}}
@media print{.dnbar,.dnfix{display:none}.dnpub{padding:0;max-width:none}.dnwrap{box-shadow:none;border-radius:0;overflow:visible}body{background:#fff}}
`;
// scale the 794 px sheet to the viewport width without horizontal scrolling — tiny inline script, no library, no tracker
const FIT_JS = "(function(){function f(){var w=document.querySelector('.dnwrap'),s=document.querySelector('.dnsheet');if(!w||!s)return;s.style.transform='none';var W=w.clientWidth,k=Math.min(1,W/794);s.style.transform='scale('+k+')';w.style.height=(s.offsetHeight*k)+'px';}addEventListener('resize',f);addEventListener('load',f);f();})();";

export default async function Page({ params }) {
  const h = headers(); const ip = (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "0.0.0.0";
  const shell = (body) => (<><style dangerouslySetInnerHTML={{ __html: PAGE_CSS + DN_CSS }} />{body}</>);   // the root layout supplies html/body; app chrome stays off this route
  if (rateLimited(ip)) return shell(<div className="dnmsg">Too many requests — please try again in a minute.</div>);
  const r = await publicNote(params.token);
  if (r.status !== "ok") return shell(<div className="dnmsg"><b style={{ fontSize: 18, display: "block", marginBottom: 8 }}>This delivery note link is no longer available</b>{r.status === "expired" ? `Links work for ${DN_LINK_DAYS} days. ` : r.status === "revoked" ? "It was disabled by Pipeskool. " : ""}Please ask Pipeskool Projects for a fresh link.</div>);
  await logOpen(r.link);
  const pdfHref = `/dn/${params.token}/pdf`;
  return shell(<div className="dnpub">
    <div className="dnbar"><span>Delivery Note <b>{r.note.no}</b> · Pipeskool Projects Pvt. Ltd.</span><a className="dnbtn top" href={pdfHref} download={safeFileName(r.note.no)}>Download PDF</a></div>
    <div className="dnwrap"><DnDoc note={r.note} /></div>
    <div className="dnfix"><a className="dnbtn" href={pdfHref} download={safeFileName(r.note.no)}>Download PDF</a></div>
    <script dangerouslySetInnerHTML={{ __html: FIT_JS }} />
  </div>);
}
