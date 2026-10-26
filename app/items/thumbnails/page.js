"use client";
// update478: PO-line pictures — make the small thumbnails for Material Master photos that do not have one yet.
// This is the "backfill": it runs in the browser (the same 96×96 JPEG code the Item Master page uses at upload), one
// picture at a time, 8 s limit each, so a missing or huge original can never block it. Re-runnable: items that already
// have a matching thumbnail are skipped; "Re-make all" redoes every one.
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession, canAnySite } from "@/lib/auth";
import { listThumbTargets, backfillThumbs } from "@/lib/thumbs";
import { supabase, isDemo } from "@/lib/supabase";

export default function ThumbnailsPage() {
  const [session, setSession] = useState(null);
  const [state, setState] = useState(null);   // { items, done, total, error }
  const [prog, setProg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [failed, setFailed] = useState([]);
  useEffect(() => { setSession(getSession()); }, []);
  const allowed = canAnySite(session, "stock", "create") || canAnySite(session, "stock", "manage") || canAnySite(session, "stock", "approve");
  const load = () => listThumbTargets().then(setState);
  useEffect(() => { load(); }, []);

  async function run(force) {
    setBusy(true); setMsg(""); setProg(null);
    let items = state?.items || [];
    if (force && !isDemo) {   // every item with a photo
      const all = []; for (let from = 0; ; from += 1000) { const { data } = await supabase.from("item_master").select("id, display_name, photo_url").not("photo_url", "is", null).order("id").range(from, from + 999); all.push(...(data || [])); if (!data || data.length < 1000) break; }
      items = all;
    }
    const r = await backfillThumbs(items, setProg);
    setBusy(false);
    setMsg(`${r.made} thumbnail${r.made === 1 ? "" : "s"} made${r.failed.length ? `, ${r.failed.length} could not be made (listed below)` : ""}.`);
    setFailed(r.failed); load();
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>PO line pictures — thumbnails</h1></div>
        <div className="card" style={{ maxWidth: 760 }}>
          <p style={{ marginTop: 0 }}>Purchase orders show a small picture next to each line (screen, print and the PDF sent to the vendor). The picture is a 96×96 thumbnail made once from the Material Master photo. Photos uploaded from now on get their thumbnail automatically; this page makes them for photos uploaded earlier.</p>
          {!allowed && session && <div className="demo-banner" style={{ background: "#fdecea", color: "var(--red)" }}>This needs the Material Master right (Stock · Create).</div>}
          {state?.error && <div className="demo-banner" style={{ background: "#fdecea", color: "var(--red)" }}>⚠ {state.error}</div>}
          {state && !state.error && (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", margin: "10px 0 14px" }}>
              <div><div className="muted" style={{ fontSize: 12 }}>Photos in Material Master</div><div style={{ fontSize: 22, fontWeight: 800 }}>{state.total ?? 0}</div></div>
              <div><div className="muted" style={{ fontSize: 12 }}>Thumbnail ready</div><div style={{ fontSize: 22, fontWeight: 800, color: "var(--green, #15803d)" }}>{state.done ?? 0}</div></div>
              <div><div className="muted" style={{ fontSize: 12 }}>Still to make</div><div style={{ fontSize: 22, fontWeight: 800, color: state.items?.length ? "var(--red, #b91c1c)" : "inherit" }}>{state.items?.length ?? 0}</div></div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="primary" disabled={!allowed || busy || !state || !!state.error || !(state.items || []).length} onClick={() => run(false)}>{busy ? "Working…" : `Make ${(state?.items || []).length} thumbnail${(state?.items || []).length === 1 ? "" : "s"}`}</button>
            <button disabled={!allowed || busy || !state || !!state.error || !state.total} onClick={() => { if (window.confirm("Re-make the thumbnail of every photo? Existing ones are replaced.")) run(true); }}>Re-make all</button>
          </div>
          {prog && <div style={{ marginTop: 12 }}>
            <div style={{ height: 8, background: "var(--border, #e5e7eb)", borderRadius: 999, overflow: "hidden" }}><div style={{ width: Math.round(prog.done / Math.max(1, prog.total) * 100) + "%", height: "100%", background: "var(--orange, #FF7A1A)", transition: "width .2s" }} /></div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{prog.done} of {prog.total} · {prog.made} made{prog.failed.length ? ` · ${prog.failed.length} failed` : ""}</div>
          </div>}
          {msg && <div style={{ marginTop: 10, fontWeight: 600 }}>{msg}</div>}
          {!!failed.length && <div style={{ marginTop: 10, fontSize: 12.5 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Could not make</div>
            {failed.map(f => <div key={f.id} style={{ padding: "3px 0", borderTop: "1px solid var(--border, #eee)" }}>{f.name} <span className="muted">— {f.why}</span></div>)}
            <div className="muted" style={{ marginTop: 6 }}>These PO lines simply show no picture. Upload the photo again on the Item Master page to fix one.</div>
          </div>}
          {!!state?.items?.length && !busy && <details style={{ marginTop: 14, fontSize: 12.5 }}><summary className="muted">Items still to make ({state.items.length})</summary>
            {state.items.slice(0, 200).map(it => <div key={it.id} style={{ padding: "2px 0" }}>{it.display_name}</div>)}{state.items.length > 200 && <div className="muted">…and {state.items.length - 200} more</div>}</details>}
        </div>
      </main>
    </div>
  );
}
