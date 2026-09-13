"use client";
// update259: PIPESKOOL CALENDAR — an aggregator, not a new data store.
//
// Every event is read live from the module that already owns it. Nothing is copied into a
// calendar table, so there is no sync to go stale and no second source of truth: change a
// PO's expected delivery and the calendar moves with it.
//
// Permissions are inherited too. These are ordinary reads of the same tables the modules use,
// so RLS and the project scope (lib/scope) apply exactly as they do everywhere else.
import { supabase, isDemo } from "./supabase";
import { scoped, isScoped } from "./scope";
import { getSession } from "./auth";   // update375

// update375
function scopeTasks(q) {
  const me = getSession();
  if (!me || me.role === "director") return q;
  return q.or(`assigned_to.eq.${Number(me.id)},assigned_by.eq.${Number(me.id)}`);
}

export const EVENT_TYPES = {
  holiday:    { label: "Holiday",           icon: "\u{1FA94}", bg: "#FF6A1F", fg: "#fff" },
  attendance: { label: "Attendance",        icon: "\u{1F464}", bg: "#E3E8FF", fg: "#4C5CE0" },
  task:       { label: "Tasks / DPR",       icon: "\u2714",    bg: "#FFE9DA", fg: "#E0561A" },
  project:    { label: "Project dates",     icon: "\u{1F3D7}", bg: "#DFF3E6", fg: "#1B9D57" },
  po:         { label: "PO / GRN / Challan", icon: "\u{1F4E6}", bg: "#F3E3FF", fg: "#8A3FE0" },
  expense:    { label: "Expenses",          icon: "\u{1F4B3}", bg: "#FDE3E3", fg: "#D9382C" },
  approval:   { label: "Approvals",         icon: "\u2705",    bg: "#FFF3D6", fg: "#C98A0E" },
  payroll:    { label: "Salary / Payroll",  icon: "\u{1F4B0}", bg: "#D6F3EF", fg: "#0E9E88" },
};

export const STATUS_META = {
  pending:   ["Pending",   "#C98A0E"],
  completed: ["Completed", "#1B9D57"],
  overdue:   ["Overdue",   "#D9382C"],
  upcoming:  ["Upcoming",  "#4C5CE0"],
};

export const iso = d => {
  const x = d instanceof Date ? d : new Date(d);
  return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");
};

// the 6-week block a month grid shows, Sunday-first
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({ date: d, key: iso(d), inMonth: d.getMonth() === month });
  }
  return days;
}

const today = () => iso(new Date());
function stateOf(dateKey, done) {
  if (done) return "completed";
  const t = today();
  if (dateKey < t) return "overdue";
  if (dateKey > t) return "upcoming";
  return "pending";
}

// ---------------------------------------------------------------------------
// One call per source, in parallel, bounded to the visible range.
// A source that fails returns nothing rather than breaking the whole calendar.
// ---------------------------------------------------------------------------
export async function getCalendarEvents(from, to, { siteId = null } = {}) {
  if (isDemo) return [];
  const site = scoped(siteId);
  const bySite = q => (isScoped(site) ? q.eq("site_id", site) : q);
  const ev = [];
  const safe = p => p.then(r => r).catch(() => ({ data: [] }));

  const [hol, tasks, projects, pos, exps, petty, adv] = await Promise.all([
    safe(supabase.from("company_holidays").select("id, on_date, name, site_ids, applies_to, note").gte("on_date", from).lte("on_date", to)),   // update293
    // update375: the calendar sees the same tasks the task list does — a Director sees all,
    // anyone else only what is assigned to or by them
    safe(bySite(scopeTasks(supabase.from("staff_tasks")
      .select("id, title, due_at, status, site_id, assignee:assigned_to(full_name)")
      .gte("due_at", from).lte("due_at", to + "T23:59:59")))),
    safe(supabase.from("sites").select("id, name, start_date, end_date, expected_start, status")),
    safe(bySite(supabase.from("purchase_orders")
      .select("id, po_no, vendor_name, expected_delivery, delivery_status, status, site_id")
      .gte("expected_delivery", from).lte("expected_delivery", to).neq("status", "cancelled"))),
    safe(bySite(supabase.from("expenses")
      .select("id, expense_date, amount, category, status, site_id, claimant:claimant_user_id(full_name)")
      .gte("expense_date", from).lte("expense_date", to))),
    safe(bySite(supabase.from("petty_cash_requests")
      .select("id, amount, purpose, required_date, status, site_id, requester:requested_by(full_name)")
      .gte("required_date", from).lte("required_date", to))),
    safe(bySite(supabase.from("advance_salary_requests")
      .select("id, req_no, beneficiary_name, amount, status, created_at, site_id")
      .gte("created_at", from).lte("created_at", to + "T23:59:59"))),
  ]);

  (hol.data || []).forEach(h => {
    const list = h.site_ids || [];
    if (isScoped(site) && list.length && !list.map(Number).includes(Number(site))) return;
    const who = h.applies_to || "both";   // update293: audience on the chip; observances are not paid
    const whoLbl = who === "both" ? "\ud83c\udfe2 Office + \ud83d\udc77 Workers" : who === "staff" ? "\ud83c\udfe2 Office/Staff" : who === "labour" ? "\ud83d\udc77 Workers/Labour" : "\ud83d\udcff Observance \u00b7 not a paid day";
    ev.push({ id: "hol" + h.id, hid: h.id, site_ids: h.site_ids || [], applies_to: who, note: h.note || "", type: "holiday", date: h.on_date, title: h.name,
      sub: whoLbl + (who === "none" ? "" : " \u00b7 paid holiday") + (list.length ? " \u00b7 selected sites" : "") + (h.note ? " \u00b7 " + h.note : ""),
      state: "upcoming", href: "/leave" });
  });

  (tasks.data || []).forEach(t => {
    const d = String(t.due_at).slice(0, 10);
    ev.push({ id: "task" + t.id, type: "task", date: d, title: t.title,
      sub: t.assignee?.full_name || "Unassigned", siteId: t.site_id,
      state: stateOf(d, t.status === "completed"), href: "/tasks" });
  });

  (projects.data || []).forEach(p => {
    if (isScoped(site) && String(p.id) !== String(site)) return;
    const add = (d, what) => {
      if (!d || d < from || d > to) return;
      ev.push({ id: "prj" + p.id + what, type: "project", date: d, title: p.name + " \u2014 " + what,
        sub: "Project date", siteId: p.id, state: stateOf(d, p.status === "completed"),
        href: "/projects/" + p.id });
    };
    add(p.start_date, "start"); add(p.end_date, "target finish"); add(p.expected_start, "expected start");
  });

  (pos.data || []).forEach(p => {
    const done = ["delivered", "received", "closed"].includes(p.delivery_status);
    ev.push({ id: "po" + p.id, type: "po", date: p.expected_delivery,
      title: p.po_no + " delivery", sub: p.vendor_name, siteId: p.site_id,
      state: stateOf(p.expected_delivery, done), href: "/procure/pending" });
  });

  (exps.data || []).forEach(x => {
    ev.push({ id: "exp" + x.id, type: "expense", date: x.expense_date,
      title: x.category + " \u00b7 \u20b9" + Number(x.amount || 0).toLocaleString("en-IN"),
      sub: x.claimant?.full_name || "", siteId: x.site_id,
      state: x.status === "approved" ? "completed" : x.status === "rejected" ? "completed" : stateOf(x.expense_date, false),
      href: "/expenses" });
  });

  (petty.data || []).forEach(x => {
    ev.push({ id: "petty" + x.id, type: "approval", date: x.required_date,
      title: "Petty cash \u00b7 \u20b9" + Number(x.amount || 0).toLocaleString("en-IN"),
      sub: (x.requester?.full_name || "") + (x.purpose ? " \u2014 " + x.purpose : ""), siteId: x.site_id,
      state: x.status === "pending" ? stateOf(x.required_date, false) : "completed", href: "/approvals" });
  });

  (adv.data || []).forEach(x => {
    const d = String(x.created_at).slice(0, 10);
    ev.push({ id: "adv" + x.id, type: "approval", date: d,
      title: "Advance \u00b7 " + x.beneficiary_name,
      sub: "\u20b9" + Number(x.amount || 0).toLocaleString("en-IN") + " \u00b7 " + x.req_no, siteId: x.site_id,
      state: x.status === "pending" ? stateOf(d, false) : "completed", href: "/expenses" });
  });

  // payroll is a rule, not a row: salary for a month is due on the 1st of the next one
  const d0 = new Date(from + "T00:00:00"), d1 = new Date(to + "T00:00:00");
  for (let y = d0.getFullYear(), m = d0.getMonth(); new Date(y, m, 1) <= d1; m++) {
    if (m > 11) { m = -1; y++; continue; }
    const first = new Date(y, m, 1), k = iso(first);
    if (k >= from && k <= to) {
      const prev = new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
      ev.push({ id: "pay" + k, type: "payroll", date: k, title: "Payroll due \u2014 " + prev,
        sub: "Generate and approve wages & staff salary", state: stateOf(k, false), href: "/wages" });
    }
  }

  return ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function groupByDate(events) {
  const m = {};
  (events || []).forEach(e => { if (e.date) (m[e.date] = m[e.date] || []).push(e); });
  return m;
}
