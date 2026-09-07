// update219: TASK SYSTEM — Director/IT assign, staff execute. Additive module; uses the
// existing notification machinery (in-app bell + Android push) for every event.
import { supabase, isDemo } from "./supabase";
import { notifyUsers } from "./notify";
import { PUBLIC_BUCKET } from "./stock";

const SEL = "id, title, description, site_id, priority, due_at, status, remarks, completed_at, created_at, sites(name), assignee:assigned_to(id, full_name, role), assigner:assigned_by(id, full_name)";
const row = t => ({
  id: t.id, title: t.title, description: t.description || "", site_id: t.site_id, site: t.sites?.name || "",
  priority: t.priority, due_at: t.due_at, due: t.due_at ? t.due_at.slice(0, 16).replace("T", " ") : "",
  status: t.status, remarks: t.remarks || "", completed_at: t.completed_at, created_at: t.created_at,
  assignee_id: t.assignee?.id, assignee: t.assignee?.full_name || "", assignee_role: (t.assignee?.role || "").replace("_", " "),
  assigner_id: t.assigner?.id, assigner: t.assigner?.full_name || "",
});

export async function getStaffOptions() {
  if (isDemo) return [];
  const { data } = await supabase.from("app_users").select("id, full_name, role").eq("is_active", true).order("full_name");
  return (data || []).map(u => ({ id: u.id, name: u.full_name, role: (u.role || "").replace("_", " ") }));
}

export async function getTasks() {   // RLS scopes: admin sees all, staff see own
  if (isDemo) return [];
  const { data, error } = await supabase.from("staff_tasks").select(SEL).order("created_at", { ascending: false }).limit(500);
  if (error) return { error: /staff_tasks|schema cache/i.test(error.message) ? "Run pipeskool_tasks.sql (update 219) first." : error.message };
  return (data || []).map(row);
}

export async function createTask(p, meId) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (!p.title?.trim()) return { ok: false, error: "Task title is required." };
  if (!p.assigned_to) return { ok: false, error: "Pick who this task is for." };
  const { data, error } = await supabase.from("staff_tasks").insert({
    title: p.title.trim(), description: p.description || "", site_id: p.site_id || null,
    assigned_to: Number(p.assigned_to), assigned_by: meId, priority: p.priority || "normal",
    due_at: p.due_at || null, repeat: p.repeat || "none",
  }).select(SEL).single();
  if (error) return { ok: false, error: /staff_tasks|schema cache/i.test(error.message) ? "Run pipeskool_tasks.sql (update 219) first." : error.message };
  notifyUsers({ userIds: [Number(p.assigned_to)], kind: "task", requestId: data.id, siteId: p.site_id || null,
    title: "📋 New task assigned", body: p.title + (p.due_at ? " · due " + p.due_at.slice(0, 16).replace("T", " ") : ""), link: "/m/tasks" });
  return { ok: true, task: row(data) };
}

export async function editTask(id, p) {   // Director/IT (RLS-enforced)
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("staff_tasks").update({
    title: p.title, description: p.description || "", site_id: p.site_id || null,
    assigned_to: Number(p.assigned_to), priority: p.priority, due_at: p.due_at || null,
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  notifyUsers({ userIds: [Number(p.assigned_to)], kind: "task", requestId: id, title: "📋 Task updated", body: p.title, link: "/m/tasks" });   // update327
  return { ok: true };
}

export async function deleteTask(id) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("staff_tasks").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// update220: staff of one or many sites (for whole-site / multi-site assignment)
export async function getSiteStaff(siteIds) {
  if (isDemo || !siteIds?.length) return [];
  const { data } = await supabase.from("user_sites").select("user_id, site_id, app_users(id, full_name, role, is_active)").in("site_id", siteIds.map(Number));
  const seen = {}; (data || []).forEach(r => { const u = r.app_users; if (u?.is_active && u.role !== "director") seen[u.id] = { id: u.id, name: u.full_name, role: u.role }; });
  return Object.values(seen);
}

// update220: assign one task to many people (whole site / multiple sites) — one row each,
// one combined notification. Repeat rides along on every row.
export async function assignTaskBulk(p, userIds, meId) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  if (!p.title?.trim()) return { ok: false, error: "Task title is required." };
  if (!userIds?.length) return { ok: false, error: "No one matches this selection." };
  const rows2 = userIds.map(uid => ({ title: p.title.trim(), description: p.description || "", site_id: p.site_id || null,
    assigned_to: Number(uid), assigned_by: meId, priority: p.priority || "normal", due_at: p.due_at || null, repeat: p.repeat || "none" }));
  const { data, error } = await supabase.from("staff_tasks").insert(rows2).select("id");
  if (error) return { ok: false, error: /repeat/.test(error.message) ? "Run pipeskool_tasks_v2.sql (update 220) first." : error.message };
  notifyUsers({ userIds: userIds.map(Number), kind: "task", requestId: data?.[0]?.id, siteId: p.site_id || null,
    title: "📋 New task assigned", body: p.title + (p.due_at ? " · due " + p.due_at.slice(0, 16).replace("T", " ") : ""), link: "/m/tasks" });   // update327
  return { ok: true, count: rows2.length };
}

export async function setTaskStatus(id, status, remarks, meName, title) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { data, error } = await supabase.rpc("fn_task_set_status", { p_id: id, p_status: status, p_remarks: remarks || null });
  if (error) return { ok: false, error: /fn_task_set_status|schema cache/i.test(error.message) ? "Run pipeskool_tasks.sql (update 219) first." : error.message };
  if (!data?.ok) return { ok: false, error: data?.error || "Failed" };
  if (data.assigned_by) {
    const label = status === "completed" ? "✅ Task completed" : status === "in_progress" ? "▶ Task started" : "📋 Task reset to pending";
    notifyUsers({ userIds: [data.assigned_by], kind: "task", requestId: id, title: label, body: (title || "Task") + " — by " + (meName || "assignee"), link: "/tasks" });
  }
  // update220: repeating task completed -> next occurrence auto-created
  if (status === "completed") {
    try {
      const { data: t } = await supabase.from("staff_tasks").select("title, description, site_id, assigned_to, assigned_by, priority, due_at, repeat").eq("id", id).maybeSingle();
      if (t && t.repeat && t.repeat !== "none" && t.due_at) {
        const next = new Date(t.due_at); next.setDate(next.getDate() + (t.repeat === "daily" ? 1 : 7));
        const { repeat, ...rest } = t;
        await supabase.from("staff_tasks").insert({ ...rest, repeat, due_at: next.toISOString(), status: "pending" });
      }
    } catch {}
  }
  return { ok: true };
}

export async function uploadTaskFile(taskId, file, meId) {
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const path = "tasks/" + taskId + "-" + Date.now() + "." + ext;
  const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: true });
  if (error) return { ok: false, error: error.message };
  const { error: e2 } = await supabase.from("staff_task_files").insert({ task_id: taskId, path, uploaded_by: meId });
  return e2 ? { ok: false, error: e2.message } : { ok: true, path };
}
export async function getTaskFiles(taskId) {
  const { data } = await supabase.from("staff_task_files").select("id, path, created_at").eq("task_id", taskId).order("created_at");
  return data || [];
}
export const taskFileUrl = path => path ? supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl : "";

// grouping helpers (overdue is computed, never stored)
export function groupTasks(list) {
  const now = new Date(); const today = now.toISOString().slice(0, 10);
  const open = t => t.status !== "completed";
  return {
    overdue: list.filter(t => open(t) && t.due_at && new Date(t.due_at) < now && t.due_at.slice(0, 10) !== today),
    today: list.filter(t => open(t) && t.due_at && t.due_at.slice(0, 10) === today),
    upcoming: list.filter(t => open(t) && (!t.due_at || t.due_at.slice(0, 10) > today)),
    done: list.filter(t => t.status === "completed"),
  };
}
export const PRIORITY_META = { urgent: ["Urgent", "#b91c1c"], high: ["High", "#e07020"], normal: ["Normal", "#2b6cb0"], low: ["Low", "#6b7280"] };
export const TASK_ST = { pending: ["Pending", "warn"], in_progress: ["In progress", "info"], completed: ["Completed", "p"] };
