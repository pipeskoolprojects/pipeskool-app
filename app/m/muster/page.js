"use client";
import { useEffect, useRef, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getMuster, proxyPunch } from "@/lib/mobile";

const initials = n => n.split(" ").map(x => x[0]).slice(0, 2).join("");

export default function MusterScreen() {
  const [rows, setRows] = useState(null);
  const [target, setTarget] = useState(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);
  const siteId = 1; // v1: supervisor's own site; role-based later

  const load = () => getMuster(siteId).then(setRows);
  useEffect(() => { load(); }, []);

  function startProxy(r) {
    setTarget(r); setMsg("");
    fileRef.current?.click();
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (!file || !target) return;
    const res = await proxyPunch(target.id, siteId, file, "Supervisor");
    if (!res.ok) { setMsg(res.error); return; }
    setMsg(`Proxy punch saved for ${target.name} — photo attached, flagged in records.`);
    setTarget(null); e.target.value = "";
    load();
  }

  const counts = (rows || []).reduce((c, r) => {
    if (r.status === "present") c.p++;
    else if (r.status === "half_day") c.h++;
    else if (r.status === "absent") c.a++;
    else c.pend++;
    return c;
  }, { p: 0, h: 0, a: 0, pend: 0 });

  return (
    <div className="m-wrap">
      <div className="m-head">
        <div>
          <div className="title">Daily muster</div>
          <div className="sub">KEI Industries, Sanand · {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
        </div>
        <span className="geo-chip geo-ok" style={{ fontSize: 11 }}>📍 Inside site</span>
      </div>
      <div className="m-body">
        {isDemo && <div className="note amber">Demo mode — sample muster.</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <span className="badge p">P {counts.p}</span>
          <span className="badge h">½ {counts.h}</span>
          <span className="badge a">A {counts.a}</span>
          <span className="badge gray">Pending {counts.pend}</span>
        </div>
        {msg && <div className="note green">{msg}</div>}

        {!rows ? <div className="muted">Loading…</div> : rows.map(r => (
          <div className="m-row" key={r.id}>
            <div className="avatar">{initials(r.name)}</div>
            <div className="info">
              <div className="nm">{r.name}</div>
              <div className="dt">{r.cat} · {r.lab}{r.in ? ` · In ${r.in}` : ""}{r.out ? ` — Out ${r.out}` : ""}</div>
              {r.punch === "proxy" && <div className="flag">📷 Proxy punch — photo on file</div>}
            </div>
            {r.status === "present" ? <span className="badge p">P</span> :
             r.status === "half_day" ? <span className="badge h">½</span> :
             r.status === "absent" ? <span className="badge a">A</span> :
             r.in ? <span className="badge gray">On site</span> : (
              <button style={{ fontSize: 11.5, padding: "6px 10px" }} onClick={() => startProxy(r)}>
                Mark on behalf
              </button>
            )}
          </div>
        ))}

        <input ref={fileRef} type="file" accept="image/*" capture="environment"
               style={{ display: "none" }} onChange={onPhoto} />
        <div className="note amber" style={{ marginTop: 14 }}>
          "Mark on behalf" requires a live photo of the worker at site — the camera opens directly,
          gallery photos are not accepted. Every proxy entry is permanently flagged.
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
