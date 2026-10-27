"use client";
// update480: /stock/challans/send?id=… — the Delivery Note preview (new design, no vendor) with the "Send to site" panel.
// Desktop: two columns (sticky panel on the right). Phone / tablet: one column, fixed "Send to site" button that
// scrolls to the panel. The same DnDoc renders the print view and the public link page.
import "@/app/stock/challans/dn.css";
import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import DnDoc, { DN_CSS, DN_SHEET_PX } from "@/components/DnDoc";
import DnSendPanel from "@/components/DnSendPanel";
import { getDeliveryChallans, getHsnMap } from "@/lib/challan";
import { noteFromChallan } from "@/lib/dnModel";
import { getSession, hasAdminCap } from "@/lib/auth";

function SendView() {
  const params = useSearchParams(); const id = Number(params.get("id"));
  const [dc, setDc] = useState(null); const [note, setNote] = useState(null); const [err, setErr] = useState(""); const [session, setSession] = useState(null);
  const [toast, setToast] = useState(""); const [atPanel, setAtPanel] = useState(false);
  const wrap = useRef(null), sheet = useRef(null), panelRef = useRef(null), toastT = useRef(0);
  useEffect(() => { const s = getSession(); if (!s) { window.location.replace("/login"); return; } setSession(s); }, []);
  useEffect(() => {
    if (!id) { setErr("Open this page from the Delivery Challans register."); return; }
    getDeliveryChallans().then(async all => { const d = all.find(x => x.id === id); if (!d) { setErr("Challan not found."); return; } const hsn = await getHsnMap(d.lines.map(l => l.item_id)); setDc(d); setNote(noteFromChallan(d, hsn)); }).catch(e => setErr(e.message));
  }, [id]);
  // scale the A4 sheet to the available width (no horizontal scroll on phones)
  useEffect(() => {
    const fit = () => { const w = wrap.current, s = w && w.querySelector(".dnsheet"); if (!w || !s) return; const W = w.clientWidth, k = Math.min(1, W / DN_SHEET_PX); s.style.transform = `scale(${k})`; w.style.height = s.offsetHeight * k + "px"; };
    fit(); const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null; if (ro && wrap.current) ro.observe(wrap.current); addEventListener("resize", fit);
    return () => { ro && ro.disconnect(); removeEventListener("resize", fit); };
  }, [note]);
  useEffect(() => { const io = typeof IntersectionObserver !== "undefined" && panelRef.current ? new IntersectionObserver(e => setAtPanel(e[0].isIntersecting), { threshold: 0.2 }) : null; if (io) io.observe(panelRef.current); return () => io && io.disconnect(); }, [note]);
  const say = m => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(""), 2800); };
  const canSend = hasAdminCap(session, "challan.send");
  useEffect(() => { if (note) { const prev = document.title; document.title = `Delivery Note ${note.no}`; return () => { document.title = prev; }; } }, [note]);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main dnx" id="dn-root">
        <style>{DN_CSS}</style>
        <div className="page-head dn-head"><h1>Delivery Note{note ? " · " + note.no : ""}</h1><a href="/stock/challans">← Delivery challans</a></div>
        {err && <div className="demo-banner" style={{ background: "#fdecea", color: "var(--red)" }}>⚠ {err}</div>}
        {!err && !note && <div className="muted">Preparing the delivery note…</div>}
        {note && (
          <div className="dn-layout">
            <div>
              <div className="dn-tools no-print"><button type="button" onClick={() => window.print()}>🖨 Print / Save as PDF</button><a href={"/stock/dc-print?ids=" + dc.id} target="_blank" rel="noreferrer"><button type="button">Open print view</button></a><span className="muted" style={{ fontSize: 12 }}>{dc.lines.length} item{dc.lines.length === 1 ? "" : "s"} · {dc.site}{dc.po_no ? " · " + dc.po_no : ""}</span></div>
              <div className="dn-wrap" ref={wrap}><div ref={sheet}><DnDoc note={note} /></div></div>
            </div>
            <div ref={panelRef}><DnSendPanel dc={dc} note={note} canSend={canSend} onToast={say} /></div>
          </div>
        )}
        {note && <button type="button" className={"fab " + (atPanel ? "hide" : "")} onClick={() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>Send to site</button>}
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    </div>
  );
}
export default function Page() { return <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}><SendView /></Suspense>; }
