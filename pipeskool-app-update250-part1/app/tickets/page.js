"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession } from "@/lib/auth";
import { getTicketQueue, updateTicket } from "@/lib/assistant";

const ST = { open: ["warn", "Open"], in_progress: ["a", "In progress"], resolved: ["green", "Resolved"], closed: ["gray", "Closed"] };

export default function TicketsPage() {
  const [sess, setSess] = useState(null);
  const [rows, setRows] = useState(null);
  const [f, setF] = useState("open");
  const [msg, setMsg] = useState("");
  useEffect(() => { setSess(getSession()); }, []);
  const isAdmin = sess && (sess.role === "director" || sess.role === "it_executive");
  const load = () => { getTicketQueue().then(setRows); };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, msg]);

  if (sess && !isAdmin) return <div className="layout"><Sidebar /><main className="main">
    <div className="page-head"><h1>Support Tickets</h1></div>
    <div className="panel muted">Director / IT only. Your own tickets show inside the 💬 Assistant ("my tickets").</div></main></div>;

  const shown = (rows || []).filter(r => f === "all" || r.status === f);
  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Support Tickets</h1></div>
        {msg && <div className="note green" style={{ marginBottom: 10 }}>{msg}</div>}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["open", "in_progress", "resolved", "all"].map(s => <button key={s} className={f === s ? "primary" : ""} style={{ fontSize: 12 }} onClick={() => setF(s)}>{s === "all" ? "All" : ST[s]?.[1] || s}</button>)}
        </div>
        {!rows ? <div className="muted">Loading…</div> : shown.length === 0 ? <div className="panel muted">Nothing here. 👍</div> :
          shown.map(r => (
            <div key={r.id} className="panel" style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b>#{r.id}</b><span>{r.subject}</span>
                <span className={"badge " + (ST[r.status]?.[0] || "gray")}>{ST[r.status]?.[1] || r.status}</span>
                <span className="badge gray">{r.route}</span>
                <span className="muted" style={{ marginLeft: "auto", fontSize: 11.5 }}>{r.app_users?.full_name} · {String(r.created_at).slice(0, 16).replace("T", " ")}</span>
              </div>
              {r.body && <div style={{ fontSize: 12.5, marginTop: 6 }}>{r.body}</div>}
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                {r.diagnostic && <>📟 {r.diagnostic.page} · {r.diagnostic.role} · v{r.diagnostic.app_version} · {String(r.diagnostic.device || "").slice(0, 60)}</>}
                {r.screenshot_url && <> · <a href={r.screenshot_url} target="_blank" rel="noreferrer">📎 screenshot</a></>}
              </div>
              {r.resolution_note && <div className="note green" style={{ marginTop: 6, fontSize: 12 }}>Resolution: {r.resolution_note}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {r.status === "open" && <button style={{ fontSize: 12 }} onClick={async () => { const x = await updateTicket(sess, r.id, { status: "in_progress" }); x.ok && setMsg(`#${r.id} in progress.`); }}>▶ Take up</button>}
                {["open", "in_progress"].includes(r.status) && <button className="primary" style={{ fontSize: 12 }} onClick={async () => {
                  const n = prompt("Resolution note (sent with the ticket):"); if (n === null) return;
                  const x = await updateTicket(sess, r.id, { status: "resolved", resolution_note: n });
                  x.ok && setMsg(`#${r.id} resolved.`);
                }}>✓ Resolve</button>}
              </div>
            </div>
          ))}
      </main>
    </div>
  );
}
