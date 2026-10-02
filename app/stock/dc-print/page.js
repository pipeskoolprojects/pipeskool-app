"use client";
// update223: Tally-format Delivery Note (quantity only, no pricing)
// update215: DELIVERY CHALLAN document — ?ids=1,2,3 prints one or many
// (each on its own A4 page). Same header style as PO / RTV / voucher documents.
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDeliveryChallans, getHsnMap } from "@/lib/challan";
import DcDoc from "@/components/DcDoc";   // update454: shared with the send box

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
      <style>{`@media print { .no-print { display: none !important; } } @page { size: A4; margin: 12mm; }`}</style>
      <div className="no-print" style={{ display: "flex", gap: 8, padding: 14, maxWidth: 780, margin: "0 auto" }}>
        <button onClick={() => window.print()} style={{ fontWeight: 700 }}>🖨 Print / Save as PDF{docs.list.length > 1 ? ` (${docs.list.length} challans)` : ""}</button>
        <button onClick={() => window.close()}>Close</button>
      </div>
      {docs.list.map(d => <DcDoc key={d.id} d={d} hsn={docs.hsn} />)}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div style={{ margin: 40 }}>Loading…</div>}><DcPrint /></Suspense>;
}
