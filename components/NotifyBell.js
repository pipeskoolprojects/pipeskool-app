"use client";
// update157: the notification bell — badge count, realtime updates, history,
// read/unread, click opens the related request. Mounted on web (Sidebar) and
// mobile (MobileNav). Server-side RLS guarantees each person only ever
// receives their own rows.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMyNotifications, markNotifRead, markAllNotifRead, subscribeNotifs } from "@/lib/notify";
import { pushSupported, enablePush, pushStatus, sendTestPush } from "@/lib/push";   // update267

function timeAgo(ts) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

// update353: links baked into older notification rows, remapped at CLICK time.
const LEGACY = { "/expenses": "/go?to=money", "/approvals": "/go?to=money", "/go?to=approvals": "/go?to=money" };   // update364

export default function NotifyBell({ mobile }) {
  const [open, setOpen] = useState(false);
  const [pstat, setPstat] = useState(null);   // update267: real device push status
  useEffect(() => { if (open) pushStatus().then(setPstat); }, [open]);   // update267
  const [rows, setRows] = useState([]);
  const [unread, setUnread] = useState(0);
  const router = useRouter();
  const unsub = useRef(() => {});

  async function refresh() {
    const r = await getMyNotifications();
    setRows(r.rows); setUnread(r.unread);
  }

  useEffect(() => {
    const sess = getSession();
    if (!sess?.id) return;
    refresh();
    unsub.current = subscribeNotifs(sess.id, () => refresh());   // realtime
    const t = setInterval(refresh, 60000);                        // fallback poll
    return () => { unsub.current(); clearInterval(t); };
  }, []);

  async function openItem(n) {
    if (!n.is_read) { await markNotifRead(n.id); }
    setOpen(false); refresh();
    // update353: rows sent before today still hold "/expenses" or "/approvals". Route them
    // through /go so an old notification opens the right shell for THIS device.
    if (n.link) router.push(LEGACY[n.link] || n.link);
  }

  const btnStyle = mobile
    ? { position: "fixed", top: "calc(12px + env(safe-area-inset-top))", right: 12, zIndex: 140, width: 38, height: 38, borderRadius: "50%",   // update265c: clear the phone status bar (installed app draws under it)
        background: "rgba(255,255,255,0.14)", color: "#fff", border: "none", fontSize: 17, cursor: "pointer" }
    : { position: "relative", background: "rgba(255,255,255,0.08)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: 8, width: "100%", padding: "5px 8px", fontSize: 12.5, cursor: "pointer", textAlign: "left" };

  return (
    <>
      {(!mobile || !open) && (
      <button onClick={() => { setOpen(o => !o); }} style={btnStyle} title="Notifications">
        🔔 {!mobile && "Notifications"}
        {unread > 0 && (
          <span style={{ position: "absolute", top: -6, right: -6, background: "var(--copper, #FF7A1A)", color: "#fff",
            borderRadius: 10, fontSize: 10.5, fontWeight: 700, padding: "1px 6px", minWidth: 18, textAlign: "center" }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      )}{/* update262: on the phone the floating bell hides while its panel is open — it used to
            show through the transparent backdrop and look like a duplicate bell on that screen */}
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.35)" }}>
          <div onClick={e => e.stopPropagation()}
               style={{ position: "fixed", top: mobile ? "calc(58px + env(safe-area-inset-top))" : 70, right: mobile ? 8 : "auto", left: mobile ? 8 : 230,   // update265c
                 width: mobile ? "auto" : 360, maxHeight: "70vh", overflowY: "auto", background: "#fff",
                 borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.25)", zIndex: 201 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
              <b style={{ fontSize: 14 }}>Notifications</b>
              {unread > 0 && <button style={{ fontSize: 11.5 }} onClick={async () => { await markAllNotifRead(); refresh(); }}>Mark all read</button>}
              {/* update267: driven by the device's TRUE state — enable when this device is not
                  registered to the logged-in user (even if permission was granted earlier). */}
              {pushSupported() && pstat && !pstat.subscribed && (
                <button style={{ fontSize: 11.5, marginLeft: 6 }} title="Get these on your phone even when the app is closed"
                  onClick={async () => { const sess = getSession(); const r = await enablePush(sess?.id);
                    alert(r.ok ? (r.reclaimed ? "✅ This device now sends notifications to YOU (it was registered to a previous login)." : "✅ Phone notifications ON for this device.") : r.error);
                    pushStatus().then(setPstat); }}>
                  🔔 Enable on this device</button>
              )}
              {pushSupported() && pstat && pstat.subscribed && (
                <button style={{ fontSize: 11.5, marginLeft: 6 }} title="Send yourself a test notification"
                  onClick={async () => { const sess = getSession(); await sendTestPush(sess?.id); alert("Test sent — it should arrive on this device within a few seconds (lock the phone to see it)."); }}>
                  ✅ Push ON · Test</button>
              )}
            </div>
            {rows.length === 0 && <div className="muted" style={{ padding: 16, fontSize: 13 }}>Nothing yet.</div>}
            {rows.map(n => (
              <div key={n.id} onClick={() => openItem(n)}
                   style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", cursor: "pointer",
                     background: n.is_read ? "#fff" : "var(--copper-soft, #FFF4EC)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                  {!n.is_read && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--copper, #FF7A1A)", flex: "0 0 auto" }} />}
                  <b style={{ fontSize: 13 }}>{n.title}</b>
                </div>
                {n.body && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{n.body}</div>}
                <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                  {n.sites?.name ? "📍 " + n.sites.name + " · " : ""}{timeAgo(n.created_at)}
                  {n.status ? " · " + n.status : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
