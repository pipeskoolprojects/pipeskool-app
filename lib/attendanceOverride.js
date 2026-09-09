"use client";
// update335: ATTENDANCE OVERRIDE — manual attendance for a day with no punch.
//
// Everything here goes through SECURITY DEFINER functions. The right is re-checked in the
// database on every call, so a user who edits the page in their browser still cannot write
// a single row. The UI gate is a convenience, never the protection.
//
// A "leave" marker sets status = 'absent' and marks the day L on the grid. It does NOT
// invent a new payroll status: staff absences already convert to paid leave against the
// annual balance, labour absences are already unpaid. The marker changes what you SEE,
// never what payroll computes.
import { supabase, isDemo } from "./supabase";

export const OVERRIDE_STATES = [
  { key: "present",  label: "1 · Present",  status: "present",  marker: null },
  { key: "half_day", label: "0.5 · Half",   status: "half_day", marker: null },
  { key: "absent",   label: "0 · Absent",   status: "absent",   marker: null },
  { key: "leave",    label: "L · Leave",    status: "absent",   marker: "leave" },
];

export async function setAttendanceOverride({ workerId, siteId, date, status, marker, otHours, reason }) {
  if (isDemo) return { ok: true, action: "edited" };
  const { data, error } = await supabase.rpc("fn_attendance_override", {
    p_worker_id: Number(workerId),
    p_site_id: siteId == null ? null : Number(siteId),
    p_att_date: date,
    p_status: status,
    p_ot_hours: otHours === "" || otHours == null ? null : Number(otHours),
    p_marker: marker || null,
    p_reason: reason || null,
  });
  if (error) return { ok: false, error: clean(error) };
  return { ok: true, action: data?.action, oldStatus: data?.old_status };
}

export async function getAttendanceAudit({ from, to, workerId, limit = 200 } = {}) {
  if (isDemo) return [];
  const { data, error } = await supabase.rpc("fn_attendance_audit", {
    p_from: from || null, p_to: to || null,
    p_worker_id: workerId == null ? null : Number(workerId), p_limit: limit,
  });
  if (error) throw new Error(clean(error));
  return data || [];
}

function clean(error) {
  const m = String(error?.message || "Something went wrong");
  if (/fn_attendance_override|fn_attendance_audit|attendance_audit|override_by|schema cache/i.test(m))
    return "Run pipeskool_attendance_override.sql (update 335) in Supabase first.";
  if (/row-level security/i.test(m)) return "You do not have the Attendance Override right.";
  return m.replace(/^.*?ERROR:\s*/i, "");
}
