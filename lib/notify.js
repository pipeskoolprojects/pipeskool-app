// lib/notify.js — update157: one notification engine for every request module.
// Any future module = one notifyRequest() call after its submit succeeds and
// one notifyDecision() call after its review succeeds. Routing (who receives
// what) is Director-managed in Access Rights; the database enforces it.
import { supabase, isDemo } from "./supabase";

export const NOTIFY_KINDS = [
  { code: "advance", label: "Advance salary requests", link: "/expenses" },
  { code: "expense", label: "Expense / petty-cash claims", link: "/expenses" },
  { code: "petty",   label: "Petty cash requests", link: "/expenses" },
  { code: "indent",  label: "Material indents", link: "/procure" },
  { code: "leave",   label: "Leave requests", link: "/leave" },
  { code: "ticket",  label: "Support tickets", link: "/tickets" },
];
const linkOf = kind => (NOTIFY_KINDS.find(k => k.code === kind) || {}).link || "/";

// new request -> routed receivers only (best-effort: never blocks the action)
export async function notifyRequest({ kind, requestId, siteId, title, body }) {
  if (isDemo) return;
  try {
    await supabase.rpc("fn_notify_request", {
      p_kind: kind, p_request_id: requestId || null, p_site_id: siteId || null,
      p_title: title, p_body: body || "", p_link: linkOf(kind),
    });
  } catch {}
}

// approved / rejected -> ONLY the original requester
export async function notifyDecision({ toUserId, kind, requestId, siteId, title, body, status }) {
  if (isDemo || !toUserId) return;
  try {
    await supabase.rpc("fn_notify_user", {
      p_user_id: toUserId, p_kind: kind, p_request_id: requestId || null, p_site_id: siteId || null,
      p_title: title, p_body: body || "", p_link: linkOf(kind), p_status: status || null,
    });
  } catch {}
}

// bulk (approver chains, admins, notice audiences)
export async function notifyUsers({ userIds, kind, requestId, siteId, title, body, status, link }) {
  if (isDemo || !userIds?.length) return;
  try {
    await supabase.rpc("fn_notify_users", {
      p_user_ids: userIds, p_kind: kind, p_request_id: requestId || null, p_site_id: siteId || null,
      p_title: title, p_body: body || "", p_link: link || linkOf(kind), p_status: status || null,
    });
  } catch {}
}

// ---- reading / badge / history ----
export async function getMyNotifications(limit = 50) {
  if (isDemo) return { rows: [], unread: 0 };
  const { data, error } = await supabase.from("notifications")
    .select("id, kind, title, body, link, is_read, status, created_at, site_id, sites(name)")
    .order("created_at", { ascending: false }).limit(limit);
  if (error || !data) return { rows: [], unread: 0 };
  return { rows: data, unread: data.filter(r => !r.is_read).length };
}

export async function markNotifRead(id) {
  if (isDemo) return;
  try { await supabase.from("notifications").update({ is_read: true }).eq("id", id); } catch {}
}

export async function markAllNotifRead() {
  if (isDemo) return;
  try { await supabase.from("notifications").update({ is_read: true }).eq("is_read", false); } catch {}
}

// realtime: fires cb on every new notification for this staff member
export function subscribeNotifs(staffId, cb) {
  if (isDemo || !staffId) return () => {};
  try {
    const ch = supabase.channel("notif-" + staffId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: "staff_id=eq." + staffId },
        payload => { try { cb(payload.new); } catch {} })
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  } catch { return () => {}; }
}
