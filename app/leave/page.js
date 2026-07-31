"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSession, canAnySite } from "@/lib/auth";
import { getStaff, getRoles } from "@/lib/access";
import {
  LEAVE_TYPES, typeLabel, getLeaveContext, getHolidays, addHoliday, deleteHoliday,
  countLeaveDays, validateLeave, applyLeave, cancelLeave, getApprovalChain,
  saveApprovalLevel, canApprove, actOnLeave, getApprovalQueue, getMonthCalendar,
  getLeaveRegister, exportCSV,
} from "@/lib/leave";

const ST = { pending: ["warn", "Pending"], approved: ["green", "Approved"], rejected: ["a", "Rejected"], cancelled: ["gray", "Cancelled"], info_needed: ["warn", "Info needed"] };

export default function LeavePage() {
  const [sess, setSess] = useState(null);
  const [tab, setTab] = useState("my");
  const [ctx, setCtx] = useState(null);
  const [hols, setHols] = useState([]);
  const [chain, setChain] = useState([]);
  const [queue, setQueue] = useState(null);
  const [form, setForm] = useState(null);
  const [doc, setDoc] = useState(null);
  const [check, setCheck] = useState(null);       // validation result
  const [cal, setCal] = useState(null);
  const [calYm, setCalYm] = useState(() => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1]; });
  const [reg, setReg] = useState(null);
  const [regRange, setRegRange] = useState(() => { const d = new Date(); const f = `${d.getFullYear()}-01-01`; return [f, d.toLocaleDateString("en-CA")]; });
  const [staffList, setStaffList] = useState([]);
  const [roles, setRoles] = useState([]);
  const [newHol, setNewHol] = useState({ on_date: "", name: "", kind: "holiday" });
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => { setSess(getSession()); }, []);
  const isDirector = sess?.role === "director";
  const isApprover = sess && (isDirector || canAnySite(sess, "leave", "approve"));

  const holidaySet = new Set(hols.map(h => h.on_date));

  const load = () => {
    if (!sess) return;
    getLeaveContext(sess.id).then(setCtx);
    getHolidays().then(setHols);
    getApprovalChain().then(setChain);
    if (isApprover) getApprovalQueue().then(setQueue);
  };
  useEffect(load, [sess, msg]);
  useEffect(() => { if (tab === "cal") getMonthCalendar(calYm[0], calYm[1]).then(setCal); }, [tab, calYm, msg]);
  useEffect(() => { if (tab === "reports") getLeaveRegister(regRange[0], regRange[1]).then(setReg); }, [tab, regRange, msg]);
  useEffect(() => { if (isDirector && tab === "settings") { getStaff().then(setStaffList); getRoles().then(rs => setRoles((rs || []).map(r => [r.code, r.label]))); } }, [isDirector, tab]);

  // live validation as the form changes
  useEffect(() => {
    if (!form || !ctx) { setCheck(null); return; }
    validateLeave(ctx, form, holidaySet).then(setCheck);
  }, [JSON.stringify(form), ctx, hols.length]);

  async function submit() {
    setErr("");
    if (!check || check.errs.length) { setErr(check?.errs[0] || "Fill the form."); return; }
    setBusy(true);
    const r = await applyLeave(sess, form, check.days, doc);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setForm(null); setDoc(null); setMsg("Leave request submitted for approval.");
  }

  const card = (label, value, sub) => (
    <div className="card"><div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}</div>);

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head"><h1>Leave Management</h1>
          {tab === "my" && <button className="primary" onClick={() => { setForm({ leave_type: "paid", from_date: "", to_date: "", reason: "", emergency_contact: "" }); setDoc(null); }}>＋ Apply leave</button>}
        </div>
        {msg && <div className="note green" style={{ marginBottom: 10 }}>{msg}</div>}
        {err && <div className="note red" style={{ marginBottom: 10 }}>{err}</div>}

        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {[["my", "My leave"], ["cal", "Calendar"],
            ...(isApprover ? [["appr", `Approvals${queue?.length ? " (" + queue.length + ")" : ""}`]] : []),
            ...(isApprover ? [["reports", "Reports"]] : []),
            ...(isDirector ? [["settings", "Settings"]] : [])].map(t => (
            <button key={t[0]} className={tab === t[0] ? "primary" : ""} style={{ fontSize: 12.5 }} onClick={() => setTab(t[0])}>{t[1]}</button>))}
        </div>

        {/* ---------------- MY LEAVE ---------------- */}
        {tab === "my" && (!ctx ? <div className="muted">Loading…</div> : <>
          <div className="cards" style={{ marginBottom: 14 }}>
            {card("Annual entitlement", ctx.annual, ctx.staff.joining_date > ctx.lyStart ? "prorated for joining date" : `leave year from ${ctx.lyStart}`)}
            {card("Used this year", ctx.used, ctx.reserved ? `+ ${ctx.reserved} reserved (approved upcoming)` : null)}
            {card("Available now", ctx.availableNow, ctx.inH1 ? "50% cap till September" : "full balance unlocked")}
            {ctx.inH1 ? card("Unlocking in October", ctx.unlockingOct, "second-half balance") : card("Remaining this year", ctx.remaining, null)}
          </div>

          {form && (
            <div className="panel" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Apply for leave</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
                <div><label className="muted">Leave type</label>
                  <select style={{ width: "100%" }} value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value, to_date: e.target.value === "half_day" ? f.from_date : f.to_date }))}>
                    {LEAVE_TYPES.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></div>
                <div><label className="muted">From</label>
                  <input type="date" style={{ width: "100%" }} value={form.from_date} onChange={e => setForm(f => ({ ...f, from_date: e.target.value, to_date: f.leave_type === "half_day" ? e.target.value : f.to_date || e.target.value }))} /></div>
                <div><label className="muted">To</label>
                  <input type="date" style={{ width: "100%" }} disabled={form.leave_type === "half_day"} value={form.to_date} onChange={e => setForm(f => ({ ...f, to_date: e.target.value }))} /></div>
                <div><label className="muted">Emergency contact (during leave)</label>
                  <input style={{ width: "100%" }} value={form.emergency_contact} onChange={e => setForm(f => ({ ...f, emergency_contact: e.target.value }))} /></div>
                <div style={{ gridColumn: "1 / -1" }}><label className="muted">Reason</label>
                  <textarea rows={2} style={{ width: "100%" }} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
                <div style={{ gridColumn: "1 / -1" }}><label className="muted">Supporting document / medical certificate (optional)</label><br />
                  <input type="file" accept="image/*,.pdf" onChange={e => setDoc(e.target.files?.[0] || null)} /></div>
              </div>
              {check && (form.from_date && form.to_date) && (
                <div style={{ marginTop: 10 }}>
                  {check.errs.map((e, i) => <div key={i} className="note red" style={{ marginBottom: 4 }}>{e}</div>)}
                  {check.warns.map((w, i) => <div key={i} className="note amber" style={{ marginBottom: 4 }}>{w}</div>)}
                  {!check.errs.length && <div className="note" style={{ background: "#F4F5F7" }}>
                    <b>{check.days}</b> leave day{check.days === 1 ? "" : "s"} (Sundays & holidays excluded)
                    {check.unpaidDays > 0 && <> — <b style={{ color: "var(--red)" }}>₹{check.impact.toFixed(0)} salary impact</b></>}
                    {" · "}approval chain: {chain.map(c => c.approver_role ? c.approver_role : "named approver").join(" → ") || "Director"}
                  </div>}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="primary" disabled={busy || !check || !!check.errs.length} onClick={submit}>{busy ? "Submitting…" : "Submit request"}</button>
                <button onClick={() => { setForm(null); setDoc(null); }}>Cancel</button>
              </div>
            </div>
          )}

          <div className="panel">
            <b style={{ fontSize: 13 }}>My requests</b>
            {ctx.requests.length === 0 ? <div className="muted" style={{ marginTop: 6 }}>No leave requests yet.</div> : (
              <div className="dt-scroll" style={{ marginTop: 8 }}>
                <table className="dt-compact" style={{ width: "100%" }}>
                  <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Applied</th><th></th></tr></thead>
                  <tbody>{ctx.requests.map(r => (
                    <tr key={r.id}>
                      <td>{typeLabel(r.leave_type)}</td>
                      <td>{r.from_date}{r.to_date !== r.from_date ? " → " + r.to_date : ""}</td>
                      <td>{r.days}</td>
                      <td><span className={"badge " + ST[r.status][0]}>{ST[r.status][1]}</span></td>
                      <td className="muted">{String(r.applied_at).slice(0, 10)}</td>
                      <td>{["pending", "info_needed"].includes(r.status) &&
                        <button style={{ fontSize: 11 }} onClick={async () => { if (confirm("Cancel this request?")) { const x = await cancelLeave(sess, r); x.ok ? setMsg("Request cancelled.") : setErr(x.error); } }}>Cancel</button>}
                        {r.doc_url && <a href={r.doc_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, marginLeft: 6 }}>📎</a>}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            )}
          </div>
        </>)}

        {/* ---------------- CALENDAR ---------------- */}
        {tab === "cal" && (
          <div className="panel">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <button onClick={() => setCalYm(([y, m]) => m === 1 ? [y - 1, 12] : [y, m - 1])}>←</button>
              <b>{new Date(calYm[0], calYm[1] - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</b>
              <button onClick={() => setCalYm(([y, m]) => m === 12 ? [y + 1, 1] : [y, m + 1])}>→</button>
            </div>
            {!cal ? <div className="muted">Loading…</div> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} className="muted" style={{ fontSize: 11, textAlign: "center" }}>{d}</div>)}
                {Array.from({ length: new Date(calYm[0], calYm[1] - 1, 1).getDay() }).map((_, i) => <div key={"b" + i} />)}
                {Array.from({ length: new Date(calYm[0], calYm[1], 0).getDate() }).map((_, i) => {
                  const day = i + 1;
                  const ds = `${calYm[0]}-${String(calYm[1]).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isSun = new Date(calYm[0], calYm[1] - 1, day).getDay() === 0;
                  const hol = cal.hols.find(h => h.on_date === ds);
                  const bd = cal.bdays.filter(b => b.day === day);
                  const onLeave = cal.reqs.filter(r => r.from_date <= ds && r.to_date >= ds);
                  return (
                    <div key={day} style={{ border: "1px solid var(--border)", borderRadius: 8, minHeight: 74, padding: 4,
                      background: hol ? "#FFF3E0" : isSun ? "#F4F5F7" : "#fff" }}>
                      <div style={{ fontSize: 11, fontWeight: 700 }}>{day}{isSun && <span className="muted" style={{ fontWeight: 400 }}> · off</span>}</div>
                      {hol && <div style={{ fontSize: 10, color: "#E65100" }}>🎉 {hol.name}</div>}
                      {bd.map((b, j) => <div key={j} style={{ fontSize: 10 }}>🎂 {b.name.split(" ")[0]}</div>)}
                      {onLeave.slice(0, 3).map(r => <div key={r.id} style={{ fontSize: 10, color: r.status === "approved" ? "var(--green, #2E7D32)" : "#B26A00" }}>
                        {r.status === "approved" ? "🟢" : "🟡"} {(r.app_users?.full_name || "").split(" ")[0]}</div>)}
                      {onLeave.length > 3 && <div className="muted" style={{ fontSize: 9.5 }}>+{onLeave.length - 3} more</div>}
                    </div>);
                })}
              </div>
            )}
            <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>🟢 approved leave · 🟡 pending · 🎉 holiday · 🎂 birthday · grey = weekly off (Sunday)</div>
          </div>
        )}

        {/* ---------------- APPROVALS ---------------- */}
        {tab === "appr" && isApprover && (
          <div className="panel">
            <b style={{ fontSize: 13 }}>Pending approvals</b>
            {!queue ? <div className="muted" style={{ marginTop: 6 }}>Loading…</div> :
              queue.filter(r => canApprove(sess, chain, r)).length === 0 ? <div className="muted" style={{ marginTop: 6 }}>Nothing waiting for you. 👍</div> : (
              queue.filter(r => canApprove(sess, chain, r)).map(r => (
                <div key={r.id} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <b>{r.staff_name}</b><span className="badge gray">{typeLabel(r.leave_type)}</span>
                    <span>{r.from_date}{r.to_date !== r.from_date ? " → " + r.to_date : ""} · <b>{r.days}d</b></span>
                    <span className="muted" style={{ fontSize: 11 }}>level {r.current_level} of {chain.length || 1}</span>
                    {r.doc_url && <a href={r.doc_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>📎 document</a>}
                  </div>
                  {r.reason && <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Reason: {r.reason}{r.emergency_contact ? ` · Contact: ${r.emergency_contact}` : ""}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <button className="primary" style={{ fontSize: 12 }} onClick={async () => { const x = await actOnLeave(sess, r, "approved"); x.ok ? setMsg("Approved.") : setErr(x.error); }}>✓ Approve</button>
                    <button style={{ fontSize: 12 }} onClick={async () => { const n = prompt("Reason for rejection (sent to employee):"); if (n === null) return; const x = await actOnLeave(sess, r, "rejected", n); x.ok ? setMsg("Rejected.") : setErr(x.error); }}>✗ Reject</button>
                    <button style={{ fontSize: 12 }} onClick={async () => { const n = prompt("What information do you need?"); if (!n) return; const x = await actOnLeave(sess, r, "info_requested", n); x.ok ? setMsg("Asked for more info.") : setErr(x.error); }}>？ Need info</button>
                  </div>
                </div>
              )))}
          </div>
        )}

        {/* ---------------- REPORTS ---------------- */}
        {tab === "reports" && isApprover && (
          <div className="panel">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
              <b style={{ fontSize: 13 }}>Leave register</b>
              <input type="date" value={regRange[0]} onChange={e => setRegRange(r => [e.target.value, r[1]])} />
              <span>→</span>
              <input type="date" value={regRange[1]} onChange={e => setRegRange(r => [r[0], e.target.value])} />
              <button style={{ fontSize: 12 }} onClick={() => reg && exportCSV(reg, [
                ["staff_name", "Employee"], ["staff_role", "Role"], [r => typeLabel(r.leave_type), "Type"],
                ["from_date", "From"], ["to_date", "To"], ["days", "Days"], [r => ST[r.status][1], "Status"],
                ["reason", "Reason"], [r => String(r.applied_at).slice(0, 10), "Applied"]],
                `leave_register_${regRange[0]}_to_${regRange[1]}.csv`)}>⬇ Export CSV / Excel</button>
            </div>
            {!reg ? <div className="muted">Loading…</div> : (
              <div className="dt-scroll">
                <table className="dt-compact" style={{ width: "100%" }}>
                  <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Applied</th></tr></thead>
                  <tbody>{reg.map(r => (
                    <tr key={r.id}><td>{r.staff_name}</td><td>{typeLabel(r.leave_type)}</td>
                      <td>{r.from_date}{r.to_date !== r.from_date ? " → " + r.to_date : ""}</td><td>{r.days}</td>
                      <td><span className={"badge " + ST[r.status][0]}>{ST[r.status][1]}</span></td>
                      <td className="muted">{String(r.applied_at).slice(0, 10)}</td></tr>))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ---------------- SETTINGS (Director) ---------------- */}
        {tab === "settings" && isDirector && (<>
          <div className="panel" style={{ marginBottom: 14 }}>
            <b style={{ fontSize: 13 }}>Approval chain</b>
            <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Up to 3 levels. Each level = a role or a named person. Requests travel level 1 → 2 → 3; unticked levels are skipped.</div>
            {[1, 2, 3].map(lvl => {
              const c = chain.find(x => x.level === lvl) || { level: lvl, approver_role: "", approver_staff: "", is_active: false };
              return (
                <div key={lvl} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12.5, minWidth: 110 }}><input type="checkbox" checked={!!c.is_active}
                    onChange={async e => { const x = await saveApprovalLevel(lvl, c.approver_role, c.approver_staff, e.target.checked); x.ok ? setMsg(`Level ${lvl} ${e.target.checked ? "enabled" : "disabled"}.`) : setErr(x.error); }} /> Level {lvl}</label>
                  <select value={c.approver_role || ""} onChange={async e => { const x = await saveApprovalLevel(lvl, e.target.value, null, true); x.ok ? setMsg(`Level ${lvl} saved.`) : setErr(x.error); }}>
                    <option value="">— role —</option>{roles.map(r => <option key={r[0]} value={r[0]}>{r[1]}</option>)}</select>
                  <span className="muted" style={{ fontSize: 11 }}>or person:</span>
                  <select value={c.approver_staff || ""} onChange={async e => { const x = await saveApprovalLevel(lvl, null, e.target.value ? Number(e.target.value) : null, true); x.ok ? setMsg(`Level ${lvl} saved.`) : setErr(x.error); }}>
                    <option value="">— person —</option>{staffList.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
                </div>);
            })}
            <div className="muted" style={{ fontSize: 11 }}>Remember: approvers other than you also need the <b>Leave → Approve</b> tick in Access Rights.</div>
          </div>

          <div className="panel">
            <b style={{ fontSize: 13 }}>Company holidays & events</b>
            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0", flexWrap: "wrap" }}>
              <input type="date" value={newHol.on_date} onChange={e => setNewHol(h => ({ ...h, on_date: e.target.value }))} />
              <input placeholder="Name (e.g. Diwali)" value={newHol.name} onChange={e => setNewHol(h => ({ ...h, name: e.target.value }))} />
              <select value={newHol.kind} onChange={e => setNewHol(h => ({ ...h, kind: e.target.value }))}>
                <option value="holiday">Holiday</option><option value="festival">Festival</option><option value="event">Event</option></select>
              <button className="primary" style={{ fontSize: 12 }} onClick={async () => { if (!newHol.on_date || !newHol.name.trim()) return; const x = await addHoliday(newHol.on_date, newHol.name.trim(), newHol.kind); if (x.ok) { setNewHol({ on_date: "", name: "", kind: "holiday" }); setMsg("Holiday added."); } else setErr(x.error); }}>＋ Add</button>
            </div>
            {hols.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>No holidays added yet — leave-day counting still skips Sundays.</div> : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {hols.map(h => <span key={h.id} style={{ fontSize: 12, background: "#F4F5F7", borderRadius: 8, padding: "4px 8px" }}>
                  🎉 {h.on_date} {h.name} <button style={{ fontSize: 10, marginLeft: 4 }} onClick={async () => { if (confirm("Remove holiday?")) { const x = await deleteHoliday(h.id); x.ok ? setMsg("Removed.") : setErr(x.error); } }}>✕</button></span>)}
              </div>)}
          </div>
        </>)}
      </main>
    </div>
  );
}
