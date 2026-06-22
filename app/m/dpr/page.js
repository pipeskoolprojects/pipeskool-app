"use client";
import { useEffect, useRef, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getManpowerToday, submitDPR, HINDRANCE_REASONS } from "@/lib/dpr";
import { searchWorkItems } from "@/lib/boq";
import { getSitesList } from "@/lib/mobile";

export default function DPRScreen() {
  const [siteId, setSiteId] = useState(1);
  const [sites, setSites] = useState([]);
  const [manpower, setManpower] = useState(0);
  const [work, setWork] = useState([]);          // {kind, boq_item_id|item_id|activity_text, label, unit, qty, loc, boq_qty, done_qty}
  const [wq, setWq] = useState(""); const [wres, setWres] = useState([]);
  const [hindrances, setHindrances] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [photos, setPhotos] = useState([]);      // {file, caption}
  const [plan, setPlan] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { getSitesList().then(s => setSites(s)); }, []);
  useEffect(() => { setWork([]); getManpowerToday(siteId).then(setManpower); }, [siteId]);
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

  const addMaterial = () => setMaterials(m => [...m, { name: "", qty: "", unit: "Rmt" }]);
  const setM = (i, k, v) => setMaterials(m => m.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const delM = i => setMaterials(m => m.filter((_, j) => j !== i));

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
    setErr(""); setMsg("");
    const doneWork = work.filter(w => Number(w.qty) > 0).map(w => ({
      boq_item_id: w.boq_item_id || null, item_id: w.item_id || null,
      activity_text: w.activity_text || null, unit: w.unit || null,
      qty: Number(w.qty), loc: w.loc }));
    if (!doneWork.length) { setErr("Add at least one work item with quantity."); return; }
    if (photos.length < 2) { setErr("Minimum 2 site photos required (currently " + photos.length + ")."); return; }
    if (!plan.trim()) { setErr("Write one line for tomorrow's plan."); return; }
    setBusy(true);
    const res = await submitDPR(siteId, {
      manpower, plan,
      work: doneWork,
      hindrances: hindrances.filter(h => h.reason).map(h => ({ ...h, hours: Number(h.hours || 0) })),
      materials: materials.filter(m => m.name && Number(m.qty) > 0).map(m => ({ ...m, qty: Number(m.qty) })),
      photoFiles: photos,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("DPR submitted — visible on the Director's dashboard now.");
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

        <div className="m-field"><label>Site</label>
          <select value={siteId} onChange={e => setSiteId(Number(e.target.value))}>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>

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

        <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>Material consumed today</h3>
        {materials.map((m, i) => (
          <div key={i} className="m-grid2" style={{ marginBottom: 6 }}>
            <input placeholder="Item (e.g. 110mm UPVC pipe)" value={m.name} onChange={e => setM(i, "name", e.target.value)} />
            <div style={{ display: "flex", gap: 6 }}>
              <input inputMode="decimal" placeholder="Qty" value={m.qty} onChange={e => setM(i, "qty", e.target.value)} style={{ flex: 1 }} />
              <button style={{ fontSize: 11.5 }} onClick={() => delM(i)}>✕</button>
            </div>
          </div>
        ))}
        <button onClick={addMaterial} style={{ fontSize: 12.5 }}>+ Add material</button>

        <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>Site photos (min 2, geo-tagged) {photos.length > 0 && <span className="badge p">{photos.length}</span>}</h3>
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
        <button className="primary btn-block" style={{ marginTop: 14 }} onClick={submit} disabled={busy}>
          {busy ? "Submitting…" : "Submit DPR"}
        </button>
      </div>
      <MobileNav />
    </div>
  );
}
