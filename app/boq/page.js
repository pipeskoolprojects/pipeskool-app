"use client";
import { useEffect, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DataTable from "@/components/DataTable";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getBoqItems, saveBoqItem, bulkImportBoq, BOQ_TEMPLATE_HEADERS, inr } from "@/lib/boq";
import * as XLSX from "xlsx";

const blank = { item_code: "", description: "", unit: "Rmt", boq_qty: "", rate: "", section: "" };

export default function BoqPage() {
  const [session, setSession] = useState(null);
  const [site, setSite] = useState(1);
  const [sites, setSites] = useState([]);
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null);
  const [bulkRows, setBulkRows] = useState([]); const [bulkResult, setBulkResult] = useState(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const s = getSession(); setSession(s);
    if (s?.sites?.length) { setSites(s.sites); setSite(s.sites[0].id); }
  }, []);
  useEffect(() => { if (site) getBoqItems(site).then(setRows); }, [site, msg]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  async function save() {
    setErr(""); if (!form.description) { setErr("Description is required."); return; }
    setBusy(true); const res = await saveBoqItem({ ...form, site_id: site }); setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg(form.id ? "BOQ line updated." : "BOQ line added."); setForm(null);
  }

  function downloadTemplate() {
    const csv = BOQ_TEMPLATE_HEADERS.join(",") + "\n" +
      "WS-01,MS 350NB header piping,Rmt,850,1850,Water Supply\n" +
      "DR-04,UPVC 110mm SWR pipe laying,Rmt,2400,420,Drainage";
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "pipeskool_boq_template.csv"; a.click();
  }
  function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array" });          // handles CSV, XLSX, XLS
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });        // proper quoted-comma handling
        setBulkRows(rows.map(r => { const o = {}; Object.keys(r).forEach(k => o[String(k).trim()] = String(r[k]).trim()); return o; }));
        setBulkResult(null);
      } catch (err) {
        setBulkResult({ ok: false, error: "Could not read the file: " + err.message + ". Use the downloaded template (CSV or Excel) with the same columns." });
      }
    };
    reader.readAsArrayBuffer(f);
  }
  async function runBulk() {
    setBusy(true); const res = await bulkImportBoq(bulkRows, site); setBusy(false);
    setBulkResult(res); if (res.created) { setMsg(res.created + " BOQ lines imported."); setBulkRows([]); }
  }

  const columns = [
    { key: "item_code", label: "Code", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.item_code || "—"}</span> },
    { key: "description", label: "Description", filter: "search" },
    { key: "section", label: "Section", filter: "select" },
    { key: "unit", label: "Unit" },
    { key: "boq_qty", label: "BOQ qty", type: "num", render: r => r.boq_qty.toLocaleString("en-IN"), exportValue: r => r.boq_qty },
    { key: "done_qty", label: "Measured (RA)", type: "num", render: r => r.done_qty.toLocaleString("en-IN"), exportValue: r => r.done_qty },
    { key: "pct", label: "Progress (from RA bills)", type: "num", render: r => (
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
        <div style={{ flex: 1, height: 7, background: "#eee", borderRadius: 4 }}><div style={{ width: Math.min(r.pct, 100) + "%", height: 7, borderRadius: 4, background: r.pct >= 100 ? "var(--green)" : "var(--copper)" }} /></div>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{r.pct}%</span>
      </div>), exportValue: r => r.pct + "%" },
    { key: "_a", label: "", sortable: false, render: r => <button style={{ fontSize: 11.5 }} onClick={() => { setForm(r); setMsg(""); }}>Edit</button> },
  ];

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>BOQ master</h1>
          <div className="filters">
            <select value={site} onChange={e => setSite(Number(e.target.value))}>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button onClick={() => { setForm({ ...blank }); setMsg(""); }}>＋ Add line</button>
            <button onClick={() => fileRef.current?.click()}>⬆ Import BOQ (CSV / Excel)</button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }} onChange={onFile} />
          </div>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — sample BOQ.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        {bulkRows.length > 0 && (
          <div className="panel">
            <h2>Import preview — {bulkRows.length} lines</h2>
            <div className="muted" style={{ marginBottom: 8 }}>Importing into <b>{sites.find(s => s.id === site)?.name}</b>. Need a template? <a onClick={downloadTemplate} style={{ color: "var(--copper)", cursor: "pointer", textDecoration: "underline" }}>Download CSV template</a>.</div>
            <button className="primary" disabled={busy} onClick={runBulk}>{busy ? "Importing…" : `Import ${bulkRows.length} lines`}</button>
            {bulkResult && bulkResult.errors?.length > 0 && <div className="error" style={{ marginTop: 8 }}>{bulkResult.errors.slice(0, 5).join("; ")}</div>}
          </div>
        )}
        {bulkRows.length === 0 && (
          <div className="muted" style={{ margin: "0 0 12px" }}>Upload your BOQ as CSV (<a onClick={downloadTemplate} style={{ color: "var(--copper)", cursor: "pointer", textDecoration: "underline" }}>download template</a>) or add lines manually. These feed the DPR work dropdown. Progress % is driven by RA-bill measured quantities (RA Billing module).</div>
        )}

        {form && (
          <div className="panel">
            <h2>{form.id ? "Edit BOQ line" : "Add BOQ line"}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
              <div><label className="muted">Item code</label><input style={{ width: "100%" }} value={form.item_code} onChange={e => set("item_code", e.target.value)} /></div>
              <div style={{ gridColumn: "span 2" }}><label className="muted">Description *</label><input style={{ width: "100%" }} value={form.description} onChange={e => set("description", e.target.value)} /></div>
              <div><label className="muted">Section</label><input style={{ width: "100%" }} value={form.section} onChange={e => set("section", e.target.value)} /></div>
              <div><label className="muted">Unit</label><input style={{ width: "100%" }} value={form.unit} onChange={e => set("unit", e.target.value)} /></div>
              <div><label className="muted">BOQ qty</label><input style={{ width: "100%" }} value={form.boq_qty} onChange={e => set("boq_qty", e.target.value)} /></div>
              <div><label className="muted">Rate ₹</label><input style={{ width: "100%" }} value={form.rate} onChange={e => set("rate", e.target.value)} /></div>
            </div>
            {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
              <button onClick={() => setForm(null)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="panel">
          {!rows ? <div className="muted">Loading…</div> : <DataTable columns={columns} rows={rows} exportName="boq" />}
        </div>
      </main>
    </div>
  );
}
