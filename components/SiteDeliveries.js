"use client";
// update462: SITE DELIVERIES & RECEIVING — one screen for phone and desktop.
// Each site indent shows Ordered · Dispatched · Received · Pending delivery · Pending receipt per item, every office
// challan raised against it, and every receipt (who, when, photos, GRN). "Receive" opens the challan and records what
// actually arrived. No prices anywhere on this screen.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSession, setCurrentSite } from "@/lib/auth";
import { getSitesList } from "@/lib/mobile";
import { getSiteDeliveries, getChallanForReceive, uploadReceiptFile, receiptFileUrl, newReceiptToken, submitReceipt, requestOverReceipt } from "@/lib/receiving";

const fmt = v => { const x = Number(v || 0); return Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000); };
const dt = s => s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" }) : "";
const STATE = {
  awaiting: ["Awaiting receipt", "h"], partial: ["Partly received", "h"], received: ["Received", "p"],
  to_receive: ["To receive", "h"], partly: ["Partly delivered", "h"], waiting: ["Waiting for dispatch", "gray"], complete: ["Complete", "p"], empty: ["No items", "gray"],
};

function Pill({ s }) { const [l, c] = STATE[s] || [s, "gray"]; return <span className={"badge " + c}>{l}</span>; }

function Bar({ it }) {
  const o = Math.max(it.ordered, it.dispatched, it.received, 1);
  const rec = Math.min(100, (it.received / o) * 100), disp = Math.max(0, Math.min(100 - rec, ((it.dispatched - it.received) / o) * 100));
  return <div className="sd-bar" aria-hidden="true"><i style={{ width: rec + "%", background: "var(--green, #15803d)" }} /><i style={{ width: disp + "%", background: "var(--copper, #c8742c)" }} /></div>;
}

function QtyGrid({ items }) {
  return (
    <>
      <table className="sd-qt">
        <thead><tr><th>Material</th><th>Ordered</th><th>Dispatched</th><th>Received</th><th>Pending delivery</th><th>Pending receipt</th></tr></thead>
        <tbody>{items.map(it => (
          <tr key={it.indent_item_id}><td><b>{it.item_name}</b><Bar it={it} />{it.damaged > 0 && <div className="sd-mut">incl. {fmt(it.damaged)} damaged</div>}</td>
            <td>{fmt(it.ordered)} <span className="sd-mut">{it.unit}</span></td><td>{fmt(it.dispatched)}</td><td>{fmt(it.received)}</td>
            <td className={it.pending_delivery > 0 ? "sd-strong" : ""}>{fmt(it.pending_delivery)}</td><td className={it.pending_receipt > 0 ? "sd-strong sd-amber" : ""}>{fmt(it.pending_receipt)}</td></tr>
        ))}</tbody>
      </table>
      <div className="sd-qcards">{items.map(it => (
        <div key={it.indent_item_id} className="sd-qc"><b>{it.item_name}</b><Bar it={it} />
          <div className="sd-g">
            <div>Ordered<b>{fmt(it.ordered)}</b><span className="sd-mut">{it.unit}</span></div><div>Dispatched<b>{fmt(it.dispatched)}</b></div><div>Received<b>{fmt(it.received)}</b></div>
            <div>Pending delivery<b className={it.pending_delivery > 0 ? "sd-strong" : ""}>{fmt(it.pending_delivery)}</b></div>
            <div>Pending receipt<b className={it.pending_receipt > 0 ? "sd-amber" : ""}>{fmt(it.pending_receipt)}</b></div>
            {it.damaged > 0 && <div>Damaged<b>{fmt(it.damaged)}</b></div>}
          </div></div>
      ))}</div>
    </>
  );
}

function ChallanCard({ c, onReceive }) {
  return (
    <div className="sd-dc">
      <div className="sd-dch"><b>{c.dc_ref}</b><span className="sd-mut">{c.date}{c.po_no ? " · " + c.po_no : ""}</span><Pill s={c.state} /></div>
      <div className="sd-dcb">
        {c.lines.map(l => (
          <div key={l.dc_item_id} className="sd-line"><span>{l.item_name}</span>
            <span className="sd-mut">dispatched <b>{fmt(l.dispatched)}</b> · received <b>{fmt(l.received)}</b>{l.damaged > 0 ? ` (${fmt(l.damaged)} damaged)` : ""}{l.open > 0 ? <> · <b className="sd-amber">{fmt(l.open)} pending</b></> : ""} {l.unit}</span></div>
        ))}
        {c.legacy && !c.receipts.length && <div className="sd-mut" style={{ marginTop: 6 }}>Converted to a GRN before site receiving existed — counted as fully received.</div>}
        {c.receipts.map(r => (
          <div key={r.id} className="sd-rc">
            <div><b>{r.rcv_no}</b> · {dt(r.at)} · {r.by}{r.grn_no ? <> · <span className="sd-mut">{r.grn_no}</span></> : null}</div>
            {r.lines.map((x, i) => <div key={i} className="sd-mut">{x.item_name}: good {fmt(x.good_qty)}{Number(x.damaged_qty) > 0 ? `, damaged ${fmt(x.damaged_qty)}` : ""}{Number(x.short_qty) > 0 ? `, short ${fmt(x.short_qty)}` : ""}{x.remark ? ` — ${x.remark}` : ""}</div>)}
            {r.remarks && <div className="sd-mut">“{r.remarks}”</div>}
            {r.files.length > 0 && <div className="sd-thumbs">{r.files.map(f => f.kind === "photo"
              ? <a key={f.id} href={receiptFileUrl(f)} target="_blank" rel="noreferrer"><img src={receiptFileUrl(f)} alt="Delivery photo" loading="lazy" /></a>
              : <a key={f.id} href={receiptFileUrl(f)} target="_blank" rel="noreferrer" className="sd-doc">📄 {f.name || "Document"}</a>)}</div>}
          </div>
        ))}
        {c.open > 0 && <button className="primary sd-recv" onClick={() => onReceive(c.id)}>{c.receipts.length || c.received > 0 ? `Record another receipt (${fmt(c.open)} pending)` : "Receive this challan"}</button>}
      </div>
    </div>
  );
}

function ReceiveSheet({ dcId, siteId, onClose, onDone }) {
  const [dc, setDc] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState({}); const [files, setFiles] = useState([]); const [uploading, setUploading] = useState(0);
  const [remarks, setRemarks] = useState(""); const [done, setDone] = useState(null); const [exc, setExc] = useState({});
  const token = useRef(newReceiptToken());
  const cam = useRef(null), gal = useRef(null), pdf = useRef(null);

  const load = useCallback(async () => {
    const d = await getChallanForReceive(dcId);
    if (!d || d.error) { setErr(d?.error || "Could not load the challan."); return; }
    setDc(d); setRows(r => { const o = { ...r }; d.lines.forEach(l => { if (!o[l.dc_item_id]) o[l.dc_item_id] = { good: "", damaged: "", remark: "" }; }); return o; });
  }, [dcId]);
  useEffect(() => { load(); }, [load]);

  const set = (id, k, v) => setRows(r => ({ ...r, [id]: { ...r[id], [k]: v } }));
  async function addFiles(list, kind) {
    const arr = Array.from(list || []); if (!arr.length) return;
    setUploading(u => u + arr.length); setErr("");
    for (const f of arr) {
      const preview = kind === "photo" && f.type?.startsWith("image/") ? URL.createObjectURL(f) : null;
      const res = await uploadReceiptFile(f, siteId || dc?.site_id, kind);
      setUploading(u => u - 1);
      if (!res.ok) { setErr(res.error); continue; }
      setFiles(fs => [...fs, { ...res, preview }]);
    }
  }
  const lineInfo = l => {
    const r = rows[l.dc_item_id] || {}; const g = Number(r.good || 0), d = Number(r.damaged || 0);
    const allow = l.open + l.approved_extra; const over = g + d > allow + 1e-9;
    return { g, d, short: Math.max(0, l.open - g - d), over, allow };
  };
  const anyQty = dc?.lines.some(l => { const i = lineInfo(l); return i.g + i.d > 0; });
  const anyOver = dc?.lines.some(l => lineInfo(l).over);
  const photos = files.filter(f => f.kind === "photo").length;

  async function submit() {
    setErr("");
    if (!anyQty) { setErr("Enter the received quantity for at least one item."); return; }
    if (anyOver) { setErr("One or more items are more than what is open on this challan. Ask for approval below, or correct the quantity."); return; }
    const missingRemark = dc.lines.find(l => lineInfo(l).d > 0 && !String(rows[l.dc_item_id]?.remark || "").trim());
    if (missingRemark) { setErr(missingRemark.item_name + ": write a remark for the damaged quantity."); return; }
    if (!photos) { setErr("Add at least one delivery photo."); return; }
    if (uploading) { setErr("Wait for the uploads to finish."); return; }
    setBusy(true);
    const res = await submitReceipt({ dcId, token: token.current, remarks,
      lines: dc.lines.map(l => ({ dc_item_id: l.dc_item_id, good_qty: rows[l.dc_item_id]?.good, damaged_qty: rows[l.dc_item_id]?.damaged, remark: rows[l.dc_item_id]?.remark })),
      files });
    setBusy(false);
    if (!res.ok) { setErr(res.error); if (res.code === "over_receipt") load(); return; }
    setDone(res);
  }
  async function askExtra(l) {
    const e = exc[l.dc_item_id] || {}; const info = lineInfo(l);
    const extra = Number(e.qty || (info.g + info.d - info.allow));
    const r = await requestOverReceipt(l.dc_item_id, extra, e.reason || "");
    if (!r.ok) { setExc(x => ({ ...x, [l.dc_item_id]: { ...e, msg: r.error, bad: true } })); return; }
    setExc(x => ({ ...x, [l.dc_item_id]: { ...e, msg: "Sent for approval. You can submit once it is approved.", bad: false } })); load();
  }

  return (
    <div className="sd-modal" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sd-sheet">
        <div className="sd-sh"><b>{dc ? "Receive · " + dc.dc_ref : "Receive"}</b><button className="sd-x" onClick={onClose} disabled={busy} aria-label="Close">×</button></div>
        <div className="sd-sb">
          {!dc && !err && <div className="sd-mut">Loading…</div>}
          {done ? (
            <div className="note green" style={{ fontSize: 14 }}>
              Saved <b>{done.rcv_no}</b>{done.grn_no ? <> · GRN <b>{done.grn_no}</b> posted to stock</> : " · nothing went to stock (all damaged)"}{done.duplicate ? " (already saved earlier)" : ""}.
              <div style={{ marginTop: 10 }}><button className="primary" onClick={onDone}>Done</button></div>
            </div>
          ) : dc && (
            <>
              <div className="sd-mut" style={{ marginBottom: 8 }}>{dc.date} · {dc.vendor}. Enter what actually arrived. Good quantity goes into stock; damaged is recorded but not stocked.</div>
              {dc.lines.map(l => { const i = lineInfo(l); const e = exc[l.dc_item_id] || {}; return (
                <div key={l.dc_item_id} className={"sd-rl" + (i.over ? " sd-over" : "")}>
                  <div className="sd-rlh"><b>{l.item_name}</b><span className="sd-mut">{l.unit}</span></div>
                  <div className="sd-g4">
                    <label>On this challan<input readOnly value={fmt(l.dispatched)} /></label>
                    <label>Already received<input readOnly value={fmt(l.received)} /></label>
                    <label>Received now (good)<input inputMode="decimal" value={rows[l.dc_item_id]?.good ?? ""} onChange={ev => set(l.dc_item_id, "good", ev.target.value.replace(/[^0-9.]/g, ""))} placeholder={l.open > 0 ? fmt(l.open) : "0"} disabled={l.open + l.approved_extra <= 0} /></label>
                    <label>Damaged<input inputMode="decimal" value={rows[l.dc_item_id]?.damaged ?? ""} onChange={ev => set(l.dc_item_id, "damaged", ev.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" disabled={l.open + l.approved_extra <= 0} /></label>
                  </div>
                  <div className="sd-g4" style={{ marginTop: 6 }}>
                    <label>Short (auto)<input readOnly value={fmt(i.short)} /></label>
                    <label className="sd-span3">Remark{i.d > 0 ? " (required)" : ""}<input value={rows[l.dc_item_id]?.remark ?? ""} onChange={ev => set(l.dc_item_id, "remark", ev.target.value)} placeholder="e.g. 2 cracked, 10 not on truck" /></label>
                  </div>
                  {l.open <= 0 && l.approved_extra <= 0 && <div className="sd-mut">Fully received on this challan.</div>}
                  {l.approved_extra > 0 && <div className="note green">Approved extra: {fmt(l.approved_extra)} {l.unit}</div>}
                  {i.over && (
                    <div className="sd-exc">
                      <div className="sd-err">{fmt(i.g + i.d)} entered but only {fmt(i.allow)} {l.unit} is open on this challan.</div>
                      {l.pending_request ? <div className="sd-mut">An approval request is already waiting.</div> : (
                        <div className="sd-excf">
                          <input inputMode="decimal" placeholder="Extra qty" value={e.qty ?? fmt(i.g + i.d - i.allow)} onChange={ev => setExc(x => ({ ...x, [l.dc_item_id]: { ...e, qty: ev.target.value } }))} />
                          <input placeholder="Reason (required)" value={e.reason || ""} onChange={ev => setExc(x => ({ ...x, [l.dc_item_id]: { ...e, reason: ev.target.value } }))} />
                          <button onClick={() => askExtra(l)} disabled={!String(e.reason || "").trim()}>Ask approval</button>
                        </div>)}
                      {e.msg && <div className={e.bad ? "sd-err" : "sd-mut"}>{e.msg}</div>}
                    </div>
                  )}
                </div>); })}

              <div className="sd-rl">
                <div className="sd-rlh"><b>Delivery photos &amp; documents</b><span className="sd-mut">at least 1 photo</span></div>
                <div className="sd-upl">
                  <button type="button" onClick={() => cam.current?.click()}>📷 Take photo</button>
                  <button type="button" onClick={() => gal.current?.click()}>🖼 From gallery</button>
                  <button type="button" onClick={() => pdf.current?.click()}>📎 PDF / document</button>
                  <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={ev => { addFiles(ev.target.files, "photo"); ev.target.value = ""; }} />
                  <input ref={gal} type="file" accept="image/*" multiple hidden onChange={ev => { addFiles(ev.target.files, "photo"); ev.target.value = ""; }} />
                  <input ref={pdf} type="file" accept="application/pdf,image/*" multiple hidden onChange={ev => { addFiles(ev.target.files, "doc"); ev.target.value = ""; }} />
                </div>
                <div className="sd-thumbs">
                  {files.map((f, i) => (
                    <span key={f.path} className="sd-th">{f.preview ? <img src={f.preview} alt="" /> : <span className="sd-doc">📄 {f.name || "file"}</span>}
                      <button aria-label="Remove" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} disabled={busy}>×</button></span>
                  ))}
                  {uploading > 0 && <span className="sd-mut">Uploading {uploading}…</span>}
                </div>
              </div>
              <div className="sd-rl">
                <label className="sd-full">General remarks<textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Truck no., gate, anything to note" /></label>
                <div className="sd-mut">Saved automatically: date &amp; time, your name, site, challan, PO and indent.</div>
              </div>
            </>
          )}
          {err && <div className="note red">{err}</div>}
        </div>
        {!done && dc && <div className="sd-sf"><button className="primary btn-block" disabled={busy || uploading > 0} onClick={submit}>{busy ? "Saving…" : "Submit receipt"}</button></div>}
      </div>
    </div>
  );
}

export default function SiteDeliveries({ mobile = false }) {
  const [siteId, setSiteId] = useState(() => { const s = getSession(); return Number(s?.currentSite || s?.sites?.[0]?.id || 0) || null; });
  const [sites, setSites] = useState([]); const [data, setData] = useState(null); const [err, setErr] = useState("");
  const [tab, setTab] = useState("orders"); const [open, setOpen] = useState({}); const [recv, setRecv] = useState(null); const [q, setQ] = useState("");

  useEffect(() => { getSitesList().then(setSites); }, []);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("dc")) setRecv(Number(sp.get("dc")));
    if (sp.get("indent")) setOpen(o => ({ ...o, [Number(sp.get("indent"))]: true }));
    if (sp.get("q")) setQ(sp.get("q").slice(0, 60));   // update473: "track it in My orders" from the catalogue opens on that order
  }, []);
  const load = useCallback(async () => {
    if (!siteId) return;
    setErr(""); const r = await getSiteDeliveries(siteId);
    if (r.error) { setErr(r.error); setData({ indents: [], challans: [], orphan: [] }); return; }
    setData(r);
  }, [siteId]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { const f = () => load(); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, [load]);

  // orders with something to receive open by themselves ONCE per load of a site; after that, open/closed is the user's choice
  const autoOpened = useRef(null);
  useEffect(() => {
    if (!data || autoOpened.current === siteId) return;
    autoOpened.current = siteId;
    setOpen(o => { const n = { ...o }; data.indents.forEach(i => { if (i.state === "to_receive" && n[i.id] === undefined) n[i.id] = true; }); return n; });
  }, [data, siteId]);
  const pick = id => { const n = Number(id); setSiteId(n); setCurrentSite(n); };
  const toReceive = useMemo(() => (data?.challans || []).filter(c => c.open > 0), [data]);
  const ql = q.trim().toLowerCase();
  const indents = (data?.indents || []).filter(i => !ql || i.indent_no.toLowerCase().includes(ql) || i.items.some(x => x.item_name.toLowerCase().includes(ql)) || i.challans.some(c => c.dc_ref.toLowerCase().includes(ql)));
  const challans = (data?.challans || []).filter(c => !ql || c.dc_ref.toLowerCase().includes(ql) || c.lines.some(l => l.item_name.toLowerCase().includes(ql)) || (c.po_no || "").toLowerCase().includes(ql));

  return (
    <div className={"sd" + (mobile ? " sd-m" : "")}>
      <style>{CSS}</style>
      <div className="sd-head">
        <div><div className="sd-title">Site deliveries &amp; receiving</div><div className="sd-sub">Your orders, office challans and what arrived</div></div>
        <select value={siteId || ""} onChange={e => pick(e.target.value)} aria-label="Site">{sites.map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}</select>
      </div>
      <div className="sd-body">
        {err && <div className="note red">{err}</div>}
        {!data && <div className="sd-mut">Loading…</div>}
        {data && toReceive.length > 0 && (
          <div className="sd-alert">
            <b>{toReceive.length} challan{toReceive.length > 1 ? "s" : ""} waiting for your receipt</b>
            <div className="sd-chips">{toReceive.slice(0, 8).map(c => <button key={c.id} onClick={() => setRecv(c.id)}>{c.dc_ref} · {fmt(c.open)} pending</button>)}</div>
          </div>
        )}
        {data && (
          <>
            <div className="sd-tabs">
              <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>My orders ({data.indents.length})</button>
              <button className={tab === "challans" ? "on" : ""} onClick={() => setTab("challans")}>All challans ({data.challans.length})</button>
            </div>
            <input className="sd-search" placeholder="Search order, challan or material" value={q} onChange={e => setQ(e.target.value)} />
            {tab === "orders" && (indents.length ? indents.map(i => {
              const isOpen = !!open[i.id];
              return (
                <div key={i.id} className="sd-card">
                  <button className="sd-ch" onClick={() => setOpen(o => ({ ...o, [i.id]: !isOpen }))} aria-expanded={isOpen}>
                    <span><b>{i.indent_no}</b><span className="sd-mut"> · {i.date}{i.raised_by ? " · " + i.raised_by : ""}{i.challans.length ? ` · ${i.challans.length} challan${i.challans.length > 1 ? "s" : ""}` : ""}</span></span>
                    <span className="sd-chr"><Pill s={i.state} /><span aria-hidden="true">{isOpen ? "▴" : "▾"}</span></span>
                  </button>
                  {isOpen && (
                    <div className="sd-cb">
                      {i.items.length ? <QtyGrid items={i.items} /> : <div className="sd-mut">No items.</div>}
                      <div className="sd-h3">Deliveries for this order</div>
                      {i.challans.length ? i.challans.map(c => <ChallanCard key={c.id} c={c} onReceive={setRecv} />) : <div className="sd-mut">No challan from the office yet.</div>}
                    </div>
                  )}
                </div>);
            }) : <div className="sd-mut">No orders for this site.</div>)}
            {tab === "challans" && (challans.length ? challans.map(c => (
              <div key={c.id}>{!c.indent_id && <div className="sd-mut" style={{ margin: "8px 0 -4px" }}>Office PO without a site indent</div>}<ChallanCard c={c} onReceive={setRecv} /></div>
            )) : <div className="sd-mut">No challans for this site.</div>)}
          </>
        )}
      </div>
      {recv && <ReceiveSheet dcId={recv} siteId={siteId} onClose={() => setRecv(null)} onDone={() => { setRecv(null); load(); }} />}
    </div>
  );
}

const CSS = `
.sd{--sd-line:var(--border,#e3e7ee);--sd-mut:var(--mid,#5c677d);color:var(--ink,#14213d)}
.sd-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.sd-title{font-size:18px;font-weight:700}.sd-sub{font-size:12px;color:var(--sd-mut)}
.sd-head select{font:inherit;padding:7px 10px;border-radius:8px;border:1px solid var(--sd-line);max-width:100%}
.sd-m .sd-head{background:var(--deep,#0f1a2e);color:#fff;padding:14px 16px 10px;margin:0;padding-right:66px}
.sd-m .sd-sub{color:#9aa4ac}.sd-m .sd-head select{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.2);font-size:12px}
.sd-m .sd-body{padding:12px 16px 90px}
.sd-mut{color:var(--sd-mut);font-size:12px}.sd-strong{font-weight:700}.sd-amber{color:var(--copper-deep,#9a5a1c);font-weight:700}
.sd-alert{background:var(--copper-soft,#fbeee2);border:1px solid #f0cfae;border-radius:12px;padding:10px 12px;margin-bottom:12px}
.sd-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.sd-chips button{font-size:12.5px;border-radius:999px;padding:6px 10px;background:#fff;border:1px solid #f0cfae;cursor:pointer}
.sd-tabs{display:flex;gap:6px;margin-bottom:8px}.sd-tabs button{flex:1;padding:9px;border-radius:9px;border:1px solid var(--sd-line);background:#fff;font:inherit;font-size:13px;cursor:pointer}.sd-tabs button.on{background:var(--deep,#0f1a2e);color:#fff;border-color:var(--deep,#0f1a2e)}
.sd-search{width:100%;font:inherit;padding:9px 12px;border:1px solid var(--sd-line);border-radius:9px;margin-bottom:10px;box-sizing:border-box}
.sd-card{border:1px solid var(--sd-line);border-radius:12px;margin-bottom:10px;background:#fff;overflow:hidden}
.sd-ch{width:100%;display:flex;justify-content:space-between;gap:8px;align-items:center;padding:11px 12px;background:#fff;border:0;text-align:left;font:inherit;cursor:pointer}
.sd-chr{display:flex;gap:8px;align-items:center;flex-shrink:0}
.sd-cb{padding:4px 12px 12px;border-top:1px solid var(--sd-line)}
.sd-h3{font-weight:700;font-size:13px;margin:12px 0 4px}
.sd-qt{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}.sd-qt th,.sd-qt td{padding:7px 6px;border-bottom:1px solid var(--sd-line);text-align:right;vertical-align:top}
.sd-qt th:first-child,.sd-qt td:first-child{text-align:left}.sd-qt th{font-size:11.5px;color:var(--sd-mut);font-weight:600}
.sd-bar{height:6px;background:#eef1f5;border-radius:6px;display:flex;overflow:hidden;margin-top:4px;max-width:220px}.sd-bar i{display:block;height:100%}
.sd-qcards{display:none}.sd-qc{border:1px solid var(--sd-line);border-radius:10px;padding:9px 10px;margin-top:8px}
.sd-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:6px;font-size:11.5px;color:var(--sd-mut)}.sd-g b{display:block;font-size:16px;color:var(--ink,#14213d)}
.sd-dc{border:1px solid var(--sd-line);border-radius:10px;margin-top:8px;background:#fff}
.sd-dch{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 10px;background:#f8fafc;border-bottom:1px solid var(--sd-line);border-radius:10px 10px 0 0}.sd-dch b{margin-right:auto}
.sd-dcb{padding:8px 10px;font-size:13px}.sd-line{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 10px;padding:3px 0}
.sd-rc{border-left:3px solid var(--green,#15803d);background:#fbfdfb;padding:6px 9px;margin:8px 0;font-size:12.5px}
.sd-thumbs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;align-items:center}.sd-thumbs img{width:64px;height:52px;object-fit:cover;border-radius:6px;border:1px solid var(--sd-line);display:block}
.sd-doc{display:inline-block;font-size:12px;border:1px solid var(--sd-line);border-radius:6px;padding:6px 8px;background:#fff;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sd-recv{width:100%;margin-top:8px;padding:10px}
.sd-modal{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:center;justify-content:center;padding:16px}
.sd-sheet{background:#fff;border-radius:14px;width:min(720px,100%);max-height:92vh;display:flex;flex-direction:column}
.sd-sh{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--sd-line)}.sd-x{border:0;background:none;font-size:24px;line-height:1;cursor:pointer;padding:0 4px}
.sd-sb{overflow:auto;padding:12px 14px;flex:1}.sd-sf{padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--sd-line)}
.sd-rl{border:1px solid var(--sd-line);border-radius:10px;padding:9px 10px;margin-bottom:10px}.sd-rl.sd-over{border-color:var(--red,#b42318)}
.sd-rlh{display:flex;justify-content:space-between;gap:8px;margin-bottom:6px}
.sd-g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.sd-g4 label,.sd-full{display:block;font-size:11.5px;color:var(--sd-mut)}
.sd-g4 input,.sd-full textarea,.sd-excf input{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:8px;border:1px solid var(--sd-line);border-radius:8px;margin-top:3px;color:var(--ink,#14213d);background:#fff}
.sd-g4 input[readonly]{background:#f4f6f9;color:var(--sd-mut)}.sd-span3{grid-column:span 3}
.sd-err{color:var(--red,#b42318);font-size:12.5px;margin-top:6px}
.sd-exc{margin-top:6px}.sd-excf{display:grid;grid-template-columns:100px 1fr auto;gap:6px;margin-top:6px}.sd-excf button{white-space:nowrap}
.sd-upl{display:flex;flex-wrap:wrap;gap:8px}.sd-upl button{padding:10px 12px;border-radius:9px;font-size:14px}
.sd-th{position:relative;display:inline-block}.sd-th button{position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;padding:0;line-height:1;background:#fff;border:1px solid var(--sd-line);cursor:pointer}
@media (max-width:720px){.sd-qt{display:none}.sd-qcards{display:block}.sd-g4{grid-template-columns:repeat(2,minmax(0,1fr))}.sd-span3{grid-column:span 1}
 .sd-modal{padding:0;align-items:flex-end}.sd-sheet{border-radius:16px 16px 0 0;max-height:94vh}.sd-excf{grid-template-columns:1fr}}
`;
