"use client";
// update398: OT rules + round-off slabs behind Calendar → Rules → Overtime.
// The slabs drive the OT suggestion shown at approval (otRound); approval itself stays manual.
import { supabase, isDemo } from "./supabase";
import { setOtSlabs } from "./payroll";

const clean = e => { const m = String(e?.message || e || ""); return /ot_rules|ot_round_slabs|fn_ot_|schema cache/i.test(m) ? "Run pipeskool_ot_rules.sql (update 398) in Supabase first." : m.replace(/^.*?ERROR:\s*/i, ""); };

export async function getOtRules() { if (isDemo) return []; const { data, error } = await supabase.from("ot_rules").select("*").order("id"); if (error) throw new Error(clean(error)); return data || []; }
export async function saveOtRule(id, p) { if (isDemo) return { ok: false, error: "Demo mode." }; const { data, error } = await supabase.rpc("fn_ot_rule_save", { p_id: id || null, p }); return error ? { ok: false, error: clean(error) } : { ok: true, id: data }; }
export async function deleteOtRule(id) { if (isDemo) return { ok: false, error: "Demo mode." }; const { error } = await supabase.rpc("fn_ot_rule_delete", { p_id: id }); return error ? { ok: false, error: clean(error) } : { ok: true }; }
export async function getOtSlabs() { if (isDemo) return []; const { data, error } = await supabase.from("ot_round_slabs").select("*").order("from_min"); if (error) throw new Error(clean(error)); setOtSlabs(data || []); return data || []; }
export async function saveOtSlab(id, from, to, hours) { if (isDemo) return { ok: false, error: "Demo mode." }; const { error } = await supabase.rpc("fn_ot_slab_save", { p_id: id || null, p_from: Number(from), p_to: Number(to), p_hours: Number(hours) }); return error ? { ok: false, error: clean(error) } : { ok: true }; }
export async function deleteOtSlab(id) { if (isDemo) return { ok: false, error: "Demo mode." }; const { error } = await supabase.rpc("fn_ot_slab_delete", { p_id: id }); return error ? { ok: false, error: clean(error) } : { ok: true }; }
// warm the otRound cache (muster pages call this once)
export async function loadOtSlabs() { try { await getOtSlabs(); } catch {} }
export const fmtRange = (f, t) => { const x = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; return f === 0 && t === 60 ? "Less than or up to 1 hour" : `${x(f)} - ${x(t)} hours`; };
