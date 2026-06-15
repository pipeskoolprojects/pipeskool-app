"use client";
import { supabase, isDemo } from "./supabase";

// catalog of modules+actions (for column/checkbox layout)
const demoCatalog = [
  ["attendance","Attendance",[["view","View register"],["create","Mark / punch"],["verify","Verify day"]]],
  ["dpr","Daily Progress",[["view","View DPR"],["create","Submit DPR"]]],
  ["money","Money / Expense",[["view","View"],["create","Raise"],["approve","Approve"]]],
  ["stock","Material Stock",[["view","View"],["create","GRN / issue"]]],
  ["indent","Indent & Purchase",[["view","View"],["create","Raise"],["approve","Approve / PO"]]],
  ["assets","Tools & Assets",[["view","View"],["create","Transfer / add"]]],
  ["wages","Muster & Wages",[["view","View"],["approve","Approve payout"]]],
  ["workers","Workers",[["view","View"],["create","Add / edit"]]],
  ["rights","Access Rights",[["view","Open"],["approve","Change rights"]]],
];

export async function getCatalog() {
  if (isDemo) return demoCatalog;
  const { data } = await supabase.from("permission_catalog")
    .select("module_key, module_label, action, action_label, sort_order").order("sort_order");
  const map = {};
  (data || []).forEach(r => {
    map[r.module_key] = map[r.module_key] || [r.module_key, r.module_label, []];
    map[r.module_key][2].push([r.action, r.action_label]);
  });
  return Object.values(map);
}

export async function getStaffList() {
  if (isDemo) return [
    { id: 1, full_name: "Keyal Shah", role: "director" },
    { id: 3, full_name: "S. Desai", role: "supervisor" },
    { id: 4, full_name: "M. Joshi", role: "supervisor" },
  ];
  const { data } = await supabase.from("app_users")
    .select("id, full_name, role").eq("is_active", true).order("full_name");
  return data || [];
}

// effective ticks for a user: {'module:action': true}
export async function getUserPermissions(userId) {
  if (isDemo) return {};
  const { data } = await supabase.from("v_effective_permissions")
    .select("module_key, action").eq("user_id", userId);
  const out = {};
  (data || []).forEach(p => { out[`${p.module_key}:${p.action}`] = true; });
  return out;
}

// save a single tick (grant/revoke) as an explicit override
export async function setPermission(userId, moduleKey, action, granted, setBy) {
  if (isDemo) return { ok: true };
  const { error } = await supabase.from("user_permissions")
    .upsert({ user_id: userId, module_key: moduleKey, action, granted, set_by: setBy },
            { onConflict: "user_id,module_key,action" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
