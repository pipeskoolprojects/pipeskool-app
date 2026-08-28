// Notice Board + Daily Quote — update127
// Tables: notices, notice_targets, notice_attachments, notice_reads, notice_acks,
//         notice_comments, daily_quotes, app_settings, notifications (bell)
import { supabase, isDemo } from "./supabase";
import { notifyUsers } from "./notify";

export const PRIORITIES = [
  ["normal", "Normal"], ["important", "Important"], ["urgent", "Urgent"], ["emergency", "Emergency"],
];
export const CATEGORIES = [
  ["general", "General"], ["hr", "HR"], ["safety", "Safety"], ["quality", "Quality"],
  ["material", "Material"], ["client", "Client Instruction"], ["technical", "Technical"],
  ["accounts", "Accounts"], ["payroll", "Payroll"], ["holiday", "Holiday"],
  ["festival", "Festival"], ["maintenance", "Maintenance"],
];
const PRIORITY_WEIGHT = { emergency: 0, urgent: 1, important: 2, normal: 3 };

// permission helper: true if the tick exists on ANY of the user's sites
import { canAnySite } from "./auth";
export function canAny(sess, module, action) {
  if (!sess) return false;
  if (sess.role === "director") return true;
  return canAnySite(sess, module, action);
}

// ---------- QUOTES ----------
export async function getTodayQuote() {
  if (isDemo) return "Quality is never an accident — it is always the result of intelligent effort.";
  const { data, error } = await supabase.rpc("fn_today_quote");
  return error ? null : data;
}
export async function getTodayQuoteRow() {
  const { data } = await supabase.from("daily_quotes").select("*")
    .eq("quote_date", new Date().toISOString().slice(0, 10)).maybeSingle();
  return data || null;
}
export async function regenerateTodayQuote() {
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("daily_quotes").update({ quote_date: null }).eq("quote_date", today);
  const { data, error } = await supabase.rpc("fn_today_quote");
  return error ? { ok: false, error: error.message } : { ok: true, text: data };
}
export async function saveQuoteText(id, text) {
  const { error } = await supabase.from("daily_quotes").update({ text: text.trim(), is_manual: true }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function toggleQuoteFavorite(id, fav) {
  const { error } = await supabase.from("daily_quotes").update({ is_favorite: fav }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function getQuoteHistory(n = 30) {
  const { data } = await supabase.from("daily_quotes").select("id, text, theme, quote_date, is_favorite")
    .not("quote_date", "is", null).order("quote_date", { ascending: false }).limit(n);
  return data || [];
}

// ---------- NOTICES ----------
function audienceMatches(n, sess) {
  if (!sess) return false;
  if (n.audience_type === "company") return true;
  const t = n.notice_targets || [];
  const mySites = (sess.sites || []).map(s => Number(s.id));
  if (n.audience_type === "sites") return t.some(x => x.site_id && mySites.includes(Number(x.site_id)));
  if (n.audience_type === "roles") return t.some(x => x.role && x.role === sess.role);
  if (n.audience_type === "staff") return t.some(x => Number(x.staff_id) === Number(sess.id));
  return false;
}

// Full live board for the current user (admin sees everything)
export async function getNotices(sess, { includeExpired = false } = {}) {
  if (isDemo) return [];
  const today = new Date().toISOString().slice(0, 10);
  const PAGE = 1000; let all = [], from = 0;   // page — never trust the 1000 cap
  for (;;) {
    const { data, error } = await supabase.from("notices")
      .select("*, notice_targets(*), notice_attachments(*), creator:created_by(full_name)")
      .eq("is_active", true).lte("start_date", today)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) break;
    all = all.concat(data || []);
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  const admin = canAny(sess, "notices", "manage") || sess?.role === "director";
  let list = all.filter(n => includeExpired || !n.expiry_date || n.expiry_date >= today);
  if (!admin) list = list.filter(n => audienceMatches(n, sess));
  list.sort((a, b) =>
    (b.is_pinned - a.is_pinned) ||
    (PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]) ||
    (a.created_at < b.created_at ? 1 : -1));
  return list;
}

export async function getMyReadsAcks(sessId) {
  const [r, a] = await Promise.all([
    supabase.from("notice_reads").select("notice_id").eq("staff_id", sessId),
    supabase.from("notice_acks").select("notice_id").eq("staff_id", sessId),
  ]);
  return {
    reads: new Set((r.data || []).map(x => x.notice_id)),
    acks: new Set((a.data || []).map(x => x.notice_id)),
  };
}
export async function markRead(noticeId, staffId) {
  if (!staffId) return;
  await supabase.from("notice_reads").upsert({ notice_id: noticeId, staff_id: staffId }, { onConflict: "notice_id,staff_id", ignoreDuplicates: true });
}
export async function acknowledge(noticeId, staffId) {
  const { error } = await supabase.from("notice_acks").upsert({ notice_id: noticeId, staff_id: staffId }, { onConflict: "notice_id,staff_id", ignoreDuplicates: true });
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function getNoticeStats(noticeId) {
  const [r, a] = await Promise.all([
    supabase.from("notice_reads").select("staff_id, read_at, app_users(full_name)").eq("notice_id", noticeId),
    supabase.from("notice_acks").select("staff_id, ack_at, app_users(full_name)").eq("notice_id", noticeId),
  ]);
  return {
    reads: (r.data || []).map(x => ({ name: x.app_users?.full_name, at: x.read_at })),
    acks: (a.data || []).map(x => ({ name: x.app_users?.full_name, at: x.ack_at })),
  };
}

export async function getComments(noticeId) {
  const { data } = await supabase.from("notice_comments")
    .select("id, body, created_at, app_users(full_name)").eq("notice_id", noticeId).order("created_at");
  return data || [];
}
export async function addComment(noticeId, staffId, body) {
  const { error } = await supabase.from("notice_comments").insert({ notice_id: noticeId, staff_id: staffId, body: body.trim() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// resolve staff ids covered by an audience (for the notification bell fan-out)
async function audienceStaffIds(audience_type, targets) {
  if (audience_type === "staff") return targets.filter(t => t.staff_id).map(t => Number(t.staff_id));
  if (audience_type === "roles") {
    const roles = targets.filter(t => t.role).map(t => t.role);
    const { data } = await supabase.from("app_users").select("id").in("role", roles).eq("is_active", true);
    return (data || []).map(x => x.id);
  }
  if (audience_type === "sites") {
    const siteIds = targets.filter(t => t.site_id).map(t => Number(t.site_id));
    const { data } = await supabase.from("user_sites").select("user_id").in("site_id", siteIds);
    return Array.from(new Set((data || []).map(x => x.user_id)));
  }
  const { data } = await supabase.from("app_users").select("id").eq("is_active", true);
  return (data || []).map(x => x.id);
}

export async function createNotice(v, targets, files, sess) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data: n, error } = await supabase.from("notices").insert({
    title: v.title.trim(), body: v.body.trim(), priority: v.priority, category: v.category,
    audience_type: v.audience_type, start_date: v.start_date || new Date().toISOString().slice(0, 10),
    expiry_date: v.expiry_date || null, is_pinned: !!v.is_pinned,
    allow_comments: !!v.allow_comments, require_ack: !!v.require_ack, created_by: sess?.id || null,
  }).select("id").single();
  if (error) return { ok: false, error: error.message };

  if (v.audience_type !== "company" && targets.length) {
    await supabase.from("notice_targets").insert(targets.map(t => ({ ...t, notice_id: n.id })));
  }
  for (const f of files || []) {
    const path = `notices/${n.id}/${Date.now()}_${f.name.replace(/[^\w.\-]/g, "_")}`;
    const up = await supabase.storage.from("attendance-photos").upload(path, f, { upsert: true });
    if (!up.error) {
      const url = supabase.storage.from("attendance-photos").getPublicUrl(path).data.publicUrl;
      await supabase.from("notice_attachments").insert({ notice_id: n.id, name: f.name, url, mime: f.type, uploaded_by: sess?.id || null });
    }
  }
  // in-app bell fan-out (best effort)
  try {
    const ids = await audienceStaffIds(v.audience_type, targets);
    if (ids.length) await notifyUsers({ userIds: ids, kind: "notice", requestId: n.id,
      title: `${v.priority === "normal" ? "" : "[" + v.priority.toUpperCase() + "] "}${v.title.trim()}`,
      body: v.category, link: "/notices" });
  } catch {}
  try { await supabase.from("module_audit_log").insert({ module: "notices", action: "created", ref_id: n.id, staff_id: sess?.id || null }); } catch {}
  return { ok: true, id: n.id };
}

export async function updateNotice(id, v, sess) {
  const { error } = await supabase.from("notices").update({
    title: v.title.trim(), body: v.body.trim(), priority: v.priority, category: v.category,
    start_date: v.start_date, expiry_date: v.expiry_date || null,
    is_pinned: !!v.is_pinned, allow_comments: !!v.allow_comments, require_ack: !!v.require_ack,
    edited_at: new Date().toISOString(),
  }).eq("id", id);
  try { await supabase.from("module_audit_log").insert({ module: "notices", action: "modified", ref_id: id, staff_id: sess?.id || null }); } catch {}
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function setPinned(id, pinned, sess) {
  const { error } = await supabase.from("notices").update({ is_pinned: pinned }).eq("id", id);
  try { await supabase.from("module_audit_log").insert({ module: "notices", action: pinned ? "pinned" : "unpinned", ref_id: id, staff_id: sess?.id || null }); } catch {}
  return error ? { ok: false, error: error.message } : { ok: true };
}
export async function deactivateNotice(id, sess) {
  const { error } = await supabase.from("notices").update({ is_active: false }).eq("id", id);
  try { await supabase.from("module_audit_log").insert({ module: "notices", action: "removed", ref_id: id, staff_id: sess?.id || null }); } catch {}
  return error ? { ok: false, error: error.message } : { ok: true };
}

// unread badge for the sidebar
export async function getUnreadNoticeCount(sess) {
  if (!sess || isDemo) return 0;
  try {
    const [list, mine] = await Promise.all([getNotices(sess), getMyReadsAcks(sess.id)]);
    return list.filter(n => !mine.reads.has(n.id)).length;
  } catch { return 0; }
}
