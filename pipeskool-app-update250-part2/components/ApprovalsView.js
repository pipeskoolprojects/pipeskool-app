"use client";
// update236: extracted from app/m/approvals/page.js so ONE implementation serves both
// shells: /approvals (desktop, sidebar + full width, cards in a grid) and /m/approvals
// (phone, single column + bottom nav). Approval logic, RPCs and rules are untouched.
// update188: DIRECTOR APPROVALS INBOX — every pending request in one place,
// approvable with one tap + confirm. Uses the SAME approval functions as the web
// (fn_approve_petty, fn_confirm_petty_return, reviewAdvance, reviewExpenseClaim,
// actOnLeave, approveItem) — no new rules, money logic untouched.
import { useEffect, useMemo, useState } from "react";
import MobileNav from "@/components/MobileNav";
import { isDemo } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { approvalRights } from "@/lib/perms";
import {
  getPettyRequestQueue, reviewPettyRequest,
  getExpenseClaimQueue, reviewExpenseClaim,
  getAdvanceQueue, reviewAdvance,
  getPettyReturnQueue, confirmPettyReturn,
} from "@/lib/money";
import { getApprovalQueue, actOnLeave, getApprovalChain } from "@/lib/leave";
import { listPendingItems, approveItem, rejectPendingItem } from "@/lib/stock";
import { getPOs, approvePO } from "@/lib/procure";
import { billUrl } from "@/lib/bills";

const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const age = d => { if (!d) return ""; const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000); return days <= 0 ? "today" : days === 1 ? "1 day" : days + " days"; };
const isPdf = p => /\.pdf($|\?)/i.test(String(p || ""));
const card = { background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", marginBottom: 8 };
const btn = { fontSize: 12, padding: "7px 12px", borderRadius: 8 };
const okBtn = { ...btn, background: "var(--green)", color: "#fff", border: 0 };
const noBtn = { ...btn, borderColor: "var(--red)", color: "var(--red)" };

const TYPES = [
  ["petty", "₹ Petty cash"], ["expense", "🧾 Expenses"], ["advance", "💸 Advances"],
  ["leave", "🌴 Leave"], ["return", "↩ Returns"], ["item", "📦 New items"], ["po", "📄 POs"],
];

// stable top-level (update204: inline component defs remount their subtree every render)
// update238: read-only marker for view_all_money holders (Accountant / IT Executive).
// They see the pending record; they never get an action.
function ViewOnly({ inline }) {
  return <span className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginTop: inline ? 0 : 8, display: inline ? "inline" : "block" }}>👁 View only · awaiting Director</span>;
}

// update238: which module right each inbox section belongs to (module scope, one map)
const RIGHT_OF = { petty: "moneyView", expense: "moneyView", advance: "moneyView", return: "moneyView", leave: "leave", po: "indent", item: "stock" };

function Sec({ visible, title, count, grid, children }) {
  return (visible && count > 0) ? (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, margin: "4px 0 6px" }}>{title} <span className="badge warn">{count}</span></div>
      {grid ? <div className="appr-grid">{children}</div> : children}
    </div>
  ) : null;
}

export default function ApprovalsView({ mode = "mobile" }) {
  const desk = mode === "desk";
  const cardS = desk ? { ...card, marginBottom: 0 } : card;
  const sess = typeof window !== "undefined" ? getSession() : null;
  // update238: ONE rights object, from lib/perms — the same question every other screen asks.
  const rights = approvalRights(sess);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const s = getSession();
    if (!s) { window.location.replace(desk ? "/login" : "/m"); return; }
    // route guard: a direct hit on /approvals or /m/approvals by someone with no approval
    // right goes home. The DB refuses them anyway; this stops the empty-screen confusion.
    if (!approvalRights(s).open) window.location.replace(desk ? "/home" : "/m/dashboard");
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const [data, setData] = useState(null);   // { petty, expense, advance, leave, ret, items }
  const [type, setType] = useState("all");
  const [site, setSite] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [act, setAct] = useState(null);     // { kind, row, action } -> note/amount sheet
  const [note, setNote] = useState(""); const [amt, setAmt] = useState("");
  const [viewer, setViewer] = useState(null); // { urls, idx, title }

  const load = async () => {
    // update238: do not even ASK for a queue the person cannot act on
    const none = () => Promise.resolve([]);
    const [petty, expense, advance, leave, ret, items, pos] = await Promise.all([
      rights.moneyView ? getPettyRequestQueue().then(rs => rs.filter(r => r.status === "pending")) : none(),
      rights.moneyView ? getExpenseClaimQueue().then(rs => rs.filter(r => r.status === "pending")) : none(),
      rights.moneyView ? getAdvanceQueue().then(rs => rs.filter(r => r.status === "pending")) : none(),
      rights.leave ? getApprovalQueue().catch(() => []) : none(),
      rights.moneyView ? getPettyReturnQueue().catch(() => []) : none(),
      rights.stock ? listPendingItems().catch(() => []) : none(),
      rights.indent ? getPOs("all").then(ps => ps.filter(p => p.approval === "pending" && p.status !== "cancelled")).catch(() => []) : none(),
    ]);
    setData({ petty, expense, advance, leave, ret, items, pos });
  };
  useEffect(() => { load(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  const total = data ? data.petty.length + data.expense.length + data.advance.length + data.leave.length + data.ret.length + data.items.length + (data.pos?.length || 0) : 0;
  const sites = useMemo(() => data ? [...new Set([...data.petty, ...data.expense, ...data.advance, ...data.ret].map(r => r.site).filter(Boolean))].sort() : [], [data]);
  const bySite = r => site === "all" || r.site === site;
  const show = k => type === "all" || type === k;

  function flash(ok, text) { if (ok) { setMsg(text); setErr(""); } else { setErr(text); setMsg(""); } }
  async function run(id, fn, okText) {
    setBusyId(id);
    const res = await fn();
    setBusyId(null);
    if (!res?.ok && res !== undefined && res?.ok !== undefined) { flash(false, res.error || "Failed."); return; }
    flash(true, okText); setAct(null); setNote(""); setAmt(""); load();
  }

  const openBills = (paths, title) => {
    const urls = (paths || []).map(p => billUrl(p)).filter(Boolean);
    if (urls.length) setViewer({ urls, paths, idx: 0, title });
  };

  const confirmSheet = (kind, row, action, needAmount) => { setAct({ kind, row, action, needAmount }); setNote(""); setAmt(needAmount ? String(row.amount) : ""); };

  async function doAct() {
    const { kind, row, action } = act;
    if (kind === "petty") return run(row.id, () => reviewPettyRequest(row.id, action, note || null, action === "approved" ? Number(amt || row.amount) : null),
      action === "approved" ? `Petty ${inr(Number(amt || row.amount))} approved for ${row.requester}.` : `Petty request ${action}.`);
    if (kind === "expense") return run(row.id, () => reviewExpenseClaim(row.id, action, note || null, sess?.id),
      `Expense ${inr(row.amount)} (${row.claimant}) ${action}.`);
    if (kind === "advance") return run(row.id, () => reviewAdvance(row.id, action, note || null, sess?.id),
      `Advance ${inr(row.amount)} for ${row.beneficiary_name} ${action}.`);
    if (kind === "leave") return run(row.id, () => actOnLeave(sess, row, action, note || null),
      `Leave (${row.staff_name}) ${action === "info_requested" ? "sent back for info" : action}.`);
    if (kind === "return") return run(row.id, () => confirmPettyReturn(row.id, action, note || null),
      action === "confirmed" ? `₹${row.amount} return from ${row.holder} confirmed received.` : "Return not accepted.");
  }


  return (
    <div className={desk ? "appr-wrap" : "m-wrap"}>
      <div className={desk ? "appr-head" : "m-head"}>
        <div>
          <div className="title">Approvals</div>
          <div className="sub">{data ? (total ? `${total} waiting for you` : "All clear — nothing pending 🎉") : "Loading…"}</div>
        </div>
        <button style={{ ...btn, background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }} onClick={load}>↻</button>
      </div>
      <div className={desk ? "appr-body" : "m-body"}>
        {isDemo && <div className="note amber">Demo mode.</div>}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 6 }}>
          <button style={{ ...btn, background: type === "all" ? "var(--copper)" : "#fff", color: type === "all" ? "#fff" : "var(--text)" }} onClick={() => setType("all")}>All {data ? `(${total})` : ""}</button>
          {TYPES.map(([k, l]) => { const n = data && RIGHT_OF[k] && rights[RIGHT_OF[k]] ? ({ petty: data.petty, expense: data.expense, advance: data.advance, leave: data.leave, return: data.ret, item: data.items, po: data.pos || [] })[k].length : 0; return n > 0 && (
            <button key={k} style={{ ...btn, whiteSpace: "nowrap", background: type === k ? "var(--copper)" : "#fff", color: type === k ? "#fff" : "var(--text)" }} onClick={() => setType(type === k ? "all" : k)}>{l} ({n})</button>
          ); })}
        </div>
        {sites.length > 1 && (
          <select value={site} onChange={e => setSite(e.target.value)} style={{ marginBottom: 8 }}>
            <option value="all">All sites</option>
            {sites.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {msg && <div className="note green">{msg}</div>}
        {err && <div className="note red">{err}</div>}
        {!data ? <div className="muted">Loading…</div> : total === 0 ? <div className="note green">Nothing pending. Enjoy the site rounds 🚧</div> : (
          <>
            <Sec grid={desk} visible={rights.moneyView && show("petty")} title="Petty cash requests" count={data.petty.filter(bySite).length}>
              {data.petty.filter(bySite).map(r => (
                <div key={r.id} style={cardS}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div><b>{r.requester}</b> · {r.site}<div className="muted" style={{ fontSize: 12 }}>{r.purpose || "—"}{r.required_date ? ` · needs by ${r.required_date}` : ""} · waiting {age(r.date)}</div></div>
                    <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: "nowrap" }}>{inr(r.amount)}</div>
                  </div>
                  {rights.money ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button style={okBtn} disabled={busyId === r.id} onClick={() => confirmSheet("petty", r, "approved", true)}>✓ Approve</button>
                      <button style={noBtn} disabled={busyId === r.id} onClick={() => confirmSheet("petty", r, "rejected")}>✕ Reject</button>
                    </div>
                  ) : <ViewOnly />}
                </div>
              ))}
            </Sec>
            <Sec grid={desk} visible={rights.moneyView && show("expense")} title="Expense claims" count={data.expense.filter(bySite).length}>
              {data.expense.filter(bySite).map(r => (
                <div key={r.id} style={cardS}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div><b>{r.claimant}</b> · {r.site}<div className="muted" style={{ fontSize: 12 }}>{r.category} · {r.paid_to || "—"}{r.note ? ` · ${r.note}` : ""} · {r.funding_source === "petty_cash" ? "Petty cash" : "Own pocket"} · {r.date}</div></div>
                    <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: "nowrap" }}>{inr(r.amount)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {r.bills?.length > 0 && <button style={btn} onClick={() => openBills(r.bills, `${r.claimant} · ${inr(r.amount)}`)}>📎 Bills ({r.bills.length})</button>}
                    {rights.money ? (<>
                      <button style={okBtn} disabled={busyId === r.id} onClick={() => confirmSheet("expense", r, "approved")}>✓ Approve</button>
                      <button style={noBtn} disabled={busyId === r.id} onClick={() => confirmSheet("expense", r, "rejected")}>✕ Reject</button>
                      <button style={btn} disabled={busyId === r.id} onClick={() => confirmSheet("expense", r, "query")}>❓ Query</button>
                    </>) : <ViewOnly inline />}
                  </div>
                </div>
              ))}
            </Sec>
            <Sec grid={desk} visible={rights.moneyView && show("advance")} title="Salary advances" count={data.advance.filter(bySite).length}>
              {data.advance.filter(bySite).map(r => (
                <div key={r.id} style={cardS}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div><b>{r.beneficiary_name}</b> <span className="muted">({r.beneficiary_kind})</span> · {r.site}<div className="muted" style={{ fontSize: 12 }}>{r.reason || "—"} · {r.bank_on_file ? "🏦 bank on file" : "⚠ no bank details"} · waiting {age(r.date)}</div></div>
                    <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: "nowrap" }}>{inr(r.amount)}</div>
                  </div>
                  {rights.money ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button style={okBtn} disabled={busyId === r.id} onClick={() => confirmSheet("advance", r, "approved")}>✓ Approve</button>
                      <button style={noBtn} disabled={busyId === r.id} onClick={() => confirmSheet("advance", r, "rejected")}>✕ Reject</button>
                      <button style={btn} disabled={busyId === r.id} onClick={() => confirmSheet("advance", r, "query")}>❓ Query</button>
                    </div>
                  ) : <ViewOnly />}
                </div>
              ))}
            </Sec>
            <Sec grid={desk} visible={rights.leave && show("leave")} title="Leave requests" count={data.leave.length}>
              {data.leave.map(r => (
                <div key={r.id} style={cardS}>
                  <div><b>{r.staff_name}</b> <span className="muted">({r.app_users?.role})</span>
                    <div className="muted" style={{ fontSize: 12 }}>{r.from_date} → {r.to_date} · {r.days} day(s) · {r.reason || "—"} · applied {age(r.applied_at)} ago</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button style={okBtn} disabled={busyId === r.id} onClick={() => confirmSheet("leave", r, "approved")}>✓ Approve</button>
                    <button style={noBtn} disabled={busyId === r.id} onClick={() => confirmSheet("leave", r, "rejected")}>✕ Reject</button>
                    <button style={btn} disabled={busyId === r.id} onClick={() => confirmSheet("leave", r, "info_requested")}>❓ Ask info</button>
                  </div>
                </div>
              ))}
            </Sec>
            <Sec grid={desk} visible={rights.moneyView && show("return")} title="Petty cash returns — confirm cash received" count={data.ret.filter(bySite).length}>
              {data.ret.filter(bySite).map(r => (
                <div key={r.id} style={cardS}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div><b>{r.holder}</b> · {r.site}<div className="muted" style={{ fontSize: 12 }}>{r.note || "cash handed back"} · {r.date}</div></div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{inr(r.amount)}</div>
                  </div>
                  {rights.money ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button style={okBtn} disabled={busyId === r.id} onClick={() => confirmSheet("return", r, "confirmed")}>✔ Received</button>
                      <button style={noBtn} disabled={busyId === r.id} onClick={() => confirmSheet("return", r, "rejected")}>✕ Not received</button>
                    </div>
                  ) : <ViewOnly />}
                </div>
              ))}
            </Sec>
            <Sec grid={desk} visible={rights.indent && show("po")} title="Purchase orders awaiting approval" count={(data.pos || []).length}>
              {(data.pos || []).map(r => (
                <div key={r.id} style={cardS}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div><b>{r.po_no}</b> · {r.site}<div className="muted" style={{ fontSize: 12 }}>{r.vendor} · indent {r.indent_no || "—"} · by {r.raised_by || "—"} · {r.date}</div></div>
                    <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: "nowrap" }}>{inr(r.total)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button style={okBtn} disabled={busyId === r.id} onClick={() => run(r.id, () => approvePO(r.id, "approved"), `${r.po_no} approved — office can issue it now.`)}>✓ Approve</button>
                    <button style={noBtn} disabled={busyId === r.id} onClick={() => { const why = prompt(`Reason for rejecting ${r.po_no}:`); if (why !== null) run(r.id, () => approvePO(r.id, "rejected", why), `${r.po_no} rejected.`); }}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </Sec>
            <Sec grid={desk} visible={rights.stock && show("item")} title="New items awaiting review" count={data.items.length}>
              {data.items.map(r => (
                <div key={r.id} style={cardS}>
                  <div><b>{r.display_name}</b><div className="muted" style={{ fontSize: 12 }}>{r.item_type}{r.unit ? ` · ${r.unit}` : ""} · quick-added at site</div></div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <button style={okBtn} disabled={busyId === r.id} onClick={() => run(r.id, () => approveItem(r.id), `"${r.display_name}" approved into the master.`)}>✓ Approve</button>
                    <button style={noBtn} disabled={busyId === r.id} onClick={() => { if (confirm(`Remove "${r.display_name}" from the master? Only possible if it was never used in stock.`)) run(r.id, () => rejectPendingItem(r.id), `"${r.display_name}" removed.`); }}>✕ Remove</button>
                  </div>
                </div>
              ))}
            </Sec>
          </>
        )}
        <div className="note amber" style={{ marginTop: 8 }}>Same rules as the web: petty deducts on approval, advances auto-deduct from pay, everything is logged. GRN cancel and PO approvals stay in their own screens.</div>
      </div>

      {act && (
        <div onClick={() => setAct(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 70, display: "flex", alignItems: desk ? "center" : "flex-end", justifyContent: "center", padding: desk ? 14 : 0 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: desk ? 16 : "16px 16px 0 0", width: "100%", maxWidth: desk ? 520 : 430, padding: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {act.action === "approved" ? "✓ Approve" : act.action === "confirmed" ? "✔ Confirm received" : act.action === "rejected" ? "✕ Reject" : "❓ Query / ask info"} — {act.row.requester || act.row.claimant || act.row.beneficiary_name || act.row.staff_name || act.row.holder}
            </div>
            {act.needAmount && act.action === "approved" && (
              <div style={{ margin: "8px 0" }}>
                <label className="muted" style={{ fontSize: 12 }}>Amount to approve (asked {inr(act.row.amount)})</label>
                <input type="number" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} style={{ width: "100%", fontSize: 18 }} />
              </div>
            )}
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={act.action === "approved" || act.action === "confirmed" ? "Note (optional)" : "Reason / question *"} style={{ width: "100%", marginTop: 6 }} autoFocus={!act.needAmount} />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="primary" style={{ flex: 1, ...(act.action === "rejected" ? { background: "var(--red)", borderColor: "var(--red)" } : {}) }}
                disabled={busyId != null || ((act.action === "rejected" || act.action === "query" || act.action === "info_requested") && !note.trim()) || (act.needAmount && act.action === "approved" && !(Number(amt) > 0))}
                onClick={doAct}>{busyId != null ? "Saving…" : "Confirm"}</button>
              <button onClick={() => setAct(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 80, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", color: "#fff" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, flex: 1 }}>{viewer.title} · {viewer.idx + 1}/{viewer.urls.length}</div>
            <button style={btn} disabled={viewer.idx === 0} onClick={() => setViewer(v => ({ ...v, idx: v.idx - 1 }))}>‹</button>
            <button style={btn} disabled={viewer.idx >= viewer.urls.length - 1} onClick={() => setViewer(v => ({ ...v, idx: v.idx + 1 }))}>›</button>
            <button style={btn} onClick={() => setViewer(null)}>✕</button>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }} onClick={e => e.stopPropagation()}>
            {isPdf(viewer.paths[viewer.idx]) ? <iframe title="bill" src={viewer.urls[viewer.idx]} style={{ width: "100%", height: "100%", border: 0, background: "#fff" }} />
              : <img alt="bill" src={viewer.urls[viewer.idx]} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />}
          </div>
        </div>
      )}
      {!desk && <MobileNav />}
    </div>
  );
}
