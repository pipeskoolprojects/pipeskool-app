"use client";
import { useEffect, useRef, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getManpowerToday, submitDPRCore, uploadDPRPhotos, HINDRANCE_REASONS, getDprHistory, getTodayDpr } from "@/lib/dpr";
import { todayLocal } from "@/lib/today";
import { searchWorkItems } from "@/lib/boq";
import { getSitesList } from "@/lib/mobile";

export default function DPRScreen() {
  const [siteId, setSiteId] = useState(1);
  const [sites, setSites] = useState([]);
  const [manpower, setManpower] = useState(0);
  const [work, setWork] = useState([]);          // {kind, boq_item_id|item_id|activity_text, label, unit, qty, loc, boq_qty, done_qty}
  const [wq, setWq] = useState(""); const [wres, setWres] = useState([]);
  const [hindrances, setHindrances] = useState([]);
  const [photos, setPhotos] = useState([]);      // {file, caption}
  const [plan, setPlan] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [view, setView] = useState("entry");      // entry | history
  const [history, setHistory] = useState([]);
  const [existingPhotos, setExistingPhotos] = useState([]);
  const [editing, setEditing] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [savedDprId, setSavedDprId] = useState(null);
  const [photoProg, setPhotoProg] = useState(null);   // {done,total} while uploading
  const [photoErr, setPhotoErr] = useState("");        // retry message if any failed

  useEffect(() => { getSitesList().then(s => setSites(s)); }, []);
  useEffect(() => {
    getManpowerToday(siteId).then(setManpower);
    getDprHistory(siteId).then(setHistory);
    getTodayDpr(siteId).then(t => {
      if (t) {
        setEditing(true);
        setWork((t.work || []).map(w => ({ ...w, qty: w.qty ?? "", loc: w.loc ?? "" })));
        setHindrances((t.hindrances || []).map(h => ({ reason: h.reason, hours: h.hours ?? "", desc: h.desc ?? "" })));
        setPlan(t.plan || "");
        if (t.manpower != null) setManpower(t.manpower);
        setExistingPhotos(t.existingPhotos || []);
      } else {
        setEditing(false); setWork([]); setHindrances([]); setPlan(""); setExistingPhotos([]);
      }
    });
  }, [siteId]);
  useEffect(() => { if (wq.length >= 1) searchWorkItems(siteId, wq).then(setWres); else setWres([]); }, [wq, siteId]);

  function addWorkLine(opt) {
    setWork(w => [...w, { kind: opt.kind, boq_item_id: opt.boq_item_id, item_id: opt.item_id,
      activity_text: opt.kind === "free" ? wq : (opt.kind === "material" ? opt.label : null),
      label: opt.label || wq, unit: opt.unit || "", qty: "", loc: "",
      boq_qty: opt.boq_qty, done_qty: opt.done_qty, pct: opt.pct }]);
    setWq(""); setWres([]);
  }
  const delWork = i => setWork(w => w.filter((_, j) => j !== i));

  const setW = (i, k, v) => setWork(w => w.map((r, j) => j === i ? { ...r, [k]: v } : r));

  const addHindrance = () => setHindrances(h => [...h, { reason: "front_not_available", hours: "", desc: "" }]);
  const setH = (i, k, v) => setHindrances(h => h.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const delH = i => setHindrances(h => h.filter((_, j) => j !== i));


  function onPhoto(e) {
    const files = Array.from(e.target.files || []);
    navigator.geolocation?.getCurrentPosition(
      p => setPhotos(ph => [...ph, ...files.map(f => ({ file: f, caption: "", lat: p.coords.latitude, lng: p.coords.longitude }))]),
      () => setPhotos(ph => [...ph, ...files.map(f => ({ file: f, caption: "" }))])
    );
    e.target.value = "";
  }
  const setCaption = (i, v) => setPhotos(p => p.map((r, j) => j === i ? { ...r, caption: v } : r));

  async function submit() {
    setErr(""); setMsg(""); setPhotoErr("");
    const doneWork = work.filter(w => Number(w.qty) > 0).map(w => ({
      boq_item_id: w.boq_item_id || null, item_id: w.item_id || null,
      activity_text: w.activity_text || null, unit: w.unit || null,
      qty: Number(w.qty), loc: w.loc }));
    if (!doneWork.length) { setErr("Add at least one work item with quantity."); return; }
    if ((photos.length + existingPhotos.length) < 2) { setErr("Minimum 2 site photos required (currently " + (photos.length + existingPhotos.length) + ")."); return; }
    if (!plan.trim()) { setErr("Write one line for tomorrow's plan."); return; }

    // PHASE 1 — save the record. Fast. The engineer waits only for this.
    setBusy(true);
    const core = await submitDPRCore(siteId, {
      manpower, plan,
      work: doneWork,
      hindrances: hindrances.filter(h => h.reason).map(h => ({ ...h, hours: Number(h.hours || 0) })),
      materials: [],
    });
    setBusy(false);
    if (!core.ok) { setErr(core.error || "Could not save the DPR. Try again."); return; }

    // Record is saved — confirm immediately and refresh history.
    setSavedDprId(core.dprId);
    setMsg((editing ? "DPR updated" : "DPR saved") + " ✓");
    getDprHistory(siteId).then(setHistory);

    // PHASE 2 — photos upload in the background. Engineer is already free to move on.
    if (photos.length) {
      setPhotoProg({ done: 0, total: photos.length });
      const r = await uploadDPRPhotos(core.dprId, photos, (done, total) => setPhotoProg({ done, total }));
      setPhotoProg(null);
      if (r.failedFiles.length) {
        setPhotos(r.failedFiles);   // keep only the failed ones so retry doesn't duplicate
        setPhotoErr(`${r.failedFiles.length} of ${r.total} photo(s) didn't upload (${r.errors[0]}). Your DPR is saved — tap "Retry photos".`);
      } else {
        setPhotos([]);
        setMsg((editing ? "DPR updated" : "DPR saved") + " ✓ — all photos uploaded.");
      }
    } else {
      setPhotos([]);
    }
    getTodayDpr(siteId).then(t => { if (t) { setEditing(true); setExistingPhotos(t.existingPhotos || []); } });
  }

  async function retryPhotos() {
    if (!savedDprId || !photos.length) return;
    setPhotoErr("");
    setPhotoProg({ done: 0, total: photos.length });
    const r = await uploadDPRPhotos(savedDprId, photos, (done, total) => setPhotoProg({ done, total }));
    setPhotoProg(null);
    if (r.failedFiles.length) {
      setPhotos(r.failedFiles);
      setPhotoErr(`${r.failedFiles.length} still failed (${r.errors[0]}). Check your signal and retry.`);
    } else {
      setPhotos([]);
      setMsg("All photos uploaded ✓");
      getTodayDpr(siteId).then(t => { if (t) setExistingPhotos(t.existingPhotos || []); });
    }
  }

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">Daily progress report</div>
          <div className="sub">{new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · Manpower today: <b>{manpower}</b> (auto from attendance)</div>
        </div>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — form works, data not stored yet.</div>}

        {/* Site selector — always visible, drives both Entry and History */}
        <div className="m-field" style={{ marginBottom: 10 }}><label>Site</label>
          <select value={siteId} onChange={e => setSiteId(Number(e.target.value))}>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button className={view === "entry" ? "primary" : ""} style={{ flex: 1, fontSize: 13 }} onClick={() => setView("entry")}>{editing ? "Edit today" : "New entry"}</button>
          <button className={view === "history" ? "primary" : ""} style={{ flex: 1, fontSize: 13 }} onClick={() => setView("history")}>History ({history.length})</button>
        </div>

        {view === "history" ? (
          <div>
            <div className="sub" style={{ marginBottom: 8 }}>Showing DPRs for <b>{sites.find(s => s.id === siteId)?.name || "this site"}</b></div>
            {history.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No past DPRs for this site yet.</div> :
              history.map(d => (
                <div key={d.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b style={{ fontSize: 13 }}>
                      {d.date}
                      {d.date === todayLocal() && <span className="badge p" style={{ marginLeft: 6 }}>Today</span>}
                    </b>
                    <span className="badge gray">Manpower {d.manpower}</span>
                  </div>
                  {d.work.map((w, i) => <div key={i} className="dt" style={{ marginTop: 4 }}>{w.activity} — {w.qty}{w.unit ? " " + w.unit : ""}{w.loc ? " — " + w.loc : ""}</div>)}
                  {d.photos.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {d.photos.map((p, i) => p.url && <img key={i} src={p.url} onClick={() => setLightbox(p.url)} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />)}
                    </div>
                  )}
                  {d.date !== todayLocal() && <div className="dt" style={{ marginTop: 6, color: "var(--mist)" }}>🔒 Past DPR — locked (view only)</div>}
                </div>
              ))}
          </div>
        ) : (<>

        {editing && <div className="note amber" style={{ marginBottom: 10 }}>You already submitted today's DPR — you're editing it. Saving will update it.</div>}

        <div className="m-field"><label>Manpower today (auto from attendance — edit if needed)</label>
          <input inputMode="numeric" value={manpower} onChange={e => setManpower(Number(e.target.value) || 0)} /></div>

        <h3 style={{ fontSize: 14, margin: "14px 0 8px" }}>Work done today</h3>
        <div className="sub" style={{ marginBottom: 8 }}>Search a BOQ line or material, or type a free activity, then add the quantity done.</div>
        <input value={wq} onChange={e => setWq(e.target.value)} placeholder="Search BOQ / material / type activity…" style={{ width: "100%" }} />
        {(wres.length > 0 || wq.length >= 1) && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, maxHeight: 200, overflowY: "auto" }}>
            {wres.map((o, k) => (
              <div key={k} onClick={() => addWorkLine(o)} style={{ padding: "8px 10px", fontSize: 12.5, borderBottom: "1px solid var(--border)" }}>
                <span className={"badge " + (o.kind === "boq" ? "info" : "gray")} style={{ marginRight: 6 }}>{o.kind === "boq" ? "BOQ" : "Material"}</span>
                {o.label}<span className="muted"> · {o.unit}</span>
              </div>
            ))}
            {wq.length >= 1 && (
              <div onClick={() => addWorkLine({ kind: "free", label: wq })} style={{ padding: "8px 10px", fontSize: 12.5, color: "var(--copper-deep)" }}>
                ＋ Add &quot;{wq}&quot; as a free activity
              </div>
            )}
          </div>
        )}

        {work.length > 0 && <div style={{ marginTop: 10 }}>
          {work.map((w, i) => (
            <div key={i} style={{ borderBottom: "1px solid var(--border)", padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{w.label}</div>
                <button style={{ fontSize: 11 }} onClick={() => delWork(i)}>✕</button>
              </div>
              <div className="m-grid2" style={{ marginTop: 6 }}>
                <input inputMode="decimal" placeholder={"Qty done" + (w.unit ? " (" + w.unit + ")" : "")} value={w.qty} onChange={e => setW(i, "qty", e.target.value)} />
                <input placeholder="Location (Bay-5 / Grid B-F)" value={w.loc} onChange={e => setW(i, "loc", e.target.value)} />
              </div>
            </div>
          ))}
        </div>}

        <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>Hindrances {hindrances.length > 0 && <span className="badge a">{hindrances.length}</span>}</h3>
        {hindrances.map((h, i) => (
          <div key={i} style={{ background: "var(--red-bg)", borderRadius: 10, padding: 10, marginBottom: 8 }}>
            <div className="m-grid2">
              <select value={h.reason} onChange={e => setH(i, "reason", e.target.value)}>
                {HINDRANCE_REASONS.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
              </select>
              <input inputMode="decimal" placeholder="Hours lost" value={h.hours}
                     onChange={e => setH(i, "hours", e.target.value)} />
            </div>
            <input style={{ width: "100%", marginTop: 6 }} placeholder="Short description (for client records)"
                   value={h.desc} onChange={e => setH(i, "desc", e.target.value)} />
            <button style={{ marginTop: 6, fontSize: 11.5 }} onClick={() => delH(i)}>Remove</button>
          </div>
        ))}
        <button onClick={addHindrance} style={{ fontSize: 12.5 }}>+ Add hindrance</button>

        <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>Site photos (min 2, geo-tagged) {(photos.length + existingPhotos.length) > 0 && <span className="badge p">{photos.length + existingPhotos.length}</span>}</h3>
        {existingPhotos.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {existingPhotos.map((p, i) => p.url && <img key={i} src={p.url} onClick={() => setLightbox(p.url)} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />)}
          </div>
        )}
        {photos.map((p, i) => (
          <div key={i} className="photo-chip">
            <span className="badge gray">📷 {i + 1}</span>
            <input placeholder="Caption (e.g. Bay-5 erection Grid D)" value={p.caption}
                   onChange={e => setCaption(i, e.target.value)} style={{ flex: 1 }} />
          </div>
        ))}
        <button onClick={() => fileRef.current?.click()} style={{ fontSize: 12.5, marginTop: 6 }}>📷 Take photo</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onPhoto} />

        <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>Tomorrow&apos;s plan (one line)</h3>
        <input style={{ width: "100%" }} placeholder="e.g. Continue Bay-5 erection Grid F-H"
               value={plan} onChange={e => setPlan(e.target.value)} />

        {err && <div className="note red">{err}</div>}
        {msg && <div className="note green">{msg}</div>}
        <button className="primary btn-block" style={{ marginTop: 14 }} onClick={submit} disabled={busy || !!photoProg}>
          {busy ? "Saving…" : editing ? "Update DPR" : "Save DPR"}
        </button>

        {photoProg && (
          <div className="note amber" style={{ marginTop: 10 }}>
            Uploading photos… {photoProg.done}/{photoProg.total} (your DPR is already saved)
          </div>
        )}
        {photoErr && (
          <div style={{ marginTop: 10 }}>
            <div className="note red">{photoErr}</div>
            <button className="btn-block" style={{ marginTop: 8 }} onClick={retryPhotos} disabled={!!photoProg}>
              Retry photos ({photos.length})
            </button>
          </div>
        )}
        </>)}
      </div>
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
          <img src={lightbox} style={{ maxWidth: "92%", maxHeight: "85%", borderRadius: 8 }} />
        </div>
      )}
      <MobileNav />
    </div>
  );
}
