"use client";
// update223: Tally-format Delivery Note (quantity only, no pricing)
// update215: DELIVERY CHALLAN document — ?ids=1,2,3 prints one or many
// (each on its own A4 page). Same header style as PO / RTV / voucher documents.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDeliveryChallans, getHsnMap } from "@/lib/challan";
import DnDoc, { DN_CSS } from "@/components/DnDoc";   // update480: the redesigned note (no vendor), shared with Send to site and the public link
import { noteFromChallan } from "@/lib/dnModel";

function DcPrint() {
  const params = useSearchParams();
  const ids = (params.get("ids") || "").split(",").map(Number).filter(Boolean);
  const [docs, setDocs] = useState(null);
  useEffect(() => {
    if (!getSession()) { window.location.replace("/login"); return; }
    getDeliveryChallans().then(async all => {
      const mine = all.filter(d => ids.includes(d.id));
      // update223: HSN codes from Item Master for the printed lines (no FK — separate lookup) · update454: shared helper
      setDocs({ list: mine, hsn: await getHsnMap(mine.flatMap(d => d.lines.map(l => l.item_id))) });
    });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!docs) return <div style={{ margin: 40, fontFamily: "system-ui" }}>Preparing document…</div>;
  if (!docs.list.length) return <div style={{ margin: 40, fontFamily: "system-ui" }}>No challans found for this link.</div>;
  return (
    <div style={{ fontFamily: "system-ui", background: "#fff" }}>
      <style>{DN_CSS}</style>
      <style>{`@media print { .no-print { display: none !important; } .dcp-page { page-break-after: always; break-after: page; } } .dcp-page { margin: 0 auto 24px; width: 794px; max-width: 100%; }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, padding: 14, maxWidth: 780, margin: "0 auto" }}>
        <button onClick={() => window.print()} style={{ fontWeight: 700 }}>🖨 Print / Save as PDF{docs.list.length > 1 ? ` (${docs.list.length} challans)` : ""}</button>
        <button onClick={() => window.close()}>Close</button>
        {docs.list.length === 1 && <a href={"/stock/challans/send?id=" + docs.list[0].id}><button type="button">Send to site</button></a>}{/* update480 */}
      </div>
      {docs.list.map(d => <div key={d.id} className="dcp-page"><DnDoc note={noteFromChallan(d, docs.hsn)} /></div>)}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div style={{ margin: 40 }}>Loading…</div>}><DcPrint /></Suspense>;
}
