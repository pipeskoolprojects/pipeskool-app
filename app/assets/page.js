"use client";
import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { isDemo } from "@/lib/supabase";
import { getAssets, getCalibrationDue, getRepairHistory, idleAssets, statusInfo, inr, addAsset, bulkImportAssets, ASSET_TEMPLATE_HEADERS, CATEGORIES, resolveSite, getStaffNames, transferAsset, flagNeedsRepair, sendForRepair, cancelRepair, repairDone, reportLost } from "@/lib/assets";

const SITE_NAMES = { 1: "KEI Sanand", 2: "SOUL Campus", 3: "The Creek" };
const blankAsset = { asset_code: "", name: "", category: "", make_model: "", purchase_cost: "", calib: false, calib_due: "" };

export default function AssetsPage() {
  const [site, setSite] = useState("all");
  const [assets, setAssets] = useState(null);
  const [calib, setCalib] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [addSite, setAddSite] = useState(1);
  const [form, setForm] = useState(null);
  const [bulkRows, setBulkRows] = useState([]); const [bulkResult, setBulkResult] = useState(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [staff, setStaff] = useState([]);
  const [modal, setModal] = useState(null);   // { type, asset }
  const [mv, setMv] = useState({});

  useEffect(() => { getAssets(site).then(setAssets); }, [site, msg]);
  useEffect(() => { getCalibrationDue().then(setCalib); getRepairHistory().then(setRepairs); getStaffNames().then(setStaff); }, []);

  function openModal(type, asset) { setErr(""); setMsg(""); setMv({}); setModal({ type, asset }); }
  function closeModal() { setModal(null); setMv({}); }
  async function runModal() {
    const a = modal.asset; setErr(""); setBusy(true); let res;
    if (modal.type === "transfer") {
      if (!mv.to) { setErr("Pick a destination site."); setBusy(false); return; }
      res = await transferAsset(a.id, a.site_id, Number(mv.to), (mv.custodian || "").trim());
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
    closeModal(); setMsg(a.code + " — updated.");
  }
  const SITES = [{ id: 1, name: "KEI Sanand" }, { id: 2, name: "SOUL Campus" }, { id: 3, name: "The Creek" }];

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function saveOne() {
    setErr("");
    if (!form.asset_code || !form.name || !form.category) { setErr("Code, name and category are required."); return; }
    setBusy(true);
    const res = await addAsset({ asset_code: form.asset_code, name: form.name, category: form.category,
      make_model: form.make_model || null, purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
      current_site_id: addSite, calibration_required: !!form.calib, calibration_due: form.calib_due || null });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Asset " + form.asset_code + " added to " + (SITE_NAMES[addSite] || "site") + "."); setForm(null);
  }
  function downloadTemplate() {
    const csv = ASSET_TEMPLATE_HEADERS.join(",") + "\n" +
      "PSK-TM-002,Threading machine (2 inch),Machine,KEI,Suresh,Ridgid 535,165000,no,\n" +
      "PSK-WS-003,Welding set 400A,Machine,SOUL,,ESAB Buddy,62000,no,\n" +
      "PSK-PG-002,Pressure gauge set,Testing,The Creek,Ramesh,Wika 0-100bar,11000,yes,2026-12-31";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "pipeskool_assets_template.csv"; a.click();
  }
  function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(",").map(h => h.trim());
      setBulkRows(lines.slice(1).map(line => { const c = line.split(","); const o = {}; headers.forEach((h, i) => o[h] = (c[i] || "").trim()); return o; }));
      setBulkResult(null); setMsg("");
    };
    reader.readAsText(f); e.target.value = "";
  }
  async function runBulk() {
    setBusy(true); const res = await bulkImportAssets(bulkRows, SITES); setBusy(false);
    setBulkResult(res);
    if (res.created) { setMsg(res.created + " asset(s) imported."); setBulkRows([]); setImporting(false); }
  }

  const idle = assets ? idleAssets(assets) : [];
  const totalValue = (assets || []).reduce((s, a) => s + a.cost, 0);
  const underRepair = (assets || []).filter(a => a.status === "under_repair").length;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Tools &amp; assets register</h1>
          <div className="filters">
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All sites</option>
              <option value="1">KEI Sanand</option>
              <option value="2">SOUL Campus</option>
              <option value="3">The Creek</option>
            </select>
            <button onClick={() => { setForm({ ...blankAsset }); setMsg(""); setErr(""); }}>＋ Add asset</button>
            <button onClick={() => { setImporting(true); setBulkRows([]); setBulkResult(null); setMsg(""); }}>⬆ Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onFile} />
          </div>
        </div>

        {isDemo && <div className="demo-banner">Demo mode — sample asset register.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        {importing && bulkRows.length === 0 && (
          <div className="panel">
            <h2>Import tools &amp; assets from CSV</h2>
            <div className="muted" style={{ marginBottom: 12 }}>
              One file can cover all sites — each row names its own <b>site</b>. Fill the template in Excel, save as <b>.csv</b>, then choose the file.
            </div>
            <div style={{ background: "var(--vapor,#F0F0EC)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12.5 }}>
              <div><b>Site</b> — type one of: <b>KEI</b>, <b>SOUL</b>, <b>The Creek</b> (or 1 / 2 / 3)</div>
              <div style={{ marginTop: 4 }}><b>Category</b> — one of: {CATEGORIES.join(", ")}</div>
              <div style={{ marginTop: 4 }}><b>calibration_required</b> — yes / no &nbsp;·&nbsp; <b>calibration_due</b> — date like 2026-12-31 (blank if no)</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="primary" onClick={downloadTemplate}>⬇ Download CSV template</button>
              <button onClick={() => fileRef.current?.click()}>📄 Choose CSV file</button>
              <button onClick={() => setImporting(false)}>Cancel</button>
            </div>
          </div>
        )}

        {bulkRows.length > 0 && (() => {
          const ok = bulkRows.filter(r => r.asset_code && r.name && r.category && resolveSite(r.site, SITES));
          const bad = bulkRows.length - ok.length;
          return (
          <div className="panel">
            <h2>Import preview — {bulkRows.length} row(s){bad > 0 && <span style={{ color: "var(--red)", fontSize: 13 }}> · {bad} need fixing</span>}</h2>
            <div className="muted" style={{ marginBottom: 10 }}>
              Each row goes to the site named in its <b>site</b> column.{" "}
              <a onClick={downloadTemplate} style={{ color: "var(--copper)", cursor: "pointer", textDecoration: "underline" }}>Download template</a>.
            </div>
            <div style={{ overflowX: "auto", marginBottom: 10 }}>
              <table>
                <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Site → resolved</th><th>Make/model</th><th className="num">Cost ₹</th><th>Calib?</th></tr></thead>
                <tbody>
                  {bulkRows.slice(0, 15).map((r, i) => {
                    const sid = resolveSite(r.site, SITES);
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{r.asset_code}</td><td>{r.name}</td><td>{r.category}</td>
                        <td>{sid ? <span className="badge gray">{SITE_NAMES[sid]}</span> : <span style={{ color: "var(--red)" }}>{r.site || "(blank)"} ✕</span>}</td>
                        <td className="muted">{r.make_model}</td><td className="num">{r.purchase_cost}</td><td>{r.calibration_required}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {bulkRows.length > 15 && <div className="muted" style={{ marginTop: 6 }}>…and {bulkRows.length - 15} more.</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="primary" disabled={busy || ok.length === 0} onClick={runBulk}>{busy ? "Importing…" : `Import ${ok.length} valid asset(s)`}</button>
              <button onClick={() => { setBulkRows([]); setBulkResult(null); }}>Back</button>
            </div>
            {bulkResult && bulkResult.errors?.length > 0 && <div className="error" style={{ marginTop: 8 }}>{bulkResult.errors.slice(0, 8).join("; ")}</div>}
          </div>
          );
        })()}

        {form && (
          <div className="panel">
            <h2>Add asset</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <div><label className="muted">Asset code *</label><input style={{ width: "100%" }} value={form.asset_code} onChange={e => setF("asset_code", e.target.value)} placeholder="PSK-TM-002" /></div>
              <div style={{ gridColumn: "span 2" }}><label className="muted">Name *</label><input style={{ width: "100%" }} value={form.name} onChange={e => setF("name", e.target.value)} placeholder='Threading machine (2 inch)' /></div>
              <div><label className="muted">Category *</label>
                <select style={{ width: "100%" }} value={form.category} onChange={e => setF("category", e.target.value)}>
                  <option value="">Select…</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><label className="muted">Make / model</label><input style={{ width: "100%" }} value={form.make_model} onChange={e => setF("make_model", e.target.value)} /></div>
              <div><label className="muted">Purchase cost ₹</label><input style={{ width: "100%" }} value={form.purchase_cost} onChange={e => setF("purchase_cost", e.target.value)} /></div>
              <div><label className="muted">Add to site</label>
                <select style={{ width: "100%" }} value={addSite} onChange={e => setAddSite(Number(e.target.value))}>
                  <option value={1}>KEI Sanand</option><option value={2}>SOUL Campus</option><option value={3}>The Creek</option>
                </select></div>
              <div><label className="muted">Calibration due (if any)</label><input type="date" style={{ width: "100%" }} value={form.calib_due} onChange={e => { setF("calib_due", e.target.value); setF("calib", !!e.target.value); }} /></div>
            </div>
            {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="primary" disabled={busy} onClick={saveOne}>{busy ? "Saving…" : "Save asset"}</button>
              <button onClick={() => { setForm(null); setErr(""); }}>Cancel</button>
            </div>
            <div className="muted" style={{ marginTop: 10 }}>Adding many at once? Use <b>Import CSV</b> in the top bar — <a onClick={downloadTemplate} style={{ color: "var(--copper)", cursor: "pointer", textDecoration: "underline" }}>download the template</a>, fill it in Excel, and upload.</div>
          </div>
        )}

        <div className="cards">
          <div className="card"><div className="label">Total assets</div><div className="value">{assets?.length ?? "—"}</div></div>
          <div className="card"><div className="label">Asset value</div><div className="value">{inr(totalValue)}</div></div>
          <div className="card"><div className="label">Calibration due (30d)</div><div className="value" style={{ color: calib.length ? "var(--red)" : "var(--green)" }}>{calib.length}</div></div>
          <div className="card"><div className="label">Under repair</div><div className="value" style={{ color: underRepair ? "var(--amber)" : "var(--green)" }}>{underRepair}</div></div>
        </div>

        {calib.length > 0 && (
          <div className="panel">
            <h2>🔧 Calibration due soon</h2>
            <table>
              <thead><tr><th>Asset</th><th>Name</th><th>Site</th><th>Due date</th></tr></thead>
              <tbody>
                {calib.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{c.code}</td>
                    <td>{c.name}</td>
                    <td className="muted">{c.site}</td>
                    <td style={{ color: "var(--red)" }}>{c.calib_due}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ marginTop: 8 }}>Hydro-test gauges and pumps need valid calibration certificates — clients ask for these during testing.</div>
          </div>
        )}

        <div className="panel">
          <h2>Asset location &amp; status — all sites</h2>
          {!assets ? <div className="muted">Loading…</div> :
            <DataTable exportName="assets" rows={assets}
              columns={[
                { key: "code", label: "Code", filter: "search", render: a => <span style={{ fontWeight: 600 }}>{a.code}</span> },
                { key: "name", label: "Asset", filter: "search", render: a => <span>{a.name}<div className="muted">{a.make}</div></span> },
                { key: "category", label: "Category", filter: "select" },
                { key: "site", label: "Site", filter: "select", render: a => <span className="badge gray">{a.site}</span> },
                { key: "custodian", label: "Custodian", filter: "search", render: a => <span className="muted">{a.custodian || "—"}</span> },
                { key: "cost", label: "Value", type: "num", render: a => inr(a.cost), exportValue: a => a.cost },
                { key: "status", label: "Status", filter: "select", render: a => { const [l,c] = statusInfo(a.status); return <span className={"badge "+c}>{l}</span>; } },
                { key: "actions", label: "Actions", render: a => (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {a.status === "needs_repair" ? (
                      <>
                        <button className="primary" style={{ fontSize: 11, padding: "3px 7px" }} onClick={() => openModal("send_repair", a)}>Send repair</button>
                        <button style={{ fontSize: 11, padding: "3px 7px" }} onClick={() => openModal("cancel_repair", a)}>Back to service</button>
                      </>
                    ) : a.status === "under_repair" ? (
                      <button className="primary" style={{ fontSize: 11, padding: "3px 7px" }} onClick={() => openModal("repair_done", a)}>Repair done</button>
                    ) : a.status === "lost" ? <span className="muted" style={{ fontSize: 11 }}>—</span> : (
                      <>
                        <button style={{ fontSize: 11, padding: "3px 7px" }} onClick={() => openModal("transfer", a)}>Transfer</button>
                        <button style={{ fontSize: 11, padding: "3px 7px" }} onClick={() => openModal("needs_repair", a)}>Needs repair</button>
                        <button style={{ fontSize: 11, padding: "3px 7px", color: "var(--red)" }} onClick={() => openModal("report_loss", a)}>Loss</button>
                      </>
                    )}
                  </div>
                ) },
              ]} />}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 }}>
          {idle.length > 0 && (
            <div className="panel" style={{ marginBottom: 0 }}>
              <h2>Idle assets (available, unused)</h2>
              <table>
                <thead><tr><th>Code</th><th>Asset</th><th>Site</th><th className="num">Value</th></tr></thead>
                <tbody>
                  {idle.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.code}</td>
                      <td>{a.name}</td>
                      <td className="muted">{a.site}</td>
                      <td className="num">{inr(a.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="muted" style={{ marginTop: 8 }}>Idle at one site while another may be hiring — move before renting.</div>
            </div>
          )}

          {repairs.length > 0 && (
            <div className="panel" style={{ marginBottom: 0 }}>
              <h2>Repair cost history</h2>
              <table>
                <thead><tr><th>Asset</th><th className="num">Repairs</th><th className="num">Repair cost</th><th className="num">vs Purchase</th></tr></thead>
                <tbody>
                  {repairs.map((r, i) => {
                    const pct = r.cost ? Math.round(r.total / r.cost * 100) : 0;
                    return (
                      <tr key={i}>
                        <td><div style={{ fontWeight: 600 }}>{r.code}</div><div className="muted">{r.name}</div></td>
                        <td className="num">{r.count}</td>
                        <td className="num">{inr(r.total)}</td>
                        <td className="num" style={{ color: pct > 25 ? "var(--red)" : "inherit" }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="muted" style={{ marginTop: 8 }}>When repair cost crosses ~25–30% of purchase value, consider replacing.</div>
            </div>
          )}
        </div>

        <datalist id="staff-list-web">{staff.map(n => <option key={n} value={n} />)}</datalist>

        {modal && (
          <div onClick={closeModal} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 460, width: "100%", padding: 22, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
              <h2 style={{ marginBottom: 2 }}>
                {modal.type === "transfer" && "Transfer tool"}
                {modal.type === "needs_repair" && "Flag for repair"}
                {modal.type === "send_repair" && "Send for repair"}
                {modal.type === "cancel_repair" && "Return to service"}
                {modal.type === "repair_done" && "Repair done"}
                {modal.type === "report_loss" && "Report lost / damaged"}
              </h2>
              <div className="muted" style={{ marginBottom: 14 }}>{modal.asset.code} · {modal.asset.name}</div>

              {modal.type === "transfer" && (
                <div style={{ display: "grid", gap: 10 }}>
                  <div><label className="muted">Move to site</label>
                    <select style={{ width: "100%" }} value={mv.to || ""} onChange={e => setMv(v => ({ ...v, to: e.target.value }))}>
                      <option value="">Select site…</option>
                      {SITES.filter(s => s.id !== modal.asset.site_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select></div>
                  <div><label className="muted">New custodian (optional)</label>
                    <input list="staff-list-web" style={{ width: "100%" }} value={mv.custodian || ""} onChange={e => setMv(v => ({ ...v, custodian: e.target.value }))} placeholder="Person at receiving site" /></div>
                </div>
              )}
              {modal.type === "needs_repair" && (
                <div><label className="muted">What's the problem?</label>
                  <input style={{ width: "100%" }} value={mv.issue || ""} onChange={e => setMv(v => ({ ...v, issue: e.target.value }))} placeholder="e.g. motor not starting" /></div>
              )}
              {modal.type === "send_repair" && (
                <div><label className="muted">Workshop / vendor (optional)</label>
                  <input style={{ width: "100%" }} value={mv.vendor || ""} onChange={e => setMv(v => ({ ...v, vendor: e.target.value }))} placeholder="Where it's being sent" /></div>
              )}
              {modal.type === "cancel_repair" && (
                <div className="muted" style={{ fontSize: 13 }}>This returns {modal.asset.code} to service without sending it out for repair.</div>
              )}
              {modal.type === "repair_done" && (
                <div><label className="muted">Repair cost ₹ (optional)</label>
                  <input style={{ width: "100%" }} value={mv.cost || ""} onChange={e => setMv(v => ({ ...v, cost: e.target.value }))} placeholder="e.g. 6500" /></div>
              )}
              {modal.type === "report_loss" && (
                <div><label className="muted">Loss / damage details</label>
                  <input style={{ width: "100%" }} value={mv.reason || ""} onChange={e => setMv(v => ({ ...v, reason: e.target.value }))} placeholder="What happened?" /></div>
              )}

              {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="primary" disabled={busy} onClick={runModal}>{busy ? "Saving…" : "Confirm"}</button>
                <button onClick={closeModal}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
