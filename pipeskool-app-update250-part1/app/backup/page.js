"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { buildBackup, downloadBackupFile, summarizeBackup, restoreBackup } from "@/lib/backup";

export default function BackupPage() {
  const [sess, setSess] = useState(null);
  const [prog, setProg] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastFile, setLastFile] = useState(null);
  const [upload, setUpload] = useState(null);      // parsed backup json
  const [summary, setSummary] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [results, setResults] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => { setSess(getSession()); }, []);
  if (sess && sess.role !== "director") {
    return <div className="layout"><Sidebar /><main className="main">
      <div className="page-head"><h1>Backup & Restore</h1></div>
      <div className="panel muted">Directors only.</div></main></div>;
  }

  async function doBackup() {
    setErr(""); setBusy(true); setLastFile(null);
    try {
      const b = await buildBackup(setProg);
      const name = downloadBackupFile(b);
      const s = summarizeBackup(b);
      setLastFile({ name, ...s });
      setProg("");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  function onPickFile(e) {
    setErr(""); setUpload(null); setSummary(null); setResults(null); setConfirmText("");
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result);
        if (j.app !== "pipeskool" || !j.tables) throw new Error("This is not a Pipeskool backup file.");
        setUpload(j); setSummary(summarizeBackup(j));
      } catch (x) { setErr("Could not read file: " + x.message); }
    };
    rd.readAsText(f);
  }

  async function doRestore() {
    if (confirmText.trim().toUpperCase() !== "RESTORE") { setErr('Type RESTORE in the box to confirm.'); return; }
    setErr(""); setBusy(true); setResults(null);
    try {
      const r = await restoreBackup(upload, setProg);
      setResults(r); setProg("");
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Backup & Restore</h1></div>
        {err && <div className="note red" style={{ marginBottom: 10 }}>{err}</div>}
        {prog && <div className="note amber" style={{ marginBottom: 10 }}>{prog}</div>}

        {/* -------- BACKUP -------- */}
        <div className="panel" style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>⬇ Download full backup</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            One click exports <b>every table and every record</b> of the whole company — attendance, wages,
            stock, indents, billing, notices, everything — into a single file on your computer.
            Keep a copy safely (laptop + Google Drive/pen drive). Recommended: <b>every week</b>, and always
            <b> before running any SQL</b>. Photos/documents stay in Supabase Storage and are not inside this file.
          </div>
          <button className="primary" disabled={busy} onClick={doBackup}>{busy ? "Working…" : "⬇ Download backup now"}</button>
          {lastFile && (
            <div className="note green" style={{ marginTop: 10 }}>
              Saved <b>{lastFile.name}</b> — {lastFile.tableCount} tables, {lastFile.totalRows.toLocaleString("en-IN")} records.
              {lastFile.tables.some(t => t.error) && <div style={{ color: "var(--red)" }}>Some tables could not be read: {lastFile.tables.filter(t => t.error).map(t => t.name).join(", ")}</div>}
            </div>
          )}
        </div>

        {/* -------- RESTORE -------- */}
        <div className="panel">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>⬆ Recover from a backup file</div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            Restore puts back records that are <b>missing</b> compared to the backup — it recovers deleted or lost data.
            It <b>never overwrites and never deletes</b> anything currently in the app, so it is safe to run.
            (Records created after the backup was taken stay untouched.)
          </div>
          <input type="file" accept=".json,application/json" onChange={onPickFile} disabled={busy} />
          {summary && (
            <div style={{ marginTop: 10 }}>
              <div className="note" style={{ background: "#F4F5F7" }}>
                Backup taken <b>{String(summary.taken_at).slice(0, 16).replace("T", " ")}</b> — {summary.tableCount} tables,
                {" "}{summary.totalRows.toLocaleString("en-IN")} records.
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                <input placeholder='Type RESTORE to confirm' value={confirmText} onChange={e => setConfirmText(e.target.value)} />
                <button className="primary" disabled={busy} onClick={doRestore}>{busy ? "Restoring…" : "⬆ Restore missing records"}</button>
              </div>
            </div>
          )}
          {results && (
            <div style={{ marginTop: 12 }}>
              <b style={{ fontSize: 13 }}>Restore result</b>
              <div className="dt-scroll" style={{ maxHeight: 300, marginTop: 6 }}>
                <table className="dt-compact" style={{ width: "100%" }}>
                  <thead><tr><th>Table</th><th>Records added back</th><th>Status</th></tr></thead>
                  <tbody>
                    {Object.entries(results).map(([t, r]) => (
                      <tr key={t}><td>{t}</td><td>{r.inserted}</td>
                        <td>{r.error ? <span style={{ color: "var(--red)" }}>{r.error}</span> : <span className="badge green">OK</span>}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Tables showing 0 simply had nothing missing. If any table shows an error after all passes, send me a screenshot.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
