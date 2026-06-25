"use client";
import { useEffect, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import {
  CATEGORIES, statusInfo, getAssets, addAsset, getStaffNames,
  transferAsset, flagNeedsRepair, sendForRepair, cancelRepair, repairDone, reportLost,
} from "@/lib/assets";
import { getSitesList } from "@/lib/mobile";

export default function AssetsScreen() {
  const [tab, setTab] = useState("mine");   // mine | repair | add
  const [siteId, setSiteId] = useState(1);
  const [sites, setSites] = useState([]);
  const [assets, setAssets] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({});
  const [modal, setModal] = useState(null);  // { type, asset }
  const [mv, setMv] = useState({});           // modal field values
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => getAssets(siteId).then(setAssets);
  useEffect(() => { getSitesList().then(setSites); getStaffNames().then(setStaff); }, []);
  useEffect(load, [siteId, msg]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const onSite = a => a.status !== "under_repair";          // physically present
  const mineList = assets.filter(onSite);
  const repairList = assets.filter(a => a.status === "needs_repair" || a.status === "under_repair");

  function openModal(type, asset) { setErr(""); setMsg(""); setMv({}); setModal({ type, asset }); }
  function closeModal() { setModal(null); setMv({}); }

  async function runModal() {
    const a = modal.asset; setErr(""); setBusy(true); let res;
    if (modal.type === "transfer") {
      if (!mv.to) { setErr("Pick a destination site."); setBusy(false); return; }
      res = await transferAsset(a.id, siteId, Number(mv.to), (mv.custodian || "").trim());
    } else if (modal.type === "needs_repair") {
      if (!mv.issue?.trim()) { setErr("Describe the problem."); setBusy(false); return; }
      res = await flagNeedsRepair(a.id, mv.issue.trim());
    } else if (modal.type === "send_repair") {
      res = await sendForRepair(a.id, (mv.vendor || "").trim());
    } else if (modal.type === "cancel_repair") {
      res = await cancelRepair(a.id, a.custodian);
    } else if (modal.type === "repair_done") {
      res = await repairDone(a.id, mv.cost, a.custodian);
    } else if (modal.type === "report_loss") {
      if (!mv.reason?.trim()) { setErr("Add loss / damage details."); setBusy(false); return; }
      res = await reportLost(a.id, mv.reason.trim());
    }
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    closeModal();
    setMsg(a.code + " — updated.");
  }

  async function saveAsset() {
    setErr(""); setMsg("");
    if (!form.asset_code || !form.name || !form.category) { setErr("Code, name and category are mandatory."); return; }
    setBusy(true);
    const res = await addAsset({
      asset_code: form.asset_code, name: form.name, category: form.category,
      make_model: form.make_model, purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
      current_site_id: siteId, custodian_name: (form.custodian || "").trim() || null,
      status: (form.custodian || "").trim() ? "in_use" : "idle",
      calibration_required: !!form.calib, calibration_due: form.calib_due || null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Asset " + form.asset_code + " added."); setForm({}); setTab("mine");
  }

  const siteName = id => (sites.find(s => s.id === id)?.name || "").split(",")[0];

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div><div className="title">Tools &amp; assets</div><div className="sub">Site equipment</div></div>
        <select value={siteId} onChange={e => setSiteId(Number(e.target.value))} style={{ fontSize: 11, width: "auto" }}>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}
        </select>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample assets.</div>}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button className={tab === "mine" ? "primary" : ""} onClick={() => setTab("mine")} style={{ flex: 1 }}>At my site</button>
          <button className={tab === "repair" ? "primary" : ""} onClick={() => setTab("repair")} style={{ flex: 1 }}>
            Repair {repairList.length > 0 && <span className="badge a">{repairList.length}</span>}
          </button>
          <button className={tab === "add" ? "primary" : ""} onClick={() => setTab("add")} style={{ flex: 1 }}>Add</button>
        </div>
        {msg && <div className="note green">{msg}</div>}
        {err && !modal && <div className="note red">{err}</div>}

        {tab === "mine" && (mineList.length === 0 ? <div className="muted">No tools at this site.</div> :
          mineList.map(a => {
            const [label, color] = statusInfo(a.status);
            return (
              <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.code}</div>
                  <span className={"badge " + color}>{label}</span>
                </div>
                <div style={{ fontSize: 13, margin: "2px 0" }}>{a.name}</div>
                <div className="dt">{a.make || "—"} · {a.custodian ? "Custodian: " + a.custodian : "No custodian"}</div>
                {a.calib && a.calib_due && <div className="flag">🔧 Calibration due {a.calib_due}</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <button style={{ fontSize: 11 }} onClick={() => openModal("transfer", a)}>Transfer</button>
                  {a.status !== "needs_repair" && <button style={{ fontSize: 11 }} onClick={() => openModal("needs_repair", a)}>Needs repair</button>}
                  <button style={{ fontSize: 11, color: "var(--red)" }} onClick={() => openModal("report_loss", a)}>Report loss</button>
                </div>
              </div>
            );
          }))}

        {tab === "repair" && (repairList.length === 0 ? <div className="muted">No tools flagged for or under repair.</div> :
          repairList.map(a => {
            const [label, color] = statusInfo(a.status);
            return (
              <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{a.code}</div>
                  <span className={"badge " + color}>{label}</span>
                </div>
                <div style={{ fontSize: 13, margin: "2px 0" }}>{a.name}</div>
                <div className="dt">{a.make || "—"} · {siteName(a.site_id)}</div>
                {a.status === "needs_repair" && (
                  <>
                    <div className="note amber" style={{ margin: "8px 0", fontSize: 12 }}>Storekeeper: send this out for repair, or return it to service?</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="primary" style={{ fontSize: 11 }} onClick={() => openModal("send_repair", a)}>Send for repair</button>
                      <button style={{ fontSize: 11 }} onClick={() => openModal("cancel_repair", a)}>Back to service</button>
                    </div>
                  </>
                )}
                {a.status === "under_repair" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <button className="primary" style={{ fontSize: 11 }} onClick={() => openModal("repair_done", a)}>Repair done (enter cost)</button>
                  </div>
                )}
              </div>
            );
          }))}

        {tab === "add" && (
          <>
            <div className="m-grid2">
              <div className="m-field"><label>Asset code *</label><input value={form.asset_code || ""} onChange={e => set("asset_code", e.target.value)} placeholder="PSK-TM-002" /></div>
              <div className="m-field"><label>Category *</label>
                <select value={form.category || ""} onChange={e => set("category", e.target.value)}>
                  <option value="">Select…</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
            </div>
            <div className="m-field"><label>Asset name *</label><input value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder='e.g. Threading machine (4 inch)' /></div>
            <div className="m-grid2">
              <div className="m-field"><label>Model no</label><input value={form.make_model || ""} onChange={e => set("make_model", e.target.value)} placeholder="Ridgid 300" /></div>
              <div className="m-field"><label>Purchase cost ₹</label><input inputMode="decimal" value={form.purchase_cost || ""} onChange={e => set("purchase_cost", e.target.value)} /></div>
            </div>
            <div className="m-field"><label>Custodian (optional)</label>
              <input list="staff-list" value={form.custodian || ""} onChange={e => set("custodian", e.target.value)} placeholder="Person responsible" />
            </div>
            <label style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
              <input type="checkbox" checked={!!form.calib} onChange={e => set("calib", e.target.checked)} style={{ width: "auto" }} />
              Needs calibration (e.g. test gauges)
            </label>
            {form.calib && <div className="m-field"><label>Calibration due</label><input type="date" value={form.calib_due || ""} onChange={e => set("calib_due", e.target.value)} /></div>}
            <button className="primary btn-block" disabled={busy} onClick={saveAsset}>{busy ? "Saving…" : "Add asset"}</button>
          </>
        )}
      </div>

      <datalist id="staff-list">{staff.map(n => <option key={n} value={n} />)}</datalist>

      {/* ---- action modal ---- */}
      {modal && (
        <div onClick={closeModal} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--vapor,#F0F0EC)", width: "100%", maxWidth: 520, borderRadius: "16px 16px 0 0", padding: 18, maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
              {modal.type === "transfer" && "Transfer tool"}
              {modal.type === "needs_repair" && "Flag for repair"}
              {modal.type === "send_repair" && "Send for repair"}
              {modal.type === "cancel_repair" && "Return to service"}
              {modal.type === "repair_done" && "Repair done"}
              {modal.type === "report_loss" && "Report lost / damaged"}
            </div>
            <div className="dt" style={{ marginBottom: 12 }}>{modal.asset.code} · {modal.asset.name}</div>

            {modal.type === "transfer" && (
              <>
                <div className="m-field"><label>Move to site</label>
                  <select value={mv.to || ""} onChange={e => setMv(v => ({ ...v, to: e.target.value }))}>
                    <option value="">Select site…</option>
                    {sites.filter(s => s.id !== siteId).map(s => <option key={s.id} value={s.id}>{s.name.split(",")[0]}</option>)}
                  </select></div>
                <div className="m-field"><label>New custodian (optional)</label>
                  <input list="staff-list" value={mv.custodian || ""} onChange={e => setMv(v => ({ ...v, custodian: e.target.value }))} placeholder="Person at receiving site" /></div>
              </>
            )}
            {modal.type === "needs_repair" && (
              <div className="m-field"><label>What's the problem?</label>
                <input value={mv.issue || ""} onChange={e => setMv(v => ({ ...v, issue: e.target.value }))} placeholder="e.g. motor not starting" /></div>
            )}
            {modal.type === "send_repair" && (
              <div className="m-field"><label>Workshop / vendor (optional)</label>
                <input value={mv.vendor || ""} onChange={e => setMv(v => ({ ...v, vendor: e.target.value }))} placeholder="Where it's being sent" /></div>
            )}
            {modal.type === "cancel_repair" && (
              <div className="note amber" style={{ fontSize: 12.5 }}>This returns {modal.asset.code} to service without sending it out.</div>
            )}
            {modal.type === "repair_done" && (
              <div className="m-field"><label>Repair cost ₹ (optional)</label>
                <input inputMode="decimal" value={mv.cost || ""} onChange={e => setMv(v => ({ ...v, cost: e.target.value }))} placeholder="e.g. 6500" /></div>
            )}
            {modal.type === "report_loss" && (
              <div className="m-field"><label>Loss / damage details</label>
                <input value={mv.reason || ""} onChange={e => setMv(v => ({ ...v, reason: e.target.value }))} placeholder="What happened?" /></div>
            )}

            {err && <div className="note red">{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="primary" style={{ flex: 1 }} disabled={busy} onClick={runModal}>{busy ? "Saving…" : "Confirm"}</button>
              <button style={{ flex: 1 }} onClick={closeModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <MobileNav />
    </div>
  );
}
