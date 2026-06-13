"use client";
import { useEffect, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import {
  CATEGORIES, statusInfo, getAssets, addAsset, assetTxn,
  getPendingTransfers, acknowledgeTransfer,
} from "@/lib/assets";
import { getSitesList } from "@/lib/mobile";

export default function AssetsScreen() {
  const [tab, setTab] = useState("mine");   // mine | inbound | add
  const [siteId, setSiteId] = useState(1);
  const [sites, setSites] = useState([]);
  const [assets, setAssets] = useState([]);
  const [inbound, setInbound] = useState([]);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => { getAssets(siteId).then(setAssets); getPendingTransfers(siteId).then(setInbound); };
  useEffect(() => { getSitesList().then(setSites); }, []);
  useEffect(load, [siteId, msg]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function doTxn(asset, type) {
    let extra = {};
    if (type === "transfer") {
      const to = prompt("Transfer to which site? Enter: " + sites.map(s => s.id + "=" + s.name.split(",")[0]).join(", "));
      if (!to) return; extra.to_site_id = Number(to);
    }
    if (type === "repair_out") {
      const issue = prompt("What's the problem?"); if (!issue) return; extra.repair_issue = issue;
    }
    if (type === "report_loss") {
      const reason = prompt("Loss / damage details:"); if (!reason) return;
      if (!confirm("Report " + asset.code + " as lost? This is logged permanently.")) return;
      extra.loss_reason = reason;
    }
    const res = await assetTxn({ asset_id: asset.id, txn_type: type, from_site_id: siteId, done_by: 1, ...extra });
    if (!res.ok) { setErr(res.error); return; }
    setMsg(asset.code + " — " + type.replace("_", " ") + " recorded.");
  }

  async function ack(t) {
    const res = await acknowledgeTransfer(t.id, 1);
    if (res.ok) setMsg(t.code + " received and acknowledged — now at your site.");
  }

  async function saveAsset() {
    setErr(""); setMsg("");
    if (!form.asset_code || !form.name || !form.category) { setErr("Code, name and category are mandatory."); return; }
    setBusy(true);
    const res = await addAsset({
      asset_code: form.asset_code, name: form.name, category: form.category,
      make_model: form.make_model, purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
      current_site_id: siteId, calibration_required: !!form.calib, calibration_due: form.calib_due || null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Asset " + form.asset_code + " added."); setForm({}); setTab("mine");
  }

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
          <button className={tab === "inbound" ? "primary" : ""} onClick={() => setTab("inbound")} style={{ flex: 1 }}>
            Inbound {inbound.length > 0 && <span className="badge a">{inbound.length}</span>}
          </button>
          <button className={tab === "add" ? "primary" : ""} onClick={() => setTab("add")} style={{ flex: 1 }}>Add</button>
        </div>
        {msg && <div className="note green">{msg}</div>}
        {err && <div className="note red">{err}</div>}

        {tab === "mine" && assets.map(a => {
          const [label, color] = statusInfo(a.status);
          return (
            <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.code}</div>
                <span className={"badge " + color}>{label}</span>
              </div>
              <div style={{ fontSize: 13, margin: "2px 0" }}>{a.name}</div>
              <div className="dt">{a.make} · {a.custodian ? "Custodian: " + a.custodian : "No custodian"}</div>
              {a.calib && a.calib_due && <div className="flag">🔧 Calibration due {a.calib_due}</div>}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <button style={{ fontSize: 11 }} onClick={() => doTxn(a, "transfer")}>Transfer</button>
                <button style={{ fontSize: 11 }} onClick={() => doTxn(a, "repair_out")}>Send repair</button>
                <button style={{ fontSize: 11 }} onClick={() => doTxn(a, "return")}>Return to store</button>
                <button style={{ fontSize: 11, color: "var(--red)" }} onClick={() => doTxn(a, "report_loss")}>Report loss</button>
              </div>
            </div>
          );
        })}

        {tab === "inbound" && (
          inbound.length === 0 ? <div className="muted">No assets being transferred to your site.</div> :
          inbound.map(t => (
            <div key={t.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{t.code} — {t.name}</div>
              <div className="dt" style={{ margin: "4px 0 8px" }}>From {t.from} · {t.date}</div>
              <button className="primary btn-block" onClick={() => ack(t)}>✓ Confirm received at my site</button>
            </div>
          ))
        )}
        {tab === "inbound" && <div className="note amber" style={{ marginTop: 8 }}>Asset moves into your site's register only after you confirm receipt — this fixes the "machine kahan gayi?" problem.</div>}

        {tab === "add" && (
          <>
            <div className="m-grid2">
              <div className="m-field"><label>Asset code *</label><input value={form.asset_code || ""} onChange={e => set("asset_code", e.target.value)} placeholder="PSK-TM-002" /></div>
              <div className="m-field"><label>Category *</label>
                <select value={form.category || ""} onChange={e => set("category", e.target.value)}>
                  <option value="">Select…</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
            </div>
            <div className="m-field"><label>Name *</label><input value={form.name || ""} onChange={e => set("name", e.target.value)} placeholder='e.g. Threading machine 4"' /></div>
            <div className="m-grid2">
              <div className="m-field"><label>Make / model</label><input value={form.make_model || ""} onChange={e => set("make_model", e.target.value)} /></div>
              <div className="m-field"><label>Purchase cost ₹</label><input inputMode="decimal" value={form.purchase_cost || ""} onChange={e => set("purchase_cost", e.target.value)} /></div>
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
      <MobileNav />
    </div>
  );
}
