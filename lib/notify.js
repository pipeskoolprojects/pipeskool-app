// lib/notify.js — update157: one notification engine for every request module.
// Any future module = one notifyRequest() call after its submit succeeds and
// one notifyDecision() call after its review succeeds. Routing (who receives
// what) is Director-managed in Access Rights; the database enforces it.
import { supabase, isDemo } from "./supabase";
import { sendPush } from "./push";

// update364: EVERY KIND OPENS ITS OWN MODULE, carrying the record id.
//
// 352 and 353 sent the three money kinds to a single combined Approvals screen. That was the
// wrong shape: it is a second list of things that already have their own screens, it omits
// material indents entirely, and it means a PO notification and an expense notification land
// in the same place. Each kind now points at the module that owns the record.
//
// The link goes through /go?to=… because the destination differs by device — /procure on a
// desktop, /m/indent in the installed Android app — and the link is written on the SERVER
// when the notification is sent, which cannot know which one it will be opened on.
export const NOTIFY_KINDS = [
  { code: "po_approval", label: "PO approval",               to: "indent", param: "po" },      // Material & Procurement
  { code: "indent",      label: "Material indents",          to: "indent", param: "indent" },  // Indent & Purchase
  { code: "advance",     label: "Advance salary requests",   to: "money",  param: "advance" }, // Expenses & Petty Cash
  { code: "expense",     label: "Expense / petty-cash claims", to: "money", param: "claim" },
  { code: "petty",       label: "Petty cash requests",       to: "money",  param: "petty" },
  { code: "leave",       label: "Leave requests",            to: "leave",  param: "id" },
  { code: "task",        label: "Tasks",                     to: "tasks",  param: "id" },
  { code: "ticket",      label: "Support tickets",           to: "tickets", param: "id" },
];
// the id travels with the link, so the destination can open THAT record rather than a list
function linkOf(kind, requestId) {
  const k = NOTIFY_KINDS.find(x => x.code === kind);
  if (!k) return "/";
  const q = requestId ? `&${k.param}=${encodeURIComponent(requestId)}` : "";
  return `/go?to=${k.to}${q}`;
}

// new request -> routed receivers only (best-effort: never blocks the action)
export async function notifyRequest({ kind, requestId, siteId, title, body }) {
  if (isDemo) return;
  try {
    await supabase.rpc("fn_notify_request", {
      p_kind: kind, p_request_id: requestId || null, p_site_id: siteId || null,
      p_title: title, p_body: body || "", p_link: linkOf(kind, requestId),
    });
  } catch {}
  try {   // update202: phone push to the approvers (directors; money kinds also reach accountant/IT via caps in-app)
    const { data: dirs } = await supabase.from("app_users").select("id").eq("role", "director").eq("is_active", true);
    sendPush((dirs || []).map(d => d.id), { title, body, link: linkOf(kind, requestId), tag: kind });
  } catch {}
}

// approved / rejected -> ONLY the original requester
export async function notifyDecision({ toUserId, kind, requestId, siteId, title, body, status }) {
  if (isDemo || !toUserId) return;
  try {
    await supabase.rpc("fn_notify_user", {
      p_user_id: toUserId, p_kind: kind, p_request_id: requestId || null, p_site_id: siteId || null,
      p_title: title, p_body: body || "", p_link: linkOf(kind, requestId), p_status: status || null,
    });
  } catch {}
  sendPush([toUserId], { title, body, link: linkOf(kind, requestId), tag: kind });   // update202/364
}

// bulk (approver chains, admins, notice audiences)
export async function notifyUsers({ userIds, kind, requestId, siteId, title, body, status, link }) {
  if (isDemo || !userIds?.length) return;
  try {
    await supabase.rpc("fn_notify_users", {
      p_user_ids: userIds, p_kind: kind, p_request_id: requestId || null, p_site_id: siteId || null,
      p_title: title, p_body: body || "", p_link: link || linkOf(kind, requestId), p_status: status || null,
    });
  } catch {}
  sendPush(userIds, { title, body, link: link || linkOf(kind, requestId), tag: kind });   // update202/364
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
