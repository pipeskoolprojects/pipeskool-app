"use client";
import { useEffect, useState } from "react";
import DataTable from "@/components/DataTable";
import AdvanceLedger from "@/components/AdvanceLedger";
import CollapseCard from "@/components/CollapseCard";
import { billUrl, isPdf } from "@/lib/bills";
import { isDemo } from "@/lib/supabase";
import {
  getAdvanceQueue, reviewAdvance, getExpenseClaimQueue, reviewExpenseClaim,
  getBeneficiaries, raiseAdvanceSalary,
  getPettyReturnQueue, confirmPettyReturn, getPettyLedger,
  getPettyReconciliation, catLabel, inr, markAdvancePosted, markExpensePosted,
  getPettyRequestQueue, reviewPettyRequest, requestPettyCash , selfEditExpense, EXPENSE_CATEGORIES, getPersonMoneyProfile, claimExpense } from "@/lib/money";   // update300
import { getSites } from "@/lib/data";
import { getSession, canAnySite } from "@/lib/auth";
import { canApprove } from "@/lib/perms";

export default function ExpensesView({ siteId = null, embedded = false }) {
  // update244: de-iframed and scoped. siteId arrives as a PROP, so a project tab loads only
  // that project's money. Before this, every queue loaded all sites and the KEI tab listed
  // HEAD OFFICE / SOUL Campus / ATOS / Citadel rows.
  const scope = siteId ? String(siteId) : null;

  // update196: shared 25-per-page pager for the hand-built lists (DataTables page themselves)
  const [pgPetty, setPgPetty] = useState(1); const [pgRet, setPgRet] = useState(1);
  const LP = 10;   // update200: max 10 records per page for long lists
  const pageOf = (arr, pg) => (arr || []).slice((pg - 1) * LP, pg * LP);
  const Pager = ({ n, pg, set }) => { const pc = Math.max(Math.ceil(n / LP), 1); if (n <= LP) return null; const cur = Math.min(pg, pc); return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", margin: "6px 0" }}>
      <span className="muted" style={{ fontSize: 12, marginRight: "auto" }}>Showing {(cur - 1) * LP + 1}–{Math.min(cur * LP, n)} of {n}</span>
      <button style={{ fontSize: 12 }} disabled={cur <= 1} onClick={() => set(cur - 1)}>‹ Prev</button>
      {Array.from({ length: pc }, (_, i) => i + 1).filter(i => i === 1 || i === pc || Math.abs(i - cur) <= 2).map((i, x, a) => (
        <span key={i}>{x > 0 && a[x - 1] !== i - 1 && <span className="muted">…</span>}
          <button style={{ fontSize: 12, fontWeight: i === cur ? 800 : 400, background: i === cur ? "var(--copper)" : undefined, color: i === cur ? "#fff" : undefined }} onClick={() => set(i)}>{i}</button></span>))}
      <button style={{ fontSize: 12 }} disabled={cur >= pc} onClick={() => set(cur + 1)}>Next ›</button>
    </div>); };

  const [adv, setAdv] = useState(null);
  const [pettyReqs, setPettyReqs] = useState(null);
  const [pettyForm, setPettyForm] = useState({ amount: "", purpose: "", required_date: "", remarks: "" });
  const [pettyMsg, setPettyMsg] = useState("");
  const [pettyAmt, setPettyAmt] = useState({});   // per-request approve-amount inputs (update164)
  async function actPetty(id, status, amount) {
    const note = status === "rejected" ? (window.prompt("Reason (sent to the requester):") || "") : "";
    const res = await reviewPettyRequest(id, status, note, amount);
    if (!res.ok) { window.alert("Could not review: " + res.error); return; }
    getPettyRequestQueue(scope).then(setPettyReqs);
  }
  async function sendWebPetty() {
    setPettyMsg("");
    if (!pettyForm.amount || !pettyForm.purpose) { setPettyMsg("Amount and purpose are required."); return; }
    const res = await requestPettyCash({ site_id: session?.currentSite, user_id: session?.id, requester_name: session?.name,
      amount: pettyForm.amount, purpose: pettyForm.purpose, required_date: pettyForm.required_date || null, remarks: pettyForm.remarks || null });
    if (!res.ok) { setPettyMsg(res.error); return; }
    setPettyForm({ amount: "", purpose: "", required_date: "", remarks: "" });
    setPettyMsg("Request sent."); getPettyRequestQueue(scope).then(setPettyReqs);
  }
  const [claims, setClaims] = useState(null);
  const [sel, setSel] = useState({});   // update247: expense ids chosen for a Cash Voucher
  const [petty, setPetty] = useState([]);
  const [advTotals, setAdvTotals] = useState({ taken: 0, rec: 0, out: 0 });   // update200: fed by AdvanceLedger
  // update200: compact overview — summary cards + collapsible module sections (nothing removed,
  // every existing block just lives inside a section that opens on demand)
  const [openSec, setOpenSec] = useState({});   // key -> bool
  const toggleSec = k => setOpenSec(o => ({ ...o, [k]: !o[k] }));
  const sumBy = (rows, f) => (rows || []).reduce((t, r) => t + (f(r) || 0), 0);
  const approvedClaims = sumBy((claims || []).filter(c => c.status === "approved"), c => c.amount);
  const pendingClaims = sumBy((claims || []).filter(c => c.status === "pending"), c => c.amount);
  const rejectedClaims = sumBy((claims || []).filter(c => c.status === "rejected"), c => c.amount);
  const pettyBal = sumBy(petty, h => h.balance), pettySpent = sumBy(petty, h => h.spent), pettyReturned = sumBy(petty, h => h.returned);
  const advPending = (adv || []).filter(a => a.status === "pending");
  const advApproved = (adv || []).filter(a => a.status === "approved");

  const [msg, setMsg] = useState("");
  const [session, setSession] = useState(null);
  const [bens, setBens] = useState([]);
  const [advForm, setAdvForm] = useState({ beneficiary: "", amount: "", reason: "" });
  const [advErr, setAdvErr] = useState("");
  const [advBusy, setAdvBusy] = useState(false);
  async function submitWebAdvance() {
    setAdvErr("");
    if (!advForm.beneficiary || !advForm.amount) { setAdvErr("Select a person and enter the amount."); return; }
    const b = bens.find(x => `${x.kind}:${x.id}` === advForm.beneficiary);
    setAdvBusy(true);
    const res = await raiseAdvanceSalary({
      site_id: b.site_id || session?.currentSite || null, beneficiary_id: b.id, beneficiary_kind: b.kind,
      beneficiary_name: b.name, amount: Number(advForm.amount), reason: advForm.reason,
      bank_on_file: b.bank, raised_by: session?.id,
    });
    setAdvBusy(false);
    if (!res.ok) { setAdvErr(res.error); return; }
    setMsg(`Advance salary request sent for ${b.name}.`);
    setAdvForm({ beneficiary: "", amount: "", reason: "" });
    getAdvanceQueue(scope).then(setAdv);
  }

  const load = () => {
    getAdvanceQueue(scope).then(setAdv);
    getExpenseClaimQueue(scope).then(setClaims);
    getPettyReconciliation().then(setPetty);
  };
  useEffect(() => {
    const st = getSession(); setSession(st); load();
    if (st?.id) getBeneficiaries(st.id).then(setBens);
    getPettyRequestQueue(scope).then(setPettyReqs);
  }, []);

  // update238: one gate for every approval action on this page — identical rule to the
  // Approvals inbox and to the RLS policies behind it.
  const canApprMoney = canApprove(session, "money");
  // update242: an advance can now be revised or withdrawn AFTER approval, not only decided once
  async function actAdv(id, status, amount) {
    let note = null;
    if (status === "queried") { note = prompt("Query to send back:"); if (!note) return; }
    const res = await reviewAdvance(id, status, note, session?.id, amount);
    if (!res.ok) { setAdvErr(res.error); setMsg(""); return; }
    setAdvErr("");
    setMsg(res.revised ? `Approval revised to ${inr(res.amount)} (asked ${inr(res.requested)}).`
         : res.withdrawn ? "Approval withdrawn \u2014 nothing will be deducted from salary for it."
         : status === "approved" ? `Approved ${inr(res.amount)}.` : "Updated.");
    load();
  }
  async function actClaim(id, status) {
    let note = null;
    if (status === "queried") { note = prompt("Query to send back:"); if (!note) return; }
    await reviewExpenseClaim(id, status, note, session?.id); setMsg("Updated."); load();
  }

  async function togglePostAdv(r) { await markAdvancePosted(r.id, !r.posted, session?.id); load(); }
  async function togglePostExp(r) { await markExpensePosted(r.id, !r.posted, session?.id); load(); }

  const advCols = [
    { key: "date", label: "Date", filter: "search" },
    { key: "beneficiary_name", label: "Beneficiary", filter: "select", render: r => <span style={{ fontWeight: 600 }}>{r.beneficiary_name}</span> },
    { key: "beneficiary_kind", label: "Type", filter: "select", optionLabel: o => o === "labour" ? "Labour" : "Staff", render: r => r.beneficiary_kind === "labour" ? "Labour" : "Staff" },
    { key: "site", label: "Site", filter: "select" },
    { key: "reason", label: "Reason",
      render: r => <span className="muted"><span className="clamp2" title={r.reason || ""}>{r.reason || "—"}</span>{r.response && <div className="clamp2" title={r.response} style={{ color: "var(--green)" }}>↩ {r.response}</div>}{r.status === "queried" && r.query && <div className="clamp2" title={r.query} style={{ color: "var(--amber)" }}>❓ {r.query}</div>}</span> },
    { key: "amount", label: "Amount", type: "num", exportValue: r => r.approved_amount ?? r.amount,
      render: r => (r.approved_amount != null && Number(r.approved_amount) !== Number(r.amount))
        ? <span><b>{inr(r.approved_amount)}</b><div className="muted" style={{ fontSize: 10.5 }}>asked {inr(r.amount)}</div></span>
        : <b>{inr(r.amount)}</b> },
    { key: "bank_on_file", label: "Bank", filter: "select", optionLabel: o => o ? "On file" : "Missing", render: r => r.bank_on_file ? <span className="badge p">On file</span> : <span className="badge warn">⚠ Missing</span>, exportValue: r => r.bank_on_file ? "On file" : "Missing" },
    { key: "status", label: "Status", filter: "select", render: r => r.status === "approved" ? <span className="badge p">Approved</span> : r.status === "rejected" ? <span className="badge a">Rejected</span> : r.status === "queried" ? <span className="badge h">Queried</span> : <span className="badge gray">Pending</span> },
    { key: "approved_on", label: "Appr. date", render: r => <span className="muted">{r.approved_on || "—"}</span> },
    { key: "approved_by", label: "Appr. by", filter: "select", render: r => <span className="muted">{r.approved_by || "—"}</span> },
    { key: "posted", label: "Tally", filter: "select", optionLabel: o => o ? "Posted" : "Not posted",
      render: r => r.status === "approved" ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
          <input type="checkbox" checked={!!r.posted} onChange={() => togglePostAdv(r)} style={{ width: 16, height: 16, accentColor: "var(--copper)" }} />
          {r.posted ? <span className="badge p">Posted</span> : <span className="badge gray">Mark posted</span>}
        </label>) : <span className="muted">—</span>,
      exportValue: r => r.posted ? "Posted" : "" },
    // update242: approved and rejected rows are no longer dead ends — same controls petty
    // cash has had since 194. A PAID advance is refused by fn_review_advance, not here.
    // update249: the voucher is a RECORD, not an approval — anyone who can see the row may
    // print it, and it is only offered once the advance is actually approved.
    { key: "_voucher", label: "Voucher", sortable: false, exportValue: () => "",
      render: r => r.status === "approved"
        ? <button style={{ fontSize: 11.5 }} title="Print advance salary voucher"
            onClick={() => window.open("/expenses/advance-voucher?id=" + r.id, "_blank", "noopener")}>🧾 Voucher</button>
        : <span className="muted" style={{ fontSize: 11.5 }}>—</span> },
    { key: "_action", label: "Action", sortable: false, render: r => {
      if (!canApprMoney) return <span className="muted" style={{ fontSize: 11.5 }}>—</span>;
      if (r.status === "pending" || r.status === "queried") return (
        <span style={{ whiteSpace: "nowrap" }}>
          <button style={{ fontSize: 11.5, marginRight: 4 }} title="Approve in full" onClick={() => actAdv(r.id, "approved")}>✓</button>
          <button style={{ fontSize: 11.5, marginRight: 4 }} title="Approve a different amount"
            onClick={() => { const v = window.prompt(`Approve how much for ${r.beneficiary_name}? (asked ₹${r.amount})`, String(r.amount)); if (v != null && v !== "") actAdv(r.id, "approved", v); }}>✎</button>
          <button style={{ fontSize: 11.5, marginRight: 4 }} title="Send back with a question" onClick={() => actAdv(r.id, "queried")}>?</button>
          <button style={{ fontSize: 11.5 }} title="Reject" onClick={() => actAdv(r.id, "rejected")}>✕</button>
        </span>);
      if (r.status === "approved") return (
        <span style={{ whiteSpace: "nowrap" }}>
          <button style={{ fontSize: 11.5, marginRight: 4 }} title="Approve a different amount"
            onClick={() => { const v = window.prompt(`Revised approved amount for ${r.beneficiary_name} ₹ (asked ₹${r.amount}):`, String(r.approved_amount ?? r.amount)); if (v != null && v !== "") actAdv(r.id, "approved", v); }}>✎ Change amount</button>
          <button style={{ fontSize: 11.5, color: "var(--red)" }} title="Withdraw this approval"
            onClick={() => { if (window.confirm(`Withdraw this approval?\n\n${r.beneficiary_name} — ₹${r.approved_amount ?? r.amount}\n\nIt goes back to Pending and will NOT be deducted from salary. Regenerate that month's payroll afterwards.`)) actAdv(r.id, "rejected"); }}>Undo approval</button>
        </span>);
      return (
        <span style={{ whiteSpace: "nowrap" }}>
          <button style={{ fontSize: 11.5 }} title="Approve after all"
            onClick={() => { const v = window.prompt(`Approve amount for ${r.beneficiary_name} ₹ (asked ₹${r.amount}):`, String(r.amount)); if (v != null && v !== "") actAdv(r.id, "approved", v); }}>Approve…</button>
        </span>);
    } },
  ];

  // update247: pick claims -> print ONE Cash Voucher covering them all
  const toggleSel = id => setSel(v => { const n = { ...v }; n[id] ? delete n[id] : (n[id] = true); return n; });
  const selIds = Object.keys(sel);
  const selRows = (claims || []).filter(r => sel[r.id]);
  const selTotal = selRows.reduce((t, r) => t + Number(r.amount || 0), 0);
  const selPayees = [...new Set(selRows.map(r => r.claimant_id))].length;
  const openVoucher = () => window.open("/expenses/voucher?ids=" + selIds.join(","), "_blank", "noopener");

  const claimCols = [
    { key: "_sel", label: "", sortable: false, exportValue: () => "",
      render: r => <input type="checkbox" checked={!!sel[r.id]} onChange={() => toggleSel(r.id)}
        title="Add to Cash Voucher" style={{ width: 15, height: 15, accentColor: "var(--copper)" }} /> },
    { key: "date", label: "Date", filter: "search" },
    { key: "claimant", label: "Claimant", filter: "select",
      render: r => <a style={{ fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }} title="View profile & history" onClick={() => openProfile(r.claimant_id, r.claimant)}>
        <span className="avatar-chip" style={{ background: avColor(r.claimant) }}>{avInit(r.claimant)}</span>{r.claimant || "—"}</a> },
    { key: "site", label: "Site", filter: "select" },
    { key: "category", label: "Category", filter: "select", hidden: true, optionLabel: o => catLabel(o), exportValue: r => catLabel(r.category) },
    { key: "paid_to", label: "Paid to / purpose", filter: "search", render: r => <span>
        <b style={{ fontWeight: 600 }}>{r.paid_to}</b>
        <div className="muted clamp2" title={(catLabel(r.category) + " · " + (r.note || "")).trim()} style={{ fontSize: 11.5 }}>{catLabel(r.category)}{r.note ? " · " + r.note : ""}</div>
        {r.response && <div className="muted clamp2" title={r.response} style={{ color: "var(--green)" }}>↩ {r.response}</div>}
        {r.status === "queried" && r.query && <div className="muted clamp2" title={r.query} style={{ color: "var(--amber)" }}>❓ {r.query}</div>}</span> },
    { key: "note", label: "Purpose / note", filter: "search", hidden: true, exportValue: r => r.note || "" },
    { key: "bill_links", label: "Bill links (export)", hidden: true, exportValue: r => (r.bills || []).map(b => billUrl(b)).join("  |  ") },
    { key: "funding_source", label: "Source", filter: "select", hidden: true, optionLabel: o => o === "petty_cash" ? "Petty cash" : "Own pocket", exportValue: r => r.funding_source === "petty_cash" ? "Petty cash" : "Own pocket" },
    { key: "amount", label: "Amount", type: "num", render: r => <span><b>{inr(r.amount)}</b><div>{r.funding_source === "petty_cash" ? <span className="badge" style={{ background: "#e8f0fe", color: "#1a56db", border: "1px solid #1a56db", fontSize: 9.5 }}>Petty</span> : <span className="badge gray" style={{ fontSize: 9.5 }}>Own</span>}</div></span>, exportValue: r => r.amount },
    { key: "photo", label: "Proof", render: r => (r.bills || []).length === 0
      ? (r.photo ? <a href={r.photo} target="_blank" rel="noreferrer">📎 Bill</a> : <span className="muted">—</span>)
      : <span className="bill-strip">
          {r.bills.slice(0, 2).map((b, i) => (
            <a key={i} href={billUrl(b)} target="_blank" rel="noreferrer" style={{ fontSize: 11.5 }}
               title={isPdf(b) ? "Preview PDF" : "Preview image"}>📎{r.bills.length > 1 ? i + 1 : ""}</a>
          ))}
          {r.bills.length > 2 && (
            <button type="button" className="badge gray" style={{ cursor: "pointer", fontSize: 10.5, border: "1px solid var(--border)" }}
              onClick={() => setBillsFor(r)}>+{r.bills.length - 2} more</button>
          )}
        </span>,
      exportValue: r => (r.bills || []).length + " file(s)" },
    { key: "status", label: "Status", filter: "select", render: r => <span>
        {r.status === "approved" ? <span className="badge p">Approved</span> : r.status === "rejected" ? <span className="badge a">Rejected</span> : r.status === "queried" ? <span className="badge h">Queried</span> : <span className="badge gray">Pending</span>}
        {r.approved_by && <div className="muted" style={{ fontSize: 10 }}>{r.approved_by}{r.approved_on ? " · " + r.approved_on : ""}</div>}</span> },
    { key: "approved_on", label: "Appr. date", hidden: true, exportValue: r => r.approved_on || "" },
    { key: "approved_by", label: "Appr. by", filter: "select", hidden: true, exportValue: r => r.approved_by || "" },
    { key: "posted", label: "Tally", filter: "select", optionLabel: o => o ? "Posted" : "Not posted",
      render: r => r.status === "approved" ? (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12 }}>
          <input type="checkbox" checked={!!r.posted} onChange={() => togglePostExp(r)} style={{ width: 16, height: 16, accentColor: "var(--copper)" }} />
          {r.posted ? <span className="badge p">Posted</span> : <span className="badge gray">Mark posted</span>}
        </label>) : <span className="muted">—</span>,
      exportValue: r => r.posted ? "Posted" : "" },
    { key: "_action", label: "Action", sortable: false, render: r => (
      <span style={{ whiteSpace: "nowrap" }}>
        <button style={{ fontSize: 11.5, marginRight: 4 }} title="View full record" onClick={() => setViewExp(r)}>👁</button>
        {canApprMoney && (r.status === "pending" || r.status === "queried") ? (<>
        {session && r.claimant_id === session.id && (
          <button style={{ fontSize: 11.5, marginRight: 4 }} title="Edit before it is approved" onClick={() => setEditExp({ ...r })}>✎</button>
        )}
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actClaim(r.id, "approved")}>✓</button>
        <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => actClaim(r.id, "queried")}>?</button>
        <button style={{ fontSize: 11.5 }} onClick={() => actClaim(r.id, "rejected")}>✕</button>
        </>) : null}
      </span>) },
  ];
  // update212: six sections as TABS — one fixed-height scroll panel, page never grows
  const [mtab, setMtab] = useState("claims");
  // update300: the web now files expense claims too — same fields, same lib call as mobile,
  // so both surfaces write the identical record (date, site, source, bills, approvals flow).
  const [claimF, setClaimF] = useState(null);   // null = closed
  const [claimBusy, setClaimBusy] = useState(false);
  const [sitesList, setSitesList] = useState([]);
  const openClaim = async () => {
    if (!sitesList.length) { try { setSitesList(await getSites()); } catch {} }
    setClaimF({ site_id: session?.currentSite || "", expense_date: new Date().toLocaleDateString("en-CA"),
      funding_source: "own_pocket", category: "local_material", amount: "", paid_to: "", note: "", files: null });
  };
  async function submitWebClaim() {
    const f = claimF;
    if (!f.site_id) { setErr("Choose the site."); return; }
    if (!(Number(f.amount) > 0)) { setErr("Enter the amount."); return; }
    if (!f.paid_to.trim()) { setErr("Who was paid?"); return; }
    if (f.funding_source === "own_pocket" && !(f.files && f.files.length)) { setErr("Attach the bill(s) — proof is mandatory for reimbursement."); return; }
    setClaimBusy(true); setErr("");
    const res = await claimExpense({ site_id: Number(f.site_id), user_id: session?.id, category: f.category,
      amount: Number(f.amount), paid_to: f.paid_to.trim(), funding_source: f.funding_source, note: f.note.trim(),
      expense_date: f.expense_date || undefined, billFiles: f.files || [], bank_on_file: true });
    setClaimBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("Claim submitted for approval — it appears in the Expenses ledger as pending.");
    setClaimF(null); load();
  }
  const [fullView, setFullView] = useState(false);
  // update214: clickable claimant profile (live from the same tables — zero duplicate data)
  const AV_COLORS = ["#e07020", "#2b6cb0", "#15803d", "#6b46c1", "#b91c1c", "#0e7490", "#a16207"];
  const avInit = n => (n || "").split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase() || "?";
  const avColor = n => AV_COLORS[((n || "").split("").reduce((t, c) => t + c.charCodeAt(0), 0)) % AV_COLORS.length];
  const [profile, setProfile] = useState(null);     // { loading, name, ... }
  const [profTab, setProfTab] = useState("all");
  function openProfile(staffId, name) {
    if (!staffId) return;
    setProfTab("all"); setProfile({ loading: true, name });
    getPersonMoneyProfile(staffId).then(pr => setProfile(pr ? { ...pr, loading: false } : null));
  }   // update214: ⛶ full-page browsing (same DOM — filters/state preserved)
  const MT = [
    ["pettyreq", "🪙", "Petty cash requests", () => (pettyReqs || []).filter(r => r.status === "pending").length],
    ["advreq", "📄", "Advance salary requests", () => (adv || []).length],
    ["claims", "💳", "Expenses ledger", () => (claims || []).length],
    ["pettyled", "📒", "Petty cash ledger", () => petty.length],
    ["advled", "🧾", "Advance salary ledger", () => null],
    ["reports", "📊", "Reports", () => null],
  ];
  // update211: requester edits their own pending expense (incl. Own pocket <-> Petty cash)
  const [editExp, setEditExp] = useState(null);
  const [billsFor, setBillsFor] = useState(null);
  const [viewExp, setViewExp] = useState(null);
  const [showAdvForm, setShowAdvForm] = useState(false);   // update217: collapsed raise-advance form (lives in the advreq tab now)     // update216: 👁 full-record view   // update213: compact proof strip → gallery
  const [editBusy, setEditBusy] = useState(false); const [editErr, setEditErr] = useState("");
  async function saveEditExp() {
    setEditBusy(true); setEditErr("");
    const res = await selfEditExpense(editExp.id, {
      amount: editExp.amount, note: editExp.note, category: editExp.category,
      funding_source: editExp.funding_source, expense_date: editExp.expense_date, paid_to: editExp.paid_to });
    setEditBusy(false);
    if (!res.ok) { setEditErr(res.error); return; }
    setEditExp(null); setMsg("Expense updated."); getExpenseClaimQueue(scope).then(setClaims);
  }

  // returns queue + person ledger (update167)
  const [pettyReturns, setPettyReturns] = useState([]);
  const [ledgerFor, setLedgerFor] = useState("");        // "userId|name"
  // update312: switching tabs closes every open detail view / overlay from the previous
  // tab — a stale "Petty ledger — [name]" panel must never overlap the next tab's content.
  const switchTab = k => {
    setLedgerFor(""); setProfile(null); setEditExp(null); setBillsFor(null); setViewExp(null); setClaimF(null);
    setMtab(k);
  };
  const [ledgerRows, setLedgerRows] = useState(null);
  const [lf, setLf] = useState({ site: "all", from: "", to: "", category: "all", type: "all" });
  useEffect(() => { getPettyReturnQueue(scope).then(setPettyReturns); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = ledgerFor.split("|")[0];
    if (id) getPettyLedger(Number(id)).then(setLedgerRows); else setLedgerRows(null);
  }, [ledgerFor]);
  async function actReturn(id, action) {
    const note = action === "cancelled" ? window.prompt("Reason (sent to the holder):") : null;
    const res = await confirmPettyReturn(id, action, note);
    if (!res.ok) { window.alert("Could not save: " + res.error); return; }
    setMsg(action === "confirmed" ? "Cash return confirmed — balance updated." : "Return not accepted.");
    getPettyReturnQueue(scope).then(setPettyReturns); load();
    if (ledgerFor) { const id2 = ledgerFor.split("|")[0]; getPettyLedger(Number(id2)).then(setLedgerRows); }
  }
  const ledgerView = (ledgerRows || []).filter(l =>
    (lf.site === "all" || l.site === lf.site)
    && (lf.category === "all" || l.category === lf.category)
    && (lf.type === "all" || l.kind === lf.type)
    && (!lf.from || l.date >= lf.from) && (!lf.to || l.date <= lf.to));

  const pettyCols = [
    { key: "holder", label: "Holder", filter: "search", render: r => <span style={{ fontWeight: 600 }}>{r.holder}</span> },
    { key: "granted", label: "Granted", type: "num", render: r => inr(r.granted), exportValue: r => r.granted },
    { key: "spent", label: "Spent", type: "num", render: r => inr(r.spent), exportValue: r => r.spent },
    { key: "returned", label: "Returned", type: "num", render: r => inr(r.returned || 0), exportValue: r => r.returned || 0 },
    { key: "balance", label: "Balance", type: "num", render: r => <b>{inr(r.balance)}</b>, exportValue: r => r.balance },
    { key: "settled", label: "", render: r => r.settled ? <span className="badge p">✔ SETTLED</span>
        : <button style={{ fontSize: 11 }} onClick={() => setLedgerFor(r.user_id + "|" + r.holder)}>📒 Ledger</button> },
  ];

  return (
    <div className={embedded ? "money-embed" : ""}
         style={embedded ? undefined : { overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
      {!embedded && <div className="page-head"><h1>Money &amp; expenses</h1></div>}
        {isDemo && <div className="demo-banner">Demo mode — sample data.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        {/* update200: overview cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
          {[["💳 Total expenses", inr(approvedClaims), (claims || []).length + " transactions", null, "claims"],
            ["🪙 Petty cash held", inr(pettyBal), petty.length + " holders", null, "pettyled"],
            ["💸 Advances (approved)", inr(sumBy(advApproved, a => a.amount)), advApproved.length + " requests", null, "advled"],
            ["✅ Recovered / deducted", inr(advTotals.rec), "through pay", "var(--green)", "advled"],
            ["🔺 Outstanding advances", inr(advTotals.out), "to be recovered", advTotals.out > 0 ? "var(--red)" : "var(--green)", "advled"],
            ["⏳ Advance requests pending", inr(sumBy(advPending, a => a.amount)), advPending.length + " waiting", advPending.length ? "var(--amber)" : null, "advreq"]].map(([l, v, sub2, c, sec]) => (
            <div key={l} className="panel" role="button" tabIndex={0} style={{ padding: "10px 14px", margin: 0, cursor: "pointer" }}
              onClick={() => switchTab(sec)}>
              <div className="muted" style={{ fontSize: 11.5 }}>{l}</div>
              <div style={{ fontWeight: 800, fontSize: 19, color: c || "var(--text)" }}>{v}</div>
              <div className="muted" style={{ fontSize: 10.5 }}>{sub2} · <span style={{ color: "var(--copper)" }}>View details →</span></div>
            </div>
          ))}
        </div>


        <div style={fullView ? { position: "fixed", inset: 0, zIndex: 92, background: "var(--bg)", padding: "10px 14px", display: "flex", flexDirection: "column" } : { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: embedded ? "none" : "2px solid var(--border)", margin: "2px 0 0", flexWrap: embedded ? "wrap" : "nowrap" }}>
          {/* update216b: the tab strip scrolls; the ⛶ button lives OUTSIDE it in a pinned slot,
              so it can never be scrolled away, clipped, or overlapped at any width or zoom. */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 2, overflowX: "auto", whiteSpace: "nowrap" }}>
            {MT.map(([k, ic, l, cnt]) => { const n = cnt(); return (
              <button key={k} type="button" onClick={() => switchTab(k)}
                style={embedded
                  ? { flexShrink: 0, borderRadius: 999, padding: "6px 13px", fontSize: 12.5, cursor: "pointer", margin: "6px 3px",
                      border: mtab === k ? "2px solid var(--copper)" : "1px solid var(--border)",
                      background: mtab === k ? "#fff8f2" : "#fff", color: mtab === k ? "var(--copper)" : "var(--text)",
                      fontWeight: mtab === k ? 800 : 600 }
                  : { border: "none", background: "none", padding: "9px 12px", fontSize: 12.5, cursor: "pointer", flexShrink: 0,
                      fontWeight: mtab === k ? 800 : 600, color: mtab === k ? "var(--copper)" : "var(--text)",
                      borderBottom: mtab === k ? "3px solid var(--copper)" : "3px solid transparent" }}>
                {ic} {l}{n !== null && n > 0 && <span className="badge gray" style={{ marginLeft: 6, fontSize: 10.5 }}>{n}</span>}
              </button>
            ); })}
          </div>
          {!embedded && <button type="button" title={fullView ? "Back to normal view" : "Open full-page view"} onClick={() => setFullView(v => !v)}
            style={{ flexShrink: 0, position: "relative", zIndex: 6, border: "1px solid var(--copper)", background: "#fff", color: "var(--copper)", borderRadius: 8, padding: "5px 12px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(15,20,25,0.08)" }}>
            {fullView ? "✕ Close" : "⛶ Expand"}</button>}
        </div>
        <div className="panel money-tab-panel" style={{ marginTop: 0, marginBottom: 8, borderTopLeftRadius: 0, flex: 1, minHeight: 260, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 4px 14px rgba(15,20,25,0.05)" }}>
        <div className={mtab === "pettyreq" ? "money-sec" : undefined} style={{ display: mtab === "pettyreq" ? "flex" : "none", overflowY: "auto" }}>
          {session && canAnySite(session, "money", "create") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 12, alignItems: "end" }}>
              <div><label className="muted">Amount ₹ *</label>
                <input style={{ width: "100%" }} inputMode="numeric" value={pettyForm.amount}
                       onChange={e => setPettyForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><label className="muted">Purpose *</label>
                <input style={{ width: "100%" }} value={pettyForm.purpose}
                       onChange={e => setPettyForm(f => ({ ...f, purpose: e.target.value }))} /></div>
              <div><label className="muted">Required by</label>
                <input type="date" style={{ width: "100%" }} value={pettyForm.required_date}
                       onChange={e => setPettyForm(f => ({ ...f, required_date: e.target.value }))} /></div>
              <div><label className="muted">Remarks</label>
                <input style={{ width: "100%" }} value={pettyForm.remarks}
                       onChange={e => setPettyForm(f => ({ ...f, remarks: e.target.value }))} /></div>
              <div><button className="primary" onClick={sendWebPetty} style={{ width: "100%" }}>Request petty cash</button></div>
            </div>
          )}
          {pettyMsg && <div className="muted" style={{ marginBottom: 8 }}>{pettyMsg}</div>}
          {!pettyReqs ? <div className="muted">Loading…</div> : pettyReqs.length === 0 ? <div className="muted">No petty cash requests yet.</div> : (<>
            <table className="dt-compact">
              <thead><tr><th>Date</th><th>Requester</th><th>Site</th><th className="num">Amount</th><th>Purpose</th><th>Needed by</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {pageOf(pettyReqs, pgPetty).map(r => (
                  <tr key={r.id}>
                    <td className="muted">{r.date}</td>
                    <td style={{ fontWeight: 600 }}>{r.requester}</td>
                    <td className="muted">{r.site}</td>
                    <td className="num">₹{r.amount}
                      {r.status === "approved" && r.approved_amount != null && r.approved_amount !== r.amount
                        ? <div style={{ fontSize: 11, color: "var(--green)" }}>approved ₹{r.approved_amount}</div> : null}</td>
                    <td>{r.purpose}{r.remarks ? <span className="muted"> — {r.remarks}</span> : ""}</td>
                    <td className="muted">{r.required_date || "—"}</td>
                    <td>{r.status === "approved" ? <span className="badge p">Approved</span>
                        : r.status === "rejected" ? <span className="badge a">Rejected{r.query ? " — " + r.query : ""}</span>
                        : <span className="badge gray">Pending</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canApprMoney && r.status === "pending" && (
                        <>
                          <input inputMode="numeric" style={{ width: 70, fontSize: 11.5, marginRight: 4 }}
                                 value={pettyAmt[r.id] ?? String(r.amount)} title="Amount to approve (can differ from asked)"
                                 onChange={e => setPettyAmt(a => ({ ...a, [r.id]: e.target.value }))} />
                          <button className="primary" style={{ fontSize: 11.5, marginRight: 4 }}
                                  onClick={() => actPetty(r.id, "approved", pettyAmt[r.id] ?? r.amount)}>Approve</button>
                          <button style={{ fontSize: 11.5 }} onClick={() => actPetty(r.id, "rejected")}>Reject</button>
                        </>
                      )}
                      {canApprMoney && r.status === "approved" && (
                        <>
                          <button style={{ fontSize: 11.5, marginRight: 4 }} title="Approve a different amount"
                                  onClick={() => { const v = window.prompt("Revised approved amount \u20b9 (asked \u20b9" + r.amount + "):", String(r.approved_amount ?? r.amount)); if (v != null && v !== "") actPetty(r.id, "approved", v); }}>✎ Change amount</button>
                          <button style={{ fontSize: 11.5, color: "var(--red)" }} title="Remove the granted amount and mark rejected"
                                  onClick={() => { if (window.confirm("Withdraw this approval? \u20b9" + (r.approved_amount ?? r.amount) + " will be removed from " + r.requester + "'s petty balance.")) actPetty(r.id, "rejected"); }}>Undo approval</button>
                        </>
                      )}
                      {canApprMoney && r.status === "rejected" && (
                        <button style={{ fontSize: 11.5 }} title="Approve after all"
                                onClick={() => { const v = window.prompt("Approve amount \u20b9 (asked \u20b9" + r.amount + "):", String(r.amount)); if (v != null && v !== "") actPetty(r.id, "approved", v); }}>Approve…</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Pager({ n: pettyReqs.length, pg: pgPetty, set: setPgPetty })}
          </>)}
        </div>

        <div className={mtab === "advreq" ? "money-sec" : undefined} style={{ display: mtab === "advreq" ? "flex" : "none", overflowY: "auto" }}>
          {/* update242: review failures (e.g. "already marked PAID") must be visible, not swallowed */}
          {advErr && <div className="note red" style={{ marginBottom: 8 }}>⚠ {advErr}</div>}
          {/* update217: the standalone page-top form moved here, collapsed behind one button */}
          {session && canAnySite(session, "money", "create") && <div style={{ flexShrink: 0, marginBottom: 8 }}>
            {!showAdvForm ? (
              <button type="button" className="primary" style={{ fontSize: 12.5 }} onClick={() => setShowAdvForm(true)}>＋ Raise advance salary</button>
            ) : (
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", background: "#faf9f6" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ margin: 0, fontSize: 15 }}>Raise advance salary</h2>
                  <button type="button" onClick={() => setShowAdvForm(false)}>✕ Close</button>
                </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
              <div><label className="muted">For whom * (staff &amp; labour of your sites)</label>
                <select style={{ width: "100%" }} value={advForm.beneficiary}
                        onChange={e => setAdvForm(f => ({ ...f, beneficiary: e.target.value }))}>
                  <option value="">Select person…</option>
                  {bens.map(b => <option key={`${b.kind}:${b.id}`} value={`${b.kind}:${b.id}`}>{b.label}{!b.bank ? " · ⚠ no bank" : ""}</option>)}
                </select></div>
              <div><label className="muted">Amount ₹ *</label>
                <input style={{ width: "100%" }} inputMode="numeric" value={advForm.amount}
                       onChange={e => setAdvForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div><label className="muted">Reason</label>
                <input style={{ width: "100%" }} value={advForm.reason} placeholder="e.g. medical / festival advance"
                       onChange={e => setAdvForm(f => ({ ...f, reason: e.target.value }))} /></div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button className="primary" disabled={advBusy} onClick={submitWebAdvance}>{advBusy ? "Sending…" : "Send request"}</button></div>
            </div>
            {advErr && <div className="note red" style={{ marginTop: 8 }}>{advErr}</div>}
              </div>
            )}
          </div>}
          {!adv ? <div className="muted">Loading…</div> :
            <DataTable columns={advCols} rows={adv} exportName="advance_requests" dateField="date" pageSize={10} fill />}
        </div>

        <div className={mtab === "claims" ? "money-sec" : undefined} style={{ display: mtab === "claims" ? "flex" : "none", overflowY: "auto" }}>
          <div style={{ marginBottom: 8 }}>{/* update300 */}
            <button className="primary" onClick={openClaim}>＋ Claim expense / create voucher</button>
          </div>
          {claimF && (
            <div onClick={() => !claimBusy && setClaimF(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div onClick={ev => ev.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: 20, width: "min(480px, 94vw)", maxHeight: "90vh", overflowY: "auto" }}>
                <h3 style={{ marginTop: 0 }}>Claim site expense</h3>
                <label className="muted">Voucher date *</label>
                <input type="date" value={claimF.expense_date} max={new Date().toLocaleDateString("en-CA")} onChange={ev => setClaimF(x => ({ ...x, expense_date: ev.target.value }))} style={{ width: "100%", marginBottom: 8 }} />
                <label className="muted">Site *</label>
                <select value={claimF.site_id} onChange={ev => setClaimF(x => ({ ...x, site_id: ev.target.value }))} style={{ width: "100%", marginBottom: 8 }}>
                  <option value="">— choose site —</option>
                  {sitesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <label className="muted">Paid from *</label>
                <select value={claimF.funding_source} onChange={ev => setClaimF(x => ({ ...x, funding_source: ev.target.value }))} style={{ width: "100%", marginBottom: 8 }}>
                  <option value="own_pocket">My own pocket (reimburse me to bank)</option>
                  <option value="petty_cash">Site petty cash I hold</option>
                </select>
                <label className="muted">Category</label>
                <select value={claimF.category} onChange={ev => setClaimF(x => ({ ...x, category: ev.target.value }))} style={{ width: "100%", marginBottom: 8 }}>
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <label className="muted">Amount ₹ *</label>
                <input type="number" min="1" value={claimF.amount} onChange={ev => setClaimF(x => ({ ...x, amount: ev.target.value }))} style={{ width: "100%", marginBottom: 8 }} />
                <label className="muted">Paid to *</label>
                <input value={claimF.paid_to} placeholder="Shop / person" onChange={ev => setClaimF(x => ({ ...x, paid_to: ev.target.value }))} style={{ width: "100%", marginBottom: 8 }} />
                <label className="muted">Note</label>
                <input value={claimF.note} placeholder="What was it for" onChange={ev => setClaimF(x => ({ ...x, note: ev.target.value }))} style={{ width: "100%", marginBottom: 8 }} />
                <label className="muted">Bill(s) — photo or PDF{claimF.funding_source === "own_pocket" ? " *" : ""}</label>
                <input type="file" accept="image/*,application/pdf" multiple onChange={ev => setClaimF(x => ({ ...x, files: ev.target.files }))} style={{ width: "100%", marginBottom: 12 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="primary" disabled={claimBusy} onClick={submitWebClaim}>{claimBusy ? "Submitting…" : "Submit claim"}</button>
                  <button disabled={claimBusy} onClick={() => setClaimF(null)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
          {/* update247: the voucher bar only appears once something is ticked */}
          {selIds.length > 0 && (
            <div className="note" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              background: "var(--copper-soft)", border: "1px solid var(--copper)", marginBottom: 8, padding: "8px 12px" }}>
              <b style={{ fontSize: 13 }}>{selIds.length} claim(s) selected · {inr(selTotal)}</b>
              {selPayees > 1 && <span style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 700 }}>
                ⚠ more than one claimant — a voucher should cover one payee</span>}
              <button className="primary" style={{ fontSize: 12.5, marginLeft: "auto" }} onClick={openVoucher}>🧾 Cash Voucher</button>
              <button style={{ fontSize: 12.5 }} onClick={() => setSel({})}>Clear</button>
            </div>
          )}
          {!claims ? <div className="muted">Loading…</div> :
            <DataTable columns={claimCols} rows={claims} exportName="expense_claims" dateField="date" pageSize={10} fill />}
        </div>

        {pettyReturns.length > 0 && (
          <div className="panel" style={{ borderLeft: "4px solid var(--copper)" }}>
            <h2>Cash returns awaiting confirmation ({pettyReturns.length})</h2>
            <table className="dt-compact"><thead><tr><th>Date</th><th>Holder</th><th>Site</th><th className="num">Amount</th><th>Note</th><th></th></tr></thead>
              <tbody>{pageOf(pettyReturns, pgRet).map(r => (
                <tr key={r.id}>
                  <td className="muted">{r.date}</td><td style={{ fontWeight: 600 }}>{r.holder}</td>
                  <td className="muted">{r.site}</td><td className="num">{inr(r.amount)}</td>
                  <td className="muted"><span className="clamp2" title={r.note || ""}>{r.note || "—"}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canApprMoney ? (<>
                      <button className="primary" style={{ fontSize: 11.5, marginRight: 4 }}
                              onClick={() => { if (window.confirm("Confirm you RECEIVED " + inr(r.amount) + " cash from " + r.holder + "? Their balance reduces by this amount.")) actReturn(r.id, "confirmed"); }}>✔ Received</button>
                      <button style={{ fontSize: 11.5 }} onClick={() => actReturn(r.id, "cancelled")}>Not received</button>
                    </>) : <span className="muted" style={{ fontSize: 11.5 }}>Awaiting Director</span>}
                  </td>
                </tr>))}
              </tbody></table>
            {Pager({ n: pettyReturns.length, pg: pgRet, set: setPgRet })}
          </div>
        )}

        {ledgerFor && (
          <div className="panel" style={{ borderLeft: "4px solid #2b6cb0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Petty ledger — {ledgerFor.split("|")[1]}</h2>
              <span>
                <button style={{ fontSize: 11.5, marginRight: 6 }} onClick={() => {
                  const head = "Date,Type,Site,Category,Detail,Amount,Status,Bill links";
                  const rows = ledgerView.map(l => [l.date, l.kind, l.site, l.category || "", (l.label || "").replace(/,/g, ";"),
                    (l.sign < 0 ? -l.amount : l.amount), l.status, (l.bills || []).map(b => billUrl(b)).join(" | ")].join(","));
                  const csv = [head, ...rows].join("\n");
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
                  a.download = "petty_ledger_" + ledgerFor.split("|")[1].replace(/\s+/g, "_") + ".csv"; a.click();
                }}>⬇ Excel</button>
                <button style={{ fontSize: 11.5 }} onClick={() => setLedgerFor("")}>Close</button>
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              <select value={lf.site} onChange={e => setLf(f => ({ ...f, site: e.target.value }))}>
                <option value="all">Site: all</option>
                {[...new Set((ledgerRows || []).map(l => l.site).filter(Boolean))].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={lf.category} onChange={e => setLf(f => ({ ...f, category: e.target.value }))}>
                <option value="all">Category: all</option>
                {[...new Set((ledgerRows || []).map(l => l.category).filter(Boolean))].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={lf.type} onChange={e => setLf(f => ({ ...f, type: e.target.value }))}>
                <option value="all">Type: all</option>
                {[...new Set((ledgerRows || []).map(l => l.kind))].map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <input type="date" value={lf.from} onChange={e => setLf(f => ({ ...f, from: e.target.value }))} />
              <input type="date" value={lf.to} onChange={e => setLf(f => ({ ...f, to: e.target.value }))} />
            </div>
            {!ledgerRows ? <div className="muted">Loading…</div> : (
              <table className="dt-compact">
                <thead><tr><th>Date</th><th>Type</th><th>Site</th><th>Category</th><th>Detail</th><th className="num">Amount</th><th>Bills</th></tr></thead>
                <tbody>{ledgerView.map((l, i) => (
                  <tr key={i}>
                    <td className="muted">{l.date}</td>
                    <td>{l.kind}{l.status === "pending" ? <span className="badge gray" style={{ marginLeft: 4 }}>pending</span> : null}</td>
                    <td className="muted">{l.site}</td><td className="muted">{l.category || "—"}</td>
                    <td>{l.label || "—"}</td>
                    <td className="num" style={{ color: l.sign > 0 ? "var(--green)" : l.sign < 0 ? "var(--red)" : "inherit", fontWeight: 600 }}>
                      {l.sign > 0 ? "+" : l.sign < 0 ? "−" : ""}{inr(l.amount)}</td>
                    <td>{l.bills.map((b, j) => (
                      <span key={j} style={{ marginRight: 6 }}>
                        <a href={billUrl(b)} target="_blank" rel="noreferrer">📎</a>
                        <a href={billUrl(b, true)} style={{ marginLeft: 2 }}>⬇</a>
                      </span>))}</td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className={mtab === "pettyled" ? "money-sec" : undefined} style={{ display: mtab === "pettyled" ? "flex" : "none", overflowY: "auto" }}>
          {petty.length === 0 ? <span className="muted">No petty cash issued yet.</span> :
            <DataTable columns={pettyCols} rows={petty} exportName="petty_cash" pageSize={10} fill />}
        </div>
        <div id="advances" />
        <div className={mtab === "advled" ? "money-sec" : undefined} style={{ display: mtab === "advled" ? "flex" : "none", overflowY: "auto" }}>
          <AdvanceLedger onTotals={t => setAdvTotals(prev => (prev.taken === t.taken && prev.rec === t.rec && prev.out === t.out) ? prev : t)} />
        </div>
        <div className={mtab === "reports" ? "money-sec" : undefined} style={{ display: mtab === "reports" ? "flex" : "none", overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
            <span className="muted" style={{ fontSize: 12.5, width: "100%" }}>Every ledger above has its own ⬇ Excel export (with the filters you set). Additional:</span>
            <a href="/tally"><button style={{ fontSize: 12.5 }}>🧾 Tally export</button></a>
            <button style={{ fontSize: 12.5 }} onClick={() => window.print()}>🖨 Print this overview</button>
          </div>
        </div>
        </div>{/* end fixed tab panel */}
        </div>{/* end fullview wrapper */}
        {editExp && (
          <div onClick={() => setEditExp(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 97, padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 460, width: "100%", padding: 20 }}>
              <h2>✎ Edit expense <span className="muted" style={{ fontSize: 12 }}>(before approval)</span></h2>
              {editErr && <div className="note red">{editErr}</div>}
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div><label className="muted" style={{ fontSize: 11.5 }}>Date</label><br /><input type="date" value={editExp.expense_date || ""} onChange={e => setEditExp(x => ({ ...x, expense_date: e.target.value }))} /></div>
                  <div><label className="muted" style={{ fontSize: 11.5 }}>Amount ₹ *</label><br /><input inputMode="decimal" style={{ width: 110 }} value={editExp.amount} onChange={e => setEditExp(x => ({ ...x, amount: e.target.value }))} /></div>
                  <div><label className="muted" style={{ fontSize: 11.5 }}>Category</label><br />
                    <select value={editExp.category} onChange={e => setEditExp(x => ({ ...x, category: e.target.value }))}>
                      {EXPENSE_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                </div>
                <div><label className="muted" style={{ fontSize: 11.5 }}>Paid to</label><br /><input style={{ width: "100%" }} value={editExp.paid_to || ""} onChange={e => setEditExp(x => ({ ...x, paid_to: e.target.value }))} /></div>
                <div><label className="muted" style={{ fontSize: 11.5 }}>Purpose / note</label><br /><input style={{ width: "100%" }} value={editExp.note || ""} onChange={e => setEditExp(x => ({ ...x, note: e.target.value }))} /></div>
                <div>
                  <label className="muted" style={{ fontSize: 11.5 }}>Paid from</label><br />
                  {[["own_pocket", "👛 Own pocket"], ["petty_cash", "🪙 Petty cash"]].map(([v, l]) => (
                    <label key={v} style={{ marginRight: 16, fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" name="fundsrc" checked={editExp.funding_source === v} onChange={() => setEditExp(x => ({ ...x, funding_source: v }))} /> {l}
                    </label>
                  ))}
                  <div className="muted" style={{ fontSize: 11 }}>Switching is safe before approval — petty cash is deducted only when the Director approves.</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="primary" disabled={editBusy} onClick={saveEditExp}>{editBusy ? "Saving…" : "Save changes"}</button>
                <button onClick={() => setEditExp(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {billsFor && (
          <div onClick={() => setBillsFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 98, padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 620, width: "100%", padding: 18, maxHeight: "88vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>📎 Bills — {billsFor.paid_to} · {inr(billsFor.amount)}</h3>
                <button type="button" onClick={() => setBillsFor(null)}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginTop: 12 }}>
                {(billsFor.bills || []).map((b, i) => (
                  <a key={i} href={billUrl(b)} target="_blank" rel="noreferrer" style={{ textDecoration: "none", textAlign: "center", border: "1px solid var(--border)", borderRadius: 10, padding: 8 }}>
                    {isPdf(b)
                      ? <div style={{ height: 84, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>📄</div>
                      : <img src={billUrl(b)} alt={"bill " + (i + 1)} style={{ height: 84, width: "100%", objectFit: "cover", borderRadius: 6 }} />}
                    <div style={{ fontSize: 11.5, marginTop: 4 }}>Bill {i + 1} <span className="muted">· open ↗</span></div>
                  </a>
                ))}
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Tap any bill to open it full size in a new tab (⬇ from there).</div>
            </div>
          </div>
        )}
        {profile && (
          <div onClick={() => setProfile(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99, padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 680, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 18px 50px rgba(0,0,0,0.25)" }}>
              <div style={{ background: "var(--deep)", color: "#fff", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                <span className="avatar-chip" style={{ width: 40, height: 40, fontSize: 15, background: avColor(profile.name) }}>{avInit(profile.name)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{profile.name}</div>
                  {!profile.loading && <div style={{ fontSize: 12, opacity: 0.8 }}>{(profile.role || "").replace("_", " ")}</div>}
                </div>
                <button type="button" onClick={() => setProfile(null)} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>
              </div>
              {profile.loading ? <div className="muted" style={{ padding: 24 }}>Loading history…</div> : <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 0, borderBottom: "1px solid var(--border)", background: "#faf9f6" }}>
                  {[["Total used (all time)", inr(profile.totals.all), null],
                    ["This month", inr(profile.totals.month), null],
                    ["Advances taken", inr(profile.totals.taken), null],
                    ["Advances recovered", inr(profile.totals.recovered), "var(--green)"],
                    ["Outstanding", inr(profile.totals.outstanding), profile.totals.outstanding > 0 ? "var(--red)" : "var(--green)"],
                    ["Petty cash held", inr(profile.totals.petty), null]].map(([l, v, c]) => (
                    <div key={l} style={{ padding: "10px 12px", textAlign: "center" }}>
                      <div className="muted" style={{ fontSize: 10 }}>{l}</div>
                      <b style={{ fontSize: 14.5, color: c || "var(--text)" }}>{v}</b>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 2, padding: "0 14px", borderBottom: "1px solid var(--border)" }}>
                  {[["all", "All transactions", profile.txns.length], ["exp", "Expenses", profile.txns.filter(t => t.kind === "exp").length], ["adv", "Advances", profile.txns.filter(t => t.kind === "adv").length]].map(([k, l, n]) => (
                    <button key={k} type="button" onClick={() => setProfTab(k)}
                      style={{ border: "none", background: "none", padding: "9px 10px", fontSize: 12.5, cursor: "pointer", fontWeight: profTab === k ? 800 : 600, color: profTab === k ? "var(--copper)" : "var(--text)", borderBottom: profTab === k ? "3px solid var(--copper)" : "3px solid transparent", marginBottom: -1 }}>
                      {l} · {n}</button>
                  ))}
                </div>
                <div style={{ overflowY: "auto", padding: "6px 14px 14px", overscrollBehavior: "contain" }}>
                  <table className="dt-compact" style={{ width: "100%" }}>
                    <thead><tr><th>Date</th><th>Type</th><th>Purpose / paid to</th><th>Site</th><th className="num">Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {profile.txns.filter(t => profTab === "all" || t.kind === profTab).map((t, i) => (
                        <tr key={i}>
                          <td className="muted">{t.date}</td>
                          <td>{t.type === "Advance recovered" ? <span style={{ color: "var(--green)" }}>{t.type}</span> : t.type}</td>
                          <td><span className="clamp2" title={t.what}>{t.what || "—"}</span></td>
                          <td className="muted">{t.site}</td>
                          <td className="num"><b style={{ color: t.type === "Expense" ? "var(--red)" : t.type === "Advance recovered" ? "var(--green)" : "var(--text)" }}>{inr(t.amount)}</b></td>
                          <td><span className={"badge " + (t.status === "approved" ? "p" : t.status === "rejected" ? "red" : "warn")}>{t.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>}
            </div>
          </div>
        )}
        {viewExp && (
          <div onClick={() => setViewExp(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 98, padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h2 style={{ margin: 0 }}>💳 Expense — <b>{inr(viewExp.amount)}</b></h2>
                <button type="button" onClick={() => setViewExp(null)}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 18px", marginTop: 14, fontSize: 13 }}>
                {[["Date", viewExp.date], ["Claimant", viewExp.claimant], ["Site", viewExp.site], ["Category", catLabel(viewExp.category)],
                  ["Paid to", viewExp.paid_to], ["Source", viewExp.funding_source === "petty_cash" ? "🪙 Petty cash" : "👛 Own pocket"],
                  ["Status", viewExp.status], ["Approved by", viewExp.approved_by ? viewExp.approved_by + (viewExp.approved_on ? " · " + viewExp.approved_on : "") : "—"],
                  ["Tally", viewExp.posted ? "Posted" : "Not posted"]].map(([l, v]) => (
                  <div key={l}><div className="muted" style={{ fontSize: 10.5 }}>{l}</div><b style={{ fontWeight: 600 }}>{v || "—"}</b></div>
                ))}
              </div>
              <div style={{ marginTop: 10 }}><div className="muted" style={{ fontSize: 10.5 }}>Purpose / note</div><div style={{ fontSize: 13 }}>{viewExp.note || "—"}</div></div>
              {viewExp.response && <div style={{ marginTop: 8, color: "var(--green)", fontSize: 12.5 }}>↩ Reply: {viewExp.response}</div>}
              {viewExp.query && <div style={{ marginTop: 4, color: "var(--amber)", fontSize: 12.5 }}>❓ Query: {viewExp.query}</div>}
              {(viewExp.bills || []).length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8, marginTop: 12 }}>
                  {viewExp.bills.map((b, i) => (
                    <a key={i} href={billUrl(b)} target="_blank" rel="noreferrer" style={{ textDecoration: "none", textAlign: "center", border: "1px solid var(--border)", borderRadius: 10, padding: 6 }}>
                      {isPdf(b) ? <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>📄</div>
                        : <img src={billUrl(b)} alt={"bill " + (i + 1)} style={{ height: 64, width: "100%", objectFit: "cover", borderRadius: 6 }} />}
                      <div style={{ fontSize: 11 }}>Bill {i + 1}</div>
                    </a>
                  ))}
                </div>
              )}
              {/* update238: self-edit (211) is NOT an approval — it stays for the claimant regardless */}
              {session && viewExp.claimant_id === session.id && (viewExp.status === "pending" || viewExp.status === "queried") && (
                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  <button onClick={() => { setEditExp({ ...viewExp }); setViewExp(null); }}>✎ Edit</button>
                </div>
              )}
              {canApprMoney && (viewExp.status === "pending" || viewExp.status === "queried") && (
                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  <button className="primary" onClick={async () => { await actClaim(viewExp.id, "approved"); setViewExp(null); }}>✓ Approve</button>
                  <button onClick={async () => { await actClaim(viewExp.id, "queried"); setViewExp(null); }}>? Query</button>
                  <button style={{ color: "var(--red)" }} onClick={async () => { await actClaim(viewExp.id, "rejected"); setViewExp(null); }}>✕ Reject</button>
                </div>
              )}
            </div>
          </div>
        )}




    </div>
  );
}
