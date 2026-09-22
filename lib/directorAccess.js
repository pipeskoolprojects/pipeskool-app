"use client";
// update409: DIRECTOR ACCESS — explicit per-user grant for sensitive actions (server-enforced).
import { supabase, isDemo } from "./supabase";
const clean = e => { const m = String(e?.message || e || ""); return /fn_director_access|director_access|schema cache/i.test(m) ? "Run pipeskool_director_access.sql (update 409) in Supabase first." : m.replace(/^.*?ERROR:\s*/i, ""); };
export async function hasDirectorAccess() { if (isDemo) return false; const { data } = await supabase.rpc("fn_has_director_access"); return !!data; }
export async function listDirectorAccess() { if (isDemo) return []; const { data, error } = await supabase.rpc("fn_director_access_list"); if (error) throw new Error(clean(error)); return data || []; }
export async function setDirectorAccess(userId, grant) { if (isDemo) return { ok: false, error: "Demo mode." }; const { error } = await supabase.rpc("fn_director_access_set", { p_user_id: userId, p_grant: !!grant }); return error ? { ok: false, error: clean(error) } : { ok: true }; }
