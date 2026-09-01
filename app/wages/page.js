"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { getSites, inr } from "@/lib/data";
import { generatePayouts, generatePayoutsAll, getPayouts, setPayoutAdvance, setPayoutMode, setPayoutStatutory, fmtHM, approvePayouts, markPayoutsPaid } from "@/lib/payroll";
import { generateStaffPayouts, getStaffPayouts, approveStaffPayouts, markStaffPayoutsPaid } from "@/lib/staffpay";
import { getSession } from "@/lib/auth";
import { isDemo } from "@/lib/supabase";
import * as XLSX from "xlsx";
import AttendanceSummary from "@/components/AttendanceSummary";   // update276
import PayrollSettings from "@/components/PayrollSettings";       // update276

const STATUS = { draft: ["Draft", "gray"], approved: ["Approved", "h"], paid: ["Paid", "p"] };

// update246: festival-holiday tags on the payslip row. Module scope — never redefined per render.
function HolidayTags({ r }) {
  const bits = [];
  if (r.holDouble > 0) bits.push(["Holiday \u00b7 2\u00d7 pay", "#0f3d24", "#1a7f4f", r.holDouble]);
  if (r.holHalf > 0) bits.push(["Holiday \u00b7 2\u00d7 (half day)", "#3d2f0f", "#b45309", r.holHalf]);
  if (r.holPaid > 0) bits.push(["Holiday \u00b7 Paid", "#26324a", "#2b6cb0", r.holPaid]);
  if (!bits.length) return null;
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
      {bits.map(([label, , color, n]) => (
        <span key={label} className="badge" style={{ fontSize: 9.5, color, border: "1px solid " + color, background: "transparent", whiteSpace: "nowrap" }}>
          {label}{n > 1 ? " \u00d7" + n : ""}
        </span>
      ))}
    </div>
  );
}

export default function WagesPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [site, setSite] = useState("all");
  useEffect(() => {   // update206: project scoping — ?site= from a project workspace pre-filters this page
    try { const sp = new URLSearchParams(window.location.search).get("site"); if (sp) setSite(String(sp)); } catch {}
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [wq, setWq] = useState("");   // update190: worker search
  const [sites, setSites] = useState([]);
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("labour");           // labour | staff
  const [sub, setSub] = useState("payroll");          // update276: payroll | attendance | settings (more in 277)
  const [srows, setSrows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState("");   // update239: live progress during a bulk run
  const [loadErr, setLoadErr] = useState("");   // update240: a failed READ, shown as an error not as emptiness
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const sess = typeof window !== "undefined" ? getSession() : null;
  const canApprove = sess && (sess.role === "director" || sess.role === "ho_admin");

  const filt = rs => (rs || []).filter(r => !wq || (r.worker || r.name || "").toLowerCase().includes(wq.toLowerCase()));

  // update240: a FAILED read must never render as "no data". Before this, getStaffPayouts()
  // threw its error away and returned [], so a broken query and an empty month looked
  // identical — which is how "16 rows saved" could sit above "no rows exist".
  const load = () => {
    getPayouts(month, site).then(setRows).catch(e => { setRows([]); setLoadErr("Could not load labour payroll: " + (e?.message || e)); });
    getStaffPayouts(month).then(r => { setSrows(r); setLoadErr(""); })
      .catch(e => { setSrows([]); setLoadErr("Could not load staff salary: " + (e?.message || e)); });
  };
  useEffect(() => { getSites().then(setSites); }, []);
  useEffect(() => { setRows(null); load(); setMsg(""); setErr(""); }, [month, site]);

  async function run(fn, okMsg) {
    setBusy(true); setErr(""); setMsg(""); setProg("");
    let r;
    try { r = await fn(); }
    catch (e) { setBusy(false); setProg(""); setErr("Could not complete: " + (e?.message || String(e))); return; }
    setBusy(false); setProg("");
    if (!r?.ok) { setErr(r?.error || "Nothing happened — please try again or tell Claude what you did."); return; }
    setMsg(okMsg(r)); load();
  }

  // update239: "All sites" now GENERATES for every site instead of silently doing nothing.
  // Confirmed first, because one click can write draft rows across a dozen sites.
  const tail = r => (r.skippedFinal ? `, ${r.skippedFinal} approved/paid left untouched` : "") +
                    (r.skippedNoWage ? `, ${r.skippedNoWage} skipped (₹0 wage — staff punch profiles)` : "");
  const generate = () => {
    if (site !== "all") {
      return run(() => generatePayouts(site, month),
        r => `Generated from attendance: ${r.created} new, ${r.updated} draft(s) refreshed` + tail(r) + "."
          + (r.heldForReview ? ` ⏱ ${r.heldForReview} auto-closed day(s) with a missing punch-out were HELD OUT — confirm them in Reports → Needs attention, then regenerate.` : ""));   // update275
    }
    if (sites.length === 0) { setErr("No sites available to generate for."); return; }
    const ok = window.confirm(
      `Generate labour payroll for ALL ${sites.length} site(s) for ${month}?\n\n` +
      "Draft rows are created or refreshed. Approved and paid rows are never changed.");
    if (!ok) return;
    return run(
      () => generatePayoutsAll(sites, month, (d, t, name) =>
        setProg(name ? `Generating — site ${d + 1} of ${t}: ${name}…` : "")),
      r => `Generated across ${r.sites} site(s): ${r.created} new, ${r.updated} draft(s) refreshed` + tail(r) + "." +
           (r.failedSites?.length ? ` ⚠ ${r.failedSites.length} site(s) failed — ${r.failedSites.join(" | ")}` : ""));
  };
  const approve = () => run(() => approvePayouts(month, site, sess?.id),
    r => r.count + " payout(s) approved.");
  const paid = () => run(() => markPayoutsPaid(month, site),
    r => r.count + " payout(s) marked PAID.");

  async function editStat(r) {   // update194: PF / Professional Tax — manual per payout (draft only)
    const pf = prompt(`PF for ${r.worker} (₹):`, r.pf || 0); if (pf === null) return;
    const pt = prompt(`Professional Tax for ${r.worker} (₹):`, r.pt || 0); if (pt === null) return;
    const res = await setPayoutStatutory(r.id, pf, pt);
    if (!res.ok) { setErr(res.error); return; }
    load();
  }
  async function editAdv(r) {
    const v = prompt(`Advance to deduct for ${r.worker} (gross ${inr(r.gross)}):`, r.adv || 0);
    if (v === null) return;
    const res = await setPayoutAdvance(r.id, v);
    if (!res.ok) { setErr(res.error); return; }
    load();
  }

  function exportExcel() {
    if (!rows?.length) return;
    const data = filt(rows).map(r => ({ Worker: r.worker, Category: r.category, Site: r.site,
      "Full days": r.daysFull, "Half days": r.daysHalf, "Days total": r.days,
      "OT (approved)": fmtHM(r.ot), "Daily rate": r.rate, "OT rate/hr": r.otRate,
      Gross: r.gross, "Advance deducted": r.adv, "PF": r.pf || 0, "Professional Tax": r.pt || 0, Net: r.net, "Bank a/c": r.bankAc || "", IFSC: r.ifsc || "", "Pay mode": r.mode, Status: r.status }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Wages " + month);
    XLSX.writeFile(wb, `Pipeskool_wages_${month}${site !== "all" ? "_site" + site : ""}.xlsx`);
  }

  const t = (rows || []).reduce((x, r) => ({ gross: x.gross + r.gross, adv: x.adv + r.adv, pf: x.pf + (r.pf || 0), pt: x.pt + (r.pt || 0), net: x.net + r.net, ot: x.ot + r.ot }), { gross: 0, adv: 0, pf: 0, pt: 0, net: 0, ot: 0 });
  const drafts = (rows || []).filter(r => r.status === "draft").length;
  const approved = (rows || []).filter(r => r.status === "approved").length;

  return (
    <div className="layout">
      <Sidebar />
      <main className="main">
        <div className="page-head">
          <h1>Muster roll & wages</h1>
          <div className="filters">
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            <select value={site} onChange={e => setSite(e.target.value)}>
              <option value="all">All sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input placeholder="🔎 Worker…" value={wq} onChange={e => setWq(e.target.value)} style={{ width: 150 }} />{/* update190 */}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button className={tab === "labour" ? "primary" : ""} onClick={() => setTab("labour")}>👷 Labour payroll</button>
          <button className={tab === "staff" ? "primary" : ""} onClick={() => setTab("staff")}>🧑‍💼 Staff salary</button>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — payroll needs a live database.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
        {loadErr && <div className="note red" style={{ marginBottom: 12 }}>⚠ {loadErr}</div>}

        {tab === "labour" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>{/* update276: labour sub-tabs */}
            {[["payroll", "👷 Labour Payroll"], ["attendance", "📅 Full Attendance Summary"], ["settings", "⚙ Settings / Payroll Rules"]].map(([k, l]) => (
              <button key={k} className={sub === k ? "primary" : ""} onClick={() => setSub(k)} style={{ fontSize: 12.5 }}>{l}</button>
            ))}
          </div>
        )}
        {tab === "labour" && sub === "attendance" && <AttendanceSummary month={month} siteId={site} sites={sites} />}
        {tab === "labour" && sub === "settings" && <PayrollSettings canEdit={sess?.role === "director"} />}
        {tab === "labour" && sub === "payroll" && <div className="panel">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button className="primary" disabled={busy} onClick={generate}
              title={site === "all" ? "Generates for every site you can see" : ""}>
              {busy ? "Working…" : "⚙ Generate / refresh from attendance" + (site === "all" ? ` (all ${sites.length} sites)` : "")}</button>
            {canApprove && <button disabled={busy || site === "all" || !drafts} onClick={approve}
              title={site === "all" ? "Pick one site — approving is a financial decision, made site by site" : ""}>✓ Approve {drafts || ""} draft(s)</button>}
            {canApprove && <button disabled={busy || site === "all" || !approved} onClick={paid}
              title={site === "all" ? "Pick one site — marking PAID is a financial decision, made site by site" : ""}>₹ Mark {approved || ""} approved as PAID</button>}
            <button disabled={!rows?.length} onClick={exportExcel}>⬇ Export Excel</button>
          </div>
          {prog && <div className="demo-banner" style={{ background: "var(--copper-soft)" }}>⏳ {prog}</div>}
          {canApprove && site === "all" && (
            <div className="note amber" style={{ marginBottom: 10 }}>
              Generating works across all sites. <b>Approve</b> and <b>Mark PAID</b> are done one site at a time — pick a site above to enable them.
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Own labour only · days from attendance · <b>OT counts only after approval</b> (Attendance → approve OT) · OT paid at daily rate ÷ site working hours · regenerate any time — approved/paid rows are never changed.
          </div>

          {!rows ? <div className="muted">Loading…</div> : rows.length === 0 ? (
            <div className="muted">No payouts for {month}{site === "all" ? " at any site" : " at this site"} yet. Click <b>Generate / refresh from attendance</b>{site === "all" ? " to build them for every site" : ""}.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="dt-compact">
                <thead><tr><th>Worker</th><th>Category</th>{site === "all" && <th>Site</th>}<th className="num">Days (F+H)</th><th className="num">OT</th><th className="num">Rate</th><th className="num">Gross</th><th className="num">Advance</th><th className="num">PF</th><th className="num">P.Tax</th><th className="num">Net</th><th>Mode</th><th>Status</th></tr></thead>
                <tbody>
                  {filt(rows).map(r => {
                    const [lbl, cls] = STATUS[r.status] || [r.status, "gray"];
                    return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.worker_id ? <a href={"/attendance/slip?worker=" + r.worker_id + "&month=" + month} target="_blank" rel="noreferrer">{r.worker}</a> : r.worker}
                          <HolidayTags r={r} />{/* update246 */}</td>
                        <td className="muted">{r.category}</td>
                        {site === "all" && <td className="muted">{r.site}</td>}
                        <td className="num">{r.days} <span className="muted" style={{ fontSize: 10.5 }}>({r.daysFull}+{r.daysHalf}½)</span></td>
                        <td className="num">{r.ot ? fmtHM(r.ot) : "—"}</td>
                        <td className="num">{inr(r.rate)}</td>
                        <td className="num">{inr(r.gross)}</td>
                        <td className="num">
                          {r.status === "draft"
                            ? <a style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => editAdv(r)}>{inr(r.adv)}</a>
                            : inr(r.adv)}
                        </td>
                        <td className="num">{r.status === "draft" ? <a style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => editStat(r)}>{inr(r.pf || 0)}</a> : inr(r.pf || 0)}</td>
                        <td className="num">{r.status === "draft" ? <a style={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => editStat(r)}>{inr(r.pt || 0)}</a> : inr(r.pt || 0)}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{inr(r.net)}</td>
                        <td>
                          {r.status === "draft"
                            ? <select value={r.mode} onChange={async e => { const x = await setPayoutMode(r.id, e.target.value); if (!x.ok) setErr(x.error); load(); }}>
                                <option value="cash">Cash</option><option value="bank">Bank</option>
                              </select>
                            : <span className="muted">{r.mode}</span>}
                        </td>
                        <td><span className={"badge " + cls}>{lbl}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 800, borderTop: "2px solid var(--text)" }}>
                    <td colSpan={site === "all" ? 4 : 3}>TOTAL — {filt(rows).length} worker(s)</td>
                    <td className="num">{fmtHM(t.ot)}</td><td></td>
                    <td className="num">{inr(t.gross)}</td>
                    <td className="num">{inr(t.adv)}</td>
                    <td className="num">{inr(t.pf)}</td>
                    <td className="num">{inr(t.pt)}</td>
                    <td className="num">{inr(t.net)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>}

        {tab === "staff" && (
          <div className="panel">
            {/* update239: staff salary has no per-site step — generateStaffPayouts(month) covers
                every active staff member, so the "All sites" dead-end never existed here. */}
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Staff salary is <b>company-wide</b> — the site filter above applies to labour payroll only.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <button className="primary" disabled={busy} onClick={() => run(() => generateStaffPayouts(month),
                r => `Staff salary generated: ${r.created} new, ${r.updated} draft(s) refreshed` + (r.skippedFinal ? `, ${r.skippedFinal} approved/paid untouched` : "") + ".")}
                title="Staff salary is company-wide — the site filter above does not apply here">
                {busy ? "Working…" : "⚙ Generate from attendance"}</button>
              {canApprove && <button disabled={busy || !(srows || []).some(r => r.status === "draft")} onClick={() => run(() => approveStaffPayouts(month, sess?.id), r => r.count + " approved.")}>✓ Approve drafts</button>}
              {canApprove && <button disabled={busy || !(srows || []).some(r => r.status === "approved")} onClick={() => run(() => markStaffPayoutsPaid(month), r => r.count + " marked PAID.")}>₹ Mark PAID</button>}
              <button disabled={!srows?.length} onClick={() => {
                const data = (srows || []).map(r => ({ Staff: r.name, Role: r.role, "Salary ₹": r.salary, "Working days": r.working,
                  "Present": r.present, "Absent": r.absent, "Paid leaves used": r.leaves, "Leave balance": r.leaveBal, "Deduction ₹": r.deduction, "OT": fmtHM(r.ot), "OT ₹": r.otAmt,
                  "Advances ₹": r.adv, "Net ₹": r.net, "Bank a/c": r.bankAc || "", IFSC: r.ifsc || "", PAN: r.pan || "", Status: r.status }));
                const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Staff " + month); XLSX.writeFile(wb, `Pipeskool_staff_salary_${month}.xlsx`);
              }}>⬇ Export Excel</button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Per-day = salary ÷ 30 (fixed) · Sundays paid · leave year Apr–Mar · max 50% of leaves usable Apr–Sep · max 10 leaves at a stretch · absences beyond these limits deduct <b>OT eligible</b> (approved hours, per-day ÷ 8) · approved salary advances auto-deducted · approved/paid rows never change.
            </div>
            {!srows ? <div className="muted">Loading…</div> : srows.length === 0 ? (
              <div className="muted">{prog ? "⏳ " + prog : <>No staff salary rows for {month}. Set <b>Monthly salary</b> on staff (Workers &amp; Staff Master → Edit) and click <b>Generate from attendance</b>.</>}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="dt-compact">
                  <thead><tr><th>Staff</th><th>Role</th><th className="num">Salary</th><th className="num">Present / Working</th><th className="num">Absent</th><th className="num">Paid leave (bal)</th><th className="num">Deduction</th><th className="num">OT h</th><th className="num">OT ₹</th><th className="num">Advances</th><th className="num">Net</th><th>Status</th></tr></thead>
                  <tbody>
                    {/* update241: was `sfilt(rows)` — an undefined function AND the wrong array
                        (rows = labour payouts). Latent since the staff tab was built: the table
                        only renders when srows is non-empty, and getStaffPayouts() always
                        returned [] because of the ambiguous embed fixed in 240. */}
                    {filt(srows).map(r => { const [lbl, cls] = STATUS[r.status] || [r.status, "gray"]; return (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.name}<HolidayTags r={r} />{/* update246 */}</td><td className="muted">{r.role}</td>
                        <td className="num">{inr(r.salary)}</td>
                        <td className="num">{r.present} / {r.working}</td>
                        <td className="num" style={{ color: r.absent > 0 ? "var(--red)" : "inherit" }}>{r.absent}</td>
                        <td className="num">{r.leaves ? r.leaves : "—"} <span className="muted" style={{ fontSize: 10.5 }}>({r.leaveBal} left)</span></td>
                        <td className="num">{inr(r.deduction)}</td>
                        <td className="num">{r.ot ? fmtHM(r.ot) : "—"}</td>
                        <td className="num">{inr(r.otAmt)}</td>
                        <td className="num">{inr(r.adv)}</td>
                        <td className="num" style={{ fontWeight: 700 }}>{inr(r.net)}</td>
                        <td><span className={"badge " + cls}>{lbl}</span></td>
                      </tr> ); })}
                  </tbody>
                  <tfoot><tr style={{ fontWeight: 800, borderTop: "2px solid var(--text)" }}>
                    <td colSpan={6}>TOTAL — {srows.length} staff</td>
                    <td className="num">{inr(srows.reduce((t, r) => t + r.deduction, 0))}</td><td></td>
                    <td className="num">{inr(srows.reduce((t, r) => t + r.otAmt, 0))}</td>
                    <td className="num">{inr(srows.reduce((t, r) => t + r.adv, 0))}</td>
                    <td className="num">{inr(srows.reduce((t, r) => t + r.net, 0))}</td><td></td>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
