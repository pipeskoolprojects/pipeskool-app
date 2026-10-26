// update477: pure date helpers shared by the DPR screen and its tests (no browser, no Supabase).
export const isoDate = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
export const fromIso = k => new Date(k + "T00:00:00");

// What the calendar shows for one month. filled/off/pending come from the server (fn_dpr_month_status);
// this only classifies each day for drawing: done | pending | off | future | before-start.
export function classifyMonth({ year, month, filled = [], pending = [], off = [], today, startDate }) {
  const F = new Set(filled), P = new Set(pending), O = new Set(off);
  const n = new Date(year, month, 0).getDate(), out = [];
  for (let d = 1; d <= n; d++) {
    const k = isoDate(new Date(year, month - 1, d));
    let state = "future";
    if (F.has(k)) state = "done";                               // a DPR is never pending, Sunday or not
    else if (k >= today) state = "future";
    else if (startDate && k < startDate) state = "before";
    else if (P.has(k)) state = "pending";
    else if (O.has(k)) state = "off";
    else state = "off";                                         // server did not list it as pending → treat as non-working
    out.push({ date: k, day: d, state, isToday: k === today });
  }
  return out;
}
// mirror of the server's pending rule, used by tests and by the summary before the server answers
export function pendingDates({ year, month, filled = [], off = [], today, startDate }) {
  const F = new Set(filled), O = new Set(off), n = new Date(year, month, 0).getDate(), out = [];
  for (let d = 1; d <= n; d++) {
    const dt = new Date(year, month - 1, d), k = isoDate(dt);
    if (k >= today || (startDate && k < startDate) || F.has(k) || O.has(k) || dt.getDay() === 0) continue;
    out.push(k);
  }
  return out;
}
export const DPR_RANGE_MAX_DAYS = 62;
// client-side pre-check (the server repeats every rule)
export function validateLateEntry({ dates, reason, work, today, maxDays = DPR_RANGE_MAX_DAYS }) {
  if (!dates?.length) return "Pick at least one date.";
  if (dates.some(d => d >= today)) return "Past dates only — today is filled from the Today tab, future dates are not allowed.";
  if (dates.length > maxDays) return `A range can cover at most ${maxDays} days.`;
  if (String(reason || "").trim().length < 3) return "Please add the reason for the late entry (at least 3 characters).";
  if (!(work || []).some(w => String(w || "").trim())) return "Add at least one work point.";
  return "";
}
export function monthBounds(year, month) { const n = new Date(year, month, 0).getDate(); const p = m => String(m).padStart(2, "0"); return { from: `${year}-${p(month)}-01`, to: `${year}-${p(month)}-${p(n)}` }; }
