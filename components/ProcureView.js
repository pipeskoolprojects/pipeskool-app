"use client";
import { Fragment, useEffect, useState, useRef } from "react";
import { isDemo } from "@/lib/supabase";
import { getSession, can } from "@/lib/auth";
import { canApprove } from "@/lib/perms";
import {
  getOpenIndents, saveQuotes, getQuotes, buildComparison, createPO, getPOs, cancelPO, approvePO, getAllIndents, inr, getRateSuggestions, getItemPriceMap,
  uploadQuoteProof, getQuoteProofs, deleteQuoteProof, getPOProofs,
  DELIVERY_STATUS, updatePODelivery, lastRateForVendor,   // update408
} from "@/lib/procure";
import { getVendors } from "@/lib/vendors";
import VendorLink from "@/components/VendorLink";   // update410
import { useCanViewPrices } from "@/lib/prices";   // update463
import { createIndent, editIndent, deleteIndent, quickAddItem, getIndentEditAudit } from "@/lib/stock";   // update337
import { deleteIndentItem, closeEmptyIndent } from "@/lib/procure";   // update434
import { getPoDcPending } from "@/lib/challan";   // update441
import { getSiteAllowance, checkLine } from "@/lib/boqMaterials";   // update372
import { searchIndentCatalog } from "@/lib/boq";
import { getSites } from "@/lib/data";
import { billUrl, isPdf } from "@/lib/bills";

export default function ProcureView({ siteId = null, only = "all", showHead = true }) {
  // update243: de-iframed. siteId arrives as a PROP, so a project tab cannot show another
  // site's data — there is no URL flag to lose and no dropdown default to override.
  // only: "indents" | "po" | "all" — the project page has two separate tabs, so each renders
  // just its half. "all" keeps the standalone /procure page exactly as it was.
  const showInd = only === "all" || only === "indents";
  const showPo = only === "all" || only === "po";
  const scope = siteId ? String(siteId) : "all";
  const [session, setSession] = useState(null);
  const [dcPend, setDcPend] = useState({});   // update441
  const [editLog, setEditLog] = useState(null);   // update337: null = closed
  const isDirector = session?.role === "director";
  // update238: PO approval right, from the shared helper. It resolves to director-only because
  // fn_po_approve is director-only in the database — the UI must not offer a button the RPC
  // will refuse. Delegating PO approval means changing fn_po_approve AND lib/perms together.
  const canApprPO = canApprove(session, "indent");
  const [allInd, setAllInd] = useState(null);   // update209: All Indents modal data (null = closed)
  const [indents, setIndents] = useState(null);
  const [pos, setPos] = useState([]);
  const [posReady, setPosReady] = useState(false);
  const [poFsite, setPoFsite] = useState("all");     // update178: PO list filters
  // update243: the old ?site= read set ONLY the PO filter and never the indent list — that was
  // the "other sites' indents appear inside a project" bug. Scoping is now the `scope` const
  // above, applied to both loaders, so the two halves can no longer disagree.
  const [poFvendor, setPoFvendor] = useState("");
  const [poFindent, setPoFindent] = useState("");
  const [poFraised, setPoFraised] = useState("all");
  const [poFvendorSel, setPoFvendorSel] = useState("all");
  const [poFdeliv, setPoFdeliv] = useState("all");
  const [poFstatus, setPoFstatus] = useState("all");
  const [poMore, setPoMore] = useState(false);   // update407 More filters · update410: rows always expanded
  useEffect(() => { try { const v = new URLSearchParams(window.location.search).get("po"); if (v) { setPoFindent(v); setTimeout(() => document.getElementById("po-list")?.scrollIntoView({ behavior: "smooth" }), 400); } } catch {} }, []);
  const [poFfrom, setPoFfrom] = useState("");
  const [poFto, setPoFto] = useState("");
  const poShown = pos.filter(p =>
    (poFsite === "all" || p.site === poFsite || String(p.site_id) === String(poFsite)) &&
    (!poFindent || (p.indent_no || "").toLowerCase().includes(poFindent.toLowerCase()) || (p.po_no || "").toLowerCase().includes(poFindent.toLowerCase())) &&
    (poFraised === "all" || p.raised_by === poFraised) &&
    (poFvendorSel === "all" || p.vendor === poFvendorSel) &&
    (!poFvendor || (p.vendor || "").toLowerCase().includes(poFvendor.toLowerCase())) &&
    (poFdeliv === "all" || (p.delivery_status || "pending") === poFdeliv) &&
    (poFstatus === "all" || (poFstatus === "live" ? p.status !== "cancelled" : p.status === poFstatus)) &&
    (!poFfrom || (p.date || "") >= poFfrom) && (!poFto || (p.date || "") <= poFto));
  const [deliv, setDeliv] = useState(null);   // PO being edited for delivery
  const [openId, setOpenId] = useState(null);
  const [enqVendors, setEnqVendors] = useState([]);     // vendor names added to this enquiry
  const [vendorPick, setVendorPick] = useState("");      // master select before "Add"
  const [alloc, setAlloc] = useState({});                // {itemId: {vendor: true}}  which vendor quotes which item
  // update299: quote-panel typing mirrors to this device per indent — refresh/app-switch/crash
  // never loses entered rates; the mirror clears once saved or the PO is created.
  const draftKey = id => "psk_qdraft_" + id;
  const saveDraft = (id, obj) => { try { localStorage.setItem(draftKey(id), JSON.stringify(obj)); } catch {} };
  const readDraft = id => { try { return JSON.parse(localStorage.getItem(draftKey(id)) || "null"); } catch { return null; } };
  const clearDraft = id => { try { localStorage.removeItem(draftKey(id)); } catch {} };
  const [qin, setQin] = useState({});                    // {itemId: {vendor: {list, disc}}}
  const [gstSel, setGstSel] = useState({});              // update178: per-item GST % (default 18)
  const [rates, setRates] = useState({});                // derived NET map {itemId: {vendor: net}}
  const [enqSel, setEnqSel] = useState({});              // {itemId: bool} items to include in enquiry download
  const [cmp, setCmp] = useState(null);
  const [proofs, setProofs] = useState([]);        // update254: rate-comparison proofs for the open indent
  const [rateSug, setRateSug] = useState({});      // update299: item_key -> last remembered price+vendor
  const [priceMap, setPriceMap] = useState({});    // update303: item_id -> Price Master resolution
  const canPx = useCanViewPrices();   // update463: quotes, rates, PO values — price viewers only (the database enforces it too)
  // unit-aware view of a Price-Master row: Rmt lines price per metre, others per piece
  const priceFor = it => {
    const p = priceMap[Number(it.item_id)];
    if (!p || !p.ok || canPx !== true) return null;
    const perM = (it.unit || "").toLowerCase() === "rmt" && p.priced_length_m > 0;
    return { list: perM ? +(p.list_pcs / p.priced_length_m).toFixed(2) : +p.list_pcs,
             disc: +p.discount_pct, net: perM ? p.per_mtr : p.net_pcs, per: perM ? "mtr" : "pc", from: p.list_date };
  };
  const sugLine = name => {
    const s = rateSug[(name || "").trim().toLowerCase()];
    if (!s || canPx !== true || s.rate == null) return null;
    return `Last: ${inr(s.rate)}${s.discount_pct ? ` (−${s.discount_pct}%)` : ""}${s.vendor_name ? " · " + s.vendor_name : ""} · ${(s.noted_at || "").slice(0, 10)}${s.source === "po" ? " (PO)" : ""}`;
  };
  const [proofErr, setProofErr] = useState("");    // update266: inline upload error shown under the Attach button
  const [poProofs, setPoProofs] = useState({});    // update253: indent_item_id -> [proof]
  const [upBusy, setUpBusy] = useState("");
  const [awardVendor, setAwardVendor] = useState("");
  const [splitMode, setSplitMode] = useState(false);
  const [itemVendor, setItemVendor] = useState({});
  const [itemSplits, setItemSplits] = useState({}); // {itemId: [{vendor, qty}]} when qty-split is on
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  // update368: `busy` is state, and state does not update synchronously — two clicks in the
  // same tick both get past it, which is how IND/5/2609/005-014 happened. A ref flips at
  // once, so the second click is dropped before it reaches the network.
  const submitting = useRef(false);
  const [sites, setSites] = useState([]);
  const [ni, setNi] = useState(null);                    // new-indent modal state
  useEffect(() => { getSites().then(setSites); }, []);
  const blankLine = () => ({ item_name: "", qty: "", unit: "", item_id: null, spec: "" });
  const [sug, setSug] = useState(null);            // { i, q, list }
  const [devs, setDevs] = useState({});             // update372: item_name -> deviation for the current form
  const canAddMaster = session && (session.role === "director" || can(session, "stock", "manage", ni?.site_id));
  // update186: DB policy on purchase_orders = indent create/manage — mirror it in the UI instead of a raw RLS error
  const canIssuePO = ind => session && (session.role === "director" || can(session, "indent", "create", ind?.site_id) || can(session, "indent", "manage", ind?.site_id));
  // update337: edit ANY indent, not just your own. Server re-checks on every save.
  const canEditAnyIndent = !!session && (session.role === "director" || can(session, "indent_edit", "manage"));
  async function onItemType(i, val) {
    setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], item_name: val, item_id: null }; return { ...n, lines: ls }; });
    if (val.trim().length >= 2) setSug({ i, q: val, list: await searchIndentCatalog(ni.site_id, val.trim()) });
    else setSug(null);
  }
  function pickSug(i, opt) {
    setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], item_name: opt.label, unit: opt.unit || ls[i].unit, item_id: opt.item_id || null, item_type: opt.item_type || null, deviation_reason: "" }; return { ...n, lines: ls }; });   // update372
    getRateSuggestions([opt.label]).then(m => setRateSug(s => ({ ...s, ...m }))).catch(() => {});   // update299
    setSug(null);
  }
  async function addToMaster(i) {
    const line = ni.lines[i];
    const r = await quickAddItem(sug?.q || line.item_name, line.unit);
    if (!r.ok) { setErr(r.error); return; }
    pickSug(i, { label: r.item.display_name, unit: r.item.unit, item_id: r.item.id });
    setMsg(`"${r.item.display_name}" added to Item Master.`);
  }
  async function submitNewIndent() {
    if (submitting.current) return;   // update368
    setErr("");
    if (!ni.site_id) { setErr("Pick a site."); return; }
    const lines = ni.lines.filter(l => l.item_name.trim() && Number(l.qty) > 0);
    if (!lines.length) { setErr("Add at least one item with a quantity."); return; }
    // update372: the BOQ check. A line that is off-BOQ (strict category) or over the BOQ
    // quantity may still be raised — WITH a reason, and it goes to the Director as a
    // deviation. Without a reason it does not leave this form.
    let allowance = null;
    try { allowance = await getSiteAllowance(Number(ni.site_id)); } catch { allowance = null; }
    const flagged = lines.map(l => ({ l, dev: allowance ? checkLine(allowance, { item_id: l.item_id, item_type: l.item_type, qty: l.qty }) : null })).filter(x => x.dev);
    const needReason = flagged.filter(x => !String(x.l.deviation_reason || "").trim());
    if (needReason.length) {
      setDevs(Object.fromEntries(flagged.map(x => [x.l.item_name, x.dev])));
      setErr(`${needReason.length} line(s) are outside this site's BOQ. Give a reason for each — it goes to the Director for approval before a PO can be issued.`);
      return;
    }
    submitting.current = true; setBusy(true);
    const header = { site_id: Number(ni.site_id), raised_by: session?.id || null, required_by: ni.required_by || null,
      urgency: ni.urgency, note: ni.note || null };
    const outLines = lines.map(l => ({ item_id: l.item_id || null, item_name: l.item_name.trim(), qty: Number(l.qty), unit: l.unit, spec: (l.spec || "").trim() || null, item_type: l.item_type || null, deviation_reason: (l.deviation_reason || "").trim() || null }));   // update372
    let res = editingId ? await editIndent(editingId, header, outLines) : await createIndent(header, outLines);
    if (!res.ok && res.duplicate && window.confirm(res.error + "\n\nRaise it anyway as a separate indent?")) res = await createIndent({ ...header, allow_duplicate: true }, outLines);
    submitting.current = false; setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    // update400: `ind` was never defined here — clearDraft(ind.id) threw AFTER the save succeeded,
    // so the form never closed, no message showed and the list did not refresh (Edit → Save too).
    if (editingId) clearDraft(editingId);   // update299 mirror only exists for an indent being edited
    setNi(null); setDevs({}); setErr("");
    setMsg(editingId ? "Indent " + editingNo + " updated — quotes were cleared, status back to open." : "Indent " + res.indent_no + " raised.");
    setEditingId(null); setEditingNo("");
    getOpenIndents(scope).then(setIndents);
    try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
  }
  const [masterVendors, setMasterVendors] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editingNo, setEditingNo] = useState("");
  const CAN_DELETE_ROLES = ["director", "it_executive", "accountant"];
  function startWebEdit(ind) {
    // update337: only lines with no live PO are editable. They were being loaded into the
    // form before, so you could retype a PO'd quantity and the server would silently drop it.
    const editable = (ind.items || []).filter(it => !it.ordered);
    const locked = (ind.items || []).length - editable.length;
    setNi({ site_id: String(ind.site_id || ""), required_by: ind.required_by || "", urgency: ind.urgency || "normal",
      note: ind.note || "", lines: editable.map(it => ({ item_id: it.item_id || null, item_name: it.item_name,
        qty: String(it.qty), unit: it.unit || "", spec: it.spec || "" })) });
    setEditingId(ind.id); setEditingNo(ind.indent_no); setErr("");
    setMsg(locked ? locked + " item(s) on this indent are already under a PO and cannot be changed — they stay exactly as they are." : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  // update434: delete ONE item (blocked when a live PO covers it); emptied indent → close or leave
  async function delItem(ind, it) {
    const reason = window.prompt(`Delete "${it.item_name}" (${it.qty} ${it.unit}) from ${ind.indent_no}?\n\nReason (required — this is logged with your name):`);
    if (reason == null) return; if (!reason.trim()) { window.alert("A reason is required."); return; }
    const r = await deleteIndentItem(it.id, reason.trim());
    if (!r.ok) { window.alert(r.error); return; }
    if (r.remaining === 0) {
      if (window.confirm(`${ind.indent_no} now has no items left.\n\nOK = close (cancel) the indent\nCancel = leave it open and empty`)) { const x = await closeEmptyIndent(ind.id, "all items deleted"); if (!x.ok) window.alert(x.error); }
    }
    setMsg(`Item deleted from ${ind.indent_no} (logged).`); load();
  }
  async function delIndent(ind) {
    if (!window.confirm("Delete " + ind.indent_no + " permanently? This cannot be undone.")) return;
    const res = await deleteIndent(ind.id);
    if (!res.ok) {
      setErr(res.error);
      window.alert("Could not delete " + ind.indent_no + ":\n\n" + res.error +
        (/(function|fn_delete_indent|schema cache|does not exist)/i.test(res.error || "")
          ? "\n\nThis usually means the update148 SQL (pipeskool_indent_delete.sql) has not been run in Supabase yet."
          : /po_items_indent_item_id_fkey|foreign key/i.test(res.error || "")
          ? "\n\nCancelled PO lines still point at this indent — run pipeskool_indent_delete_fix.sql (update 187) once and retry."
          : ""));
      return;
    }
    setMsg("Indent " + ind.indent_no + " deleted.");
    getOpenIndents(scope).then(setIndents);
  }

  const load = () => { getOpenIndents(scope).then(setIndents); getPOs(scope).then(list => { setPos(list); setPosReady(true); getPoDcPending((list || []).map(p => p.id)).then(setDcPend).catch(() => {}); }); };
  useEffect(() => { setSession(getSession()); load(); getVendors(false).then(setMasterVendors); }, []);

  async function saveDelivery() {
    setBusy(true);
    const res = await updatePODelivery(deliv.id, { expected_delivery: deliv.expected_delivery, delivery_status: deliv.delivery_status, delivery_note: deliv.delivery_note });
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    // update439: `ind` is not in scope here (delivery edit has no indent draft) — removed; it threw after a successful save
    setDeliv(null); setMsg("Delivery updated for " + deliv.po_no + " — site can see it now."); getPOs(scope).then(list => { setPos(list); setPosReady(true); });
  }

  async function openIndent(ind) {
    const willOpen = openId !== ind.id;
    setOpenId(willOpen ? ind.id : null);
    setCmp(null); setRates({}); setAwardVendor(""); setReason(""); setMsg(""); setErr(""); setSplitMode(false); setItemVendor({}); setItemSplits({});
    setEnqVendors([]); setVendorPick(""); setAlloc({}); setQin({}); setProofs([]);
    const sel = {}; ind.items.forEach(it => sel[it.id] = true); setEnqSel(sel);
    if (willOpen) {
      getQuoteProofs(ind.id).then(setProofs);   // update253: rate evidence, loaded alongside
      const quotes = await getQuotes(ind.id);
      getRateSuggestions((ind.items || []).map(it => it.item_name)).then(setRateSug).catch(() => {});   // update299
      getItemPriceMap(ind.items || []).then(setPriceMap).catch(() => setPriceMap({}));   // update303
      if (!quotes.length) {   // update299: nothing saved yet — restore any typed draft from this device
        const d0 = readDraft(ind.id);
        if (d0 && d0.qin) { setQin(d0.qin); setAlloc(d0.alloc || {}); if (Array.isArray(d0.vendors)) setEnqVendors(v => [...new Set([...v, ...d0.vendors])]); }
      }
      if (quotes.length) {
        const vs = [], al = {}, qi = {};
        quotes.forEach(q => {
          if (!vs.includes(q.vendor_name)) vs.push(q.vendor_name);
          (al[q.indent_item_id] = al[q.indent_item_id] || {})[q.vendor_name] = true;
          const list = q.list_rate != null ? q.list_rate : (q.rate != null ? q.rate : "");
          const disc = q.discount_pct != null ? q.discount_pct : "";
          (qi[q.indent_item_id] = qi[q.indent_item_id] || {})[q.vendor_name] = { list: String(list), disc: String(disc) };
        });
        setEnqVendors(vs); setAlloc(al); setQin(qi);
        const d = readDraft(ind.id);   // update299: unsaved typing from this device wins over the last save
        if (d && d.qin) { setQin(q => ({ ...q, ...d.qin })); if (d.alloc) setAlloc(a2 => ({ ...a2, ...d.alloc })); if (Array.isArray(d.vendors) && d.vendors.length) setEnqVendors(v => [...new Set([...v, ...d.vendors])]); }
      }
    }
  }

  // update253: attach / remove a rate proof. Optional throughout — a rate with no proof
  // saves and behaves exactly as before.
  // update254: ONE proof set for the whole rate comparison, attached after the rates are in.
  // Not per item and not per vendor — a quotation is normally one document anyway.
  async function attachProof(indentId, files) {
    const list = Array.from(files || []);
    if (!list.length) { setProofErr("No file was selected."); return; }   // update266: never silent
    setUpBusy("q"); setErr(""); setProofErr("");
    let added = [], failed = "";
    try {
      for (const f of list) {
        const r = await uploadQuoteProof({ indentId, file: f }, session?.id);
        if (r.ok) added.push(r.proof); else failed = r.error;
      }
    } catch (e) { failed = e.message || "Upload failed."; }
    finally { setUpBusy(""); }
    if (added.length) setProofs(prev => [...prev, ...added]);
    if (failed) { setProofErr(failed); setErr(failed); }   // update266: inline next to the button AND page banner
    else if (added.length) setMsg(added.length + " rate-comparison proof(s) attached.");
  }

  async function removeProof(proof) {
    if (!window.confirm("Remove this rate-comparison proof?")) return;
    const r = await deleteQuoteProof(proof.id, proof.path);
    if (!r.ok) { setErr(r.error); return; }
    setProofs(prev => prev.filter(x => x.id !== proof.id));
  }

  function addVendor() {
    const v = vendorPick.trim();
    if (!v || enqVendors.includes(v)) { setVendorPick(""); return; }
    setEnqVendors(vs => [...vs, v]); setVendorPick("");
  }
  function removeVendor(v) {
    setEnqVendors(vs => vs.filter(x => x !== v));
    const strip = obj => { const n = { ...obj }; Object.keys(n).forEach(k => { if (n[k]) { const m = { ...n[k] }; delete m[v]; n[k] = m; } }); return n; };
    setAlloc(strip); setQin(strip);
  }
  // update408: vendor-specific history — when a vendor is enlisted, this vendor's LAST rate for each
  // item (any past PO) fills the empty boxes first; the price-list fallback below covers the rest.
  const [vendHint, setVendHint] = useState({});   // `${itemId}|${vendor}` -> { rate, discount_pct, list_rate, po_no, po_date }
  useEffect(() => {
    if (!openId || !enqVendors.length) return;
    const ind = (indents || []).find(x => x.id === openId); if (!ind) return;
    let alive = true;
    (async () => {
      const found = {};
      for (const v of enqVendors) for (const it of (ind.items || [])) {
        const key = `${it.id}|${v}`; if (vendHint[key] !== undefined) { found[key] = vendHint[key]; continue; }
        found[key] = await lastRateForVendor(v, it.item_id, it.item_name);
      }
      if (!alive) return;
      setVendHint(found);
      setQin(q => {
        let changed = false; const n = { ...q };
        (ind.items || []).forEach(it => enqVendors.forEach(v => {
          const h = found[`${it.id}|${v}`]; if (!h) return;
          const cur = n[it.id]?.[v] || {};
          if ((cur.list == null || cur.list === "") && (cur.disc == null || cur.disc === "") && (cur.rate == null || cur.rate === "")) {
            n[it.id] = { ...(n[it.id] || {}), [v]: { ...cur, list: h.list_rate != null ? String(h.list_rate) : String(h.rate), disc: h.list_rate != null && h.discount_pct != null ? String(h.discount_pct) : "0" } };
            changed = true;
          }
        }));
        if (changed && openId) saveDraft(openId, { qin: n, alloc, vendors: enqVendors, t: Date.now() });
        return changed ? n : q;
      });
    })();
    return () => { alive = false; };
  }, [enqVendors, openId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const vendHintLine = (itemId, v) => { const h = vendHint[`${itemId}|${v}`]; return h ? `Last bought from ${v}: ${inr(h.rate)}${h.discount_pct ? `, ${h.discount_pct}% disc` : ""} — ${h.po_no} · ${String(h.po_date).split("-").reverse().join("/")}` : null; };

  // update303: the ask — rates appear AUTOMATICALLY. Only EMPTY inputs are filled (typed
  // values and restored drafts are never overwritten); revoking is one keystroke.
  useEffect(() => {
    if (!openId || !enqVendors.length || !Object.keys(priceMap).length) return;
    const ind = (indents || []).find(x => x.id === openId);
    if (!ind) return;
    setQin(q => {
      let changed = false;
      const n = { ...q };
      (ind.items || []).forEach(it => {
        const pr = priceFor(it);
        if (!pr) return;
        enqVendors.forEach(v => {
          const cur = n[it.id]?.[v] || {};
          if ((cur.list == null || cur.list === "") && (cur.disc == null || cur.disc === "")) {
            n[it.id] = { ...(n[it.id] || {}), [v]: { ...cur, list: String(pr.list), disc: String(pr.disc) } };
            changed = true;
          }
        });
      });
      if (changed && openId) saveDraft(openId, { qin: n, alloc, vendors: enqVendors, t: Date.now() });
      return changed ? n : q;
    });
  }, [priceMap, enqVendors, openId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAlloc = (itemId, v) => setAlloc(a => { const n = { ...a, [itemId]: { ...(a[itemId] || {}), [v]: !a[itemId]?.[v] } }; if (openId) saveDraft(openId, { qin, alloc: n, vendors: enqVendors, t: Date.now() }); return n; });   // update299
  const setQ = (itemId, v, k, val) => setQin(q => { const n = { ...q, [itemId]: { ...(q[itemId] || {}), [v]: { ...(q[itemId]?.[v] || {}), [k]: val } } }; if (openId) saveDraft(openId, { qin: n, alloc, vendors: enqVendors, t: Date.now() }); return n; });
  const netOf = (itemId, v) => {
    const c = qin[itemId]?.[v]; if (!c) return null;
    const list = Number(c.list); if (!list) return null;
    const disc = Number(c.disc) || 0;
    return +(list * (1 - disc / 100)).toFixed(2);
  };

  // ---- enquiry download (#6) ----
  const toggleEnqItem = id => setEnqSel(s => ({ ...s, [id]: !s[id] }));
  const toggleEnqCat = (list, on) => setEnqSel(s => { const n = { ...s }; list.forEach(it => n[it.id] = on); return n; });

  function downloadEnquiryPDF(ind) {
    const chosen = ind.items.filter(it => enqSel[it.id]);
    if (!chosen.length) { setErr("Tick at least one item to download."); return; }
    setErr("");
    const cats = Array.from(new Set(chosen.map(it => it.category)));
    const title = "Enquiry — " + cats.join(" & ");
    const url = `/purchase/enquiry?indent=${ind.id}&items=${chosen.map(it => it.id).join(",")}&title=${encodeURIComponent(title)}&vendors=${enqVendors.map(encodeURIComponent).join("|")}`;   // update440: builder (pending-only, vendor groups, WhatsApp/Email)
    window.open(url, "_blank");
  }

  async function downloadEnquiryExcel(ind) {
    const chosen = ind.items.filter(it => enqSel[it.id]);
    if (!chosen.length) { setErr("Tick at least one item to download."); return; }
    setErr("");
    const XLSX = await import("xlsx");
    const cats = Array.from(new Set(chosen.map(it => it.category)));
    const head = [
      ["Pipeskool Projects Pvt. Ltd. — Material Enquiry"],
      ["Project", ind.site || ""], ["Indent ref", ind.indent_no], ["Required by", ind.required_by || ""], [],
      ["#", "Category", "Description", "Qty", "Unit", "List Rate", "Disc %", "Net Rate"],
    ];
    const rows = chosen.map((it, i) => [i + 1, it.category, it.item_name + (it.spec ? " — " + it.spec : ""), Number(it.qty), it.unit, "", "", ""]);
    const ws = XLSX.utils.aoa_to_sheet([...head, ...rows]);
    ws["!cols"] = [{ wch: 4 }, { wch: 14 }, { wch: 46 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Enquiry");
    XLSX.writeFile(wb, `Enquiry_${ind.indent_no.replace(/\//g, "-")}_${cats.join("-")}.xlsx`);
  }

  // derived NET-rate map → feeds the existing compare/award engine
  useEffect(() => {
    const r = {};
    Object.keys(alloc).forEach(itemId => Object.keys(alloc[itemId] || {}).forEach(v => {
      if (!alloc[itemId][v]) return;
      const c = qin[itemId]?.[v]; if (!c) return;
      const list = Number(c.list); if (!list) return;
      const disc = Number(c.disc) || 0;
      (r[itemId] = r[itemId] || {})[v] = +(list * (1 - disc / 100)).toFixed(2);
    }));
    setRates(r);
  }, [qin, alloc]);

  function buildQuotes(ind) {
    const vendors = enqVendors;
    const quotes = [];
    ind.items.forEach(it => vendors.forEach(v => {
      if (!alloc[it.id]?.[v]) return;
      const net = netOf(it.id, v);
      if (net != null) quotes.push({ indent_item_id: it.id, vendor_name: v, rate: net });
    }));
    return { vendors, quotes };
  }
  function compare(ind) {
    const { vendors, quotes } = buildQuotes(ind);
    if (vendors.length === 0) { setErr("Add at least one vendor."); return; }
    if (quotes.length === 0) { setErr("Enter at least one rate (list price)."); return; }
    setErr("");
    const c = buildComparison(ind.items, quotes);
    setCmp(c);
    const iv = {}; Object.entries(c.splitChoice).forEach(([itemId, ch]) => iv[itemId] = ch.vendor);
    setItemVendor(iv);
  }
  async function persistQuotes(ind) {
    const rows = [];
    ind.items.forEach(it => enqVendors.forEach(v => {
      if (!alloc[it.id]?.[v]) return;
      const c = qin[it.id]?.[v] || {};
      rows.push({ indent_item_id: it.id, vendor_name: v, list_rate: c.list || null, discount_pct: c.disc || null, rate: netOf(it.id, v) });
    }));
    const res = await saveQuotes(ind.id, rows);
    if (res.ok) clearDraft(ind.id);   // update299: saved to DB — the device mirror has done its job
    setMsg(res.ok ? "Allocation & rates saved for " + ind.indent_no : res.error);
    if (res.ok) load();
  }
  async function award(ind) {
    setErr("");
    if (!awardVendor) { setErr("Choose a vendor to award the PO."); return; }
    const isLowest = cmp?.bestWhole?.vendor === awardVendor;
    if (!isLowest && !reason.trim()) { setErr("This vendor is not the lowest total — please enter the reason."); return; }
    const openItems = ind.items.filter(it => !it.ordered);   // update170: PO'd items are locked
    if (openItems.length === 0) { setErr("Every item on this indent already has a PO."); return; }
    const lines = openItems.map(it => ({ indent_item_id: it.id, item_id: it.item_id, item_name: it.item_name,
      spec: it.spec || null, qty: it.qty, unit: it.unit, rate: Number(rates[it.id]?.[awardVendor] || 0),
      list_rate: Number(qin[it.id]?.[awardVendor]?.list) || null, discount_pct: Number(qin[it.id]?.[awardVendor]?.disc) || 0,
      gst_pct: Number(gstSel[it.id] ?? 18) }));
    if (lines.some(l => !l.rate)) { setErr("This vendor hasn't quoted every item."); return; }
    setBusy(true);
    const res = await createPO({ indent_id: ind.id, site_id: ind.site_id || 1, vendor_name: awardVendor,
      is_lowest: isLowest, non_lowest_reason: isLowest ? null : reason, lines }, session?.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setMsg("PO " + res.po_no + " issued to " + awardVendor + (isLowest ? " (lowest)" : " — reason recorded")
      + ((res.remaining ?? 0) > 0 ? " — " + res.remaining + " item(s) still open for later POs." : "")); setOpenId(null); load();
  }

  async function awardSplit(ind) {
    setErr("");
    const byVendor = {};
    let leftOpen = 0;   // update170: items without a vendor stay open for later POs
    for (const it of ind.items) {
      if (it.ordered) continue;                      // already locked under a PO
      const splits = itemSplits[it.id];
      if (splits && splits.length) {
        // quantity-split across vendors for this item
        const totalSplit = splits.reduce((s, r) => s + Number(r.qty || 0), 0);
        if (totalSplit !== Number(it.qty)) {
          setErr(`${it.item_name}: split quantities (${totalSplit}) must add up to required ${it.qty} ${it.unit}.`); return;
        }
        for (const row of splits) {
          if (!row.vendor) { setErr(`Choose a vendor for every split row of ${it.item_name}.`); return; }
          if (!Number(row.qty)) { setErr(`Enter quantity for every split row of ${it.item_name}.`); return; }
          if (!rates[it.id]?.[row.vendor]) { setErr(`No rate from ${row.vendor} for ${it.item_name}.`); return; }
          (byVendor[row.vendor] = byVendor[row.vendor] || []).push({ indent_item_id: it.id, item_id: it.item_id,
            item_name: it.item_name, spec: it.spec || null, qty: Number(row.qty), unit: it.unit, rate: Number(rates[it.id][row.vendor]),
            list_rate: Number(qin[it.id]?.[row.vendor]?.list) || null, discount_pct: Number(qin[it.id]?.[row.vendor]?.disc) || 0,
            gst_pct: Number(gstSel[it.id] ?? 18) });
        }
      } else {
        // whole item to one vendor — no vendor chosen = left open for a later PO (update170)
        const v = itemVendor[it.id];
        if (!v) { leftOpen += 1; continue; }
        if (!rates[it.id]?.[v]) { setErr(`No rate from ${v} for ${it.item_name}.`); return; }
        (byVendor[v] = byVendor[v] || []).push({ indent_item_id: it.id, item_id: it.item_id,
          item_name: it.item_name, spec: it.spec || null, qty: Number(it.qty), unit: it.unit, rate: Number(rates[it.id][v]),
          list_rate: Number(qin[it.id]?.[v]?.list) || null, discount_pct: Number(qin[it.id]?.[v]?.disc) || 0,
          gst_pct: Number(gstSel[it.id] ?? 18) });
      }
    }
    if (Object.keys(byVendor).length === 0) { setErr("Pick a vendor for at least one open item."); return; }
    setBusy(true);
    const issued = [];
    let lastRes = null;
    for (const [vendor, lines] of Object.entries(byVendor)) {
      const res = await createPO({ indent_id: ind.id, site_id: ind.site_id || 1, vendor_name: vendor,
        is_lowest: true, split_note: "Split award — cheapest per item", lines }, session?.id);
      if (!res.ok) { setBusy(false); setErr(res.error); return; }
      issued.push(res.po_no); lastRes = res;
    }
    setBusy(false);
    const rem = lastRes?.remaining ?? 0;
    setMsg(issued.length + " PO" + (issued.length > 1 ? "s" : "") + " issued: " + issued.join(", ")
      + (rem > 0 ? " — " + rem + " item" + (rem > 1 ? "s" : "") + " still open on this indent for later POs." : " — indent fully ordered."));
    setOpenId(null); load();
  }

  const open = (indents || []).filter(i => i.status === "open" || i.status === "quoting");
  const isITExecutive = String(session?.role || "").toLowerCase().replace(/[^a-z]/g, "") === "itexecutive";
  const livePOs = pos.filter(p => p.status !== "cancelled");
  const poDeliveryMix = [
    ["Awaiting", livePOs.filter(p => ["pending", "confirmed"].includes(p.delivery_status || "pending")).length, "pending"],
    ["In transit / partial", livePOs.filter(p => ["dispatched", "partial", "delayed"].includes(p.delivery_status)).length, "transit"],
    ["Delivered", livePOs.filter(p => p.delivery_status === "delivered" || p.status === "delivered").length, "delivered"],
  ];
  const poDeliveryTotal = poDeliveryMix.reduce((n, x) => n + x[1], 0);
  const poDeliveryParts = poDeliveryTotal ? poDeliveryMix.map(x => x[1] * 100 / poDeliveryTotal) : [0, 0, 0];
  const poDeliveryGradient = `conic-gradient(#f5a623 0 ${poDeliveryParts[0]}%, #4aa3ff ${poDeliveryParts[0]}% ${poDeliveryParts[0] + poDeliveryParts[1]}%, #20b26b ${poDeliveryParts[0] + poDeliveryParts[1]}% 100%)`;
  // update195: pagination — 10 per page, Prev/Next + page numbers
  const [indPage, setIndPage] = useState(1);
  const [poPage, setPoPage] = useState(1);
  const PAGE = 10;
  const pager = (page, setPage, total) => { const n = Math.max(Math.ceil(total / PAGE), 1); if (page > n) setPage(n); return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", margin: "8px 0" }}>
      <span className="muted" style={{ fontSize: 12, marginRight: "auto" }}>Showing {(Math.min(page, n) - 1) * PAGE + (total ? 1 : 0)}–{Math.min(Math.min(page, n) * PAGE, total)} of {total}</span>
      <button style={{ fontSize: 12 }} disabled={page <= 1} onClick={() => setPage(p2 => p2 - 1)}>‹ Prev</button>
      {Array.from({ length: n }, (_, i) => i + 1).filter(i => i === 1 || i === n || Math.abs(i - page) <= 2).map((i, idx, arr) => (
        <span key={i}>{idx > 0 && arr[idx - 1] !== i - 1 && <span className="muted">…</span>}
          <button style={{ fontSize: 12, fontWeight: i === Math.min(page, n) ? 800 : 400, background: i === Math.min(page, n) ? "var(--copper)" : undefined, color: i === Math.min(page, n) ? "#fff" : undefined }} onClick={() => setPage(i)}>{i}</button></span>
      ))}
      <button style={{ fontSize: 12 }} disabled={page >= n} onClick={() => setPage(p2 => p2 + 1)}>Next ›</button>
    </div>); };
  const openPage = open.slice((indPage - 1) * PAGE, indPage * PAGE);
  async function doCancel(p) { if (!confirm("Cancel PO " + p.po_no + "?")) return; await cancelPO(p.id); load(); }

  return (
    <>
      {showHead && <div className="page-head"><h1>Procurement — indents &amp; POs</h1></div>}
        {err && <div className="demo-banner" style={{ background: "#fdecea", color: "var(--red)" }}>⚠ {err}</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}
        {isDemo && <div className="demo-banner">Demo mode — sample data.</div>}
        {msg && <div className="demo-banner" style={{ background: "var(--green-bg)", color: "var(--green)" }}>{msg}</div>}

        {isITExecutive && <section className="it-procure-overview" aria-label="Live procurement overview">
          <div className="it-procure-kpis">
            <div><span>Open requests</span><strong>{indents === null ? "—" : open.length}</strong><small>Orders awaiting procurement</small></div>
            <div><span>Live purchase orders</span><strong>{posReady ? livePOs.length : "—"}</strong><small>Cancelled POs excluded</small></div>
            <div><span>Pending deliveries</span><strong>{posReady ? livePOs.filter(p => p.delivery_status !== "delivered" && p.status !== "delivered").length : "—"}</strong><small>Live POs not marked delivered</small></div>
          </div>
          <div className="it-procure-delivery">
            <div><h2>PO delivery status</h2><p>Distribution from live purchase orders.</p></div>
            {poDeliveryTotal ? <div className="it-procure-donut" style={{ "--po-delivery-chart": poDeliveryGradient }}><span>{poDeliveryTotal}<small>orders</small></span></div> : <div className="it-procure-empty">{posReady ? "No purchase orders in this view yet." : "Loading purchase orders…"}</div>}
            <div className="it-procure-legend">{poDeliveryMix.map(([label, count, tone]) => <span key={tone}><i className={tone} />{label}<b>{count}</b></span>)}</div>
          </div>
        </section>}

        {showInd && <div className="it-procure-section" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>{/* update407 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><span className="muted">📋</span>Open material requests<span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{open.length}</span></div>
            <div style={{ display: "flex", gap: 8 }}><button type="button" onClick={() => { setAllInd([]); getAllIndents().then(setAllInd); }}>🗂 All orders</button><button type="button" className="primary" onClick={() => window.location.assign("/order")}>🛒 Order materials</button></div>{/* update473: new orders only from the catalogue */}
          </div>
          {ni && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 14, margin: "10px 0", background: "#FAFBFC" }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{editingId ? "Edit order " + (editingNo || "") : "Material order"}</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
                <div><label className="muted">Site *</label><br />
                  <select value={ni.site_id} onChange={e => setNi(n => ({ ...n, site_id: e.target.value }))}>
                    <option value="">— pick —</option>
                    {sites.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select></div>
                <div><label className="muted">Need by</label><br />
                  <input type="date" value={ni.required_by} onChange={e => setNi(n => ({ ...n, required_by: e.target.value }))} /></div>
                <label style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer", paddingBottom: 6 }}>
                  <input type="checkbox" checked={ni.urgency === "urgent"} onChange={e => setNi(n => ({ ...n, urgency: e.target.checked ? "urgent" : "normal" }))} style={{ accentColor: "var(--copper)" }} /> URGENT
                </label>
                <input style={{ flex: 1, minWidth: 180 }} placeholder="Note (optional)" value={ni.note} onChange={e => setNi(n => ({ ...n, note: e.target.value }))} />
              </div>
              <style>{`
                /* update270: phone layout for the indent line rows — desktop untouched */
                @media (max-width: 700px) {
                  .ind-line { flex-wrap: wrap; }
                  .ind-line .ind-name { flex: 1 1 100% !important; }
                  .ind-line .ind-qty, .ind-line .ind-unit { flex: 1 1 72px !important; width: auto !important; min-width: 0; }
                  .ind-line .ind-spec { flex: 2 1 130px !important; width: auto !important; min-width: 0; }
                }
              `}</style>
              {ni.lines.map((l, i) => (
                <div key={i}>{/* update372: row + its reason box */}
                <div className="ind-line" style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                  <div className="ind-name" style={{ flex: 2, position: "relative" }}>
                    <input style={{ width: "100%" }} placeholder="Item / material name * (type 2+ letters to search)" value={l.item_name}
                           onChange={e => onItemType(i, e.target.value)} />
                    {sugLine(l.item_name) && <div style={{ fontSize: 10.5, color: "#0e7a3d", marginTop: 2 }}>💡 {sugLine(l.item_name)}</div>}{/* update299: last price + vendor */}
                    {sug && sug.i === i && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 40, background: "#fff",
                                    border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,.12)", maxHeight: 220, overflowY: "auto" }}>
                        {sug.list.map((o, j) => (
                          <div key={j} onClick={() => pickSug(i, o)}
                               style={{ padding: "7px 10px", cursor: "pointer", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
                            <span>{o.label}{o.boq && <span title={"In this site's BOQ — " + o.boqRefs} style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: "#166534", background: "#ecfdf5", border: "1px solid #86efac", borderRadius: 999, padding: "1px 6px" }}>✓ BOQ {o.boqRefs}</span>}</span>
                            <span className="muted" style={{ fontSize: 11 }}>
                              {o.kind === "boq" ? "BOQ" : "Item"}{o.unit ? " · " + o.unit : ""}
                              {o.boq && o.remaining != null && <span style={{ marginLeft: 6, color: o.remaining > 0 ? "#166534" : "var(--red)" }}>{o.remaining} left</span>}
                            </span>
                          </div>
                        ))}
                        {sug.list.length === 0 && <div className="muted" style={{ padding: "7px 10px", fontSize: 12.5 }}>No match in Item or BOQ master.</div>}
                        {canAddMaster && (
                          <div onClick={() => addToMaster(i)}
                               style={{ padding: "7px 10px", cursor: "pointer", fontSize: 12.5, color: "var(--copper)", fontWeight: 700, borderTop: "1px solid var(--border)" }}>
                            ＋ Add "{sug.q}" to Item Master
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <input className="ind-qty" style={{ width: 90 }} inputMode="numeric" placeholder="Qty *" value={l.qty}
                         onChange={e => setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], qty: e.target.value }; return { ...n, lines: ls }; })} />
                  <input className="ind-unit" style={{ width: 90 }} placeholder="Unit" value={l.unit}
                         onChange={e => setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], unit: e.target.value }; return { ...n, lines: ls }; })} />
                  <input className="ind-spec" style={{ width: 220 }} placeholder="Specification (e.g. ASTM A106 Gr B, Sch 40, ISI)" value={l.spec || ""}
                         onChange={e => setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], spec: e.target.value }; return { ...n, lines: ls }; })} />
                  {ni.lines.length > 1 && <button onClick={() => setNi(n => ({ ...n, lines: n.lines.filter((_, j) => j !== i) }))}>✕</button>}
                </div>
                {/* update372: a line outside the site's BOQ gets a reason box right under it.
                    The indent will not submit until every flagged line has one. */}
                {devs[l.item_name] && (
                  <div style={{ margin: "-4px 0 8px 0", padding: "8px 10px", background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#9a3412" }}>⚠ {devs[l.item_name].kind === "off_boq" ? "Not in this site's BOQ" : "Over the BOQ quantity"} — {devs[l.item_name].message}</div>
                    <input style={{ width: "100%", marginTop: 6 }} placeholder="Why is this needed? (goes to the Director for approval)"
                           value={l.deviation_reason || ""}
                           onChange={e => setNi(n => { const ls = [...n.lines]; ls[i] = { ...ls[i], deviation_reason: e.target.value }; return { ...n, lines: ls }; })} />
                  </div>
                )}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={() => setNi(n => ({ ...n, lines: [...n.lines, blankLine()] }))}>＋ Add item</button>
                <button className="primary" disabled={busy} onClick={submitNewIndent}>{busy ? "⏳ Saving…" : "Save changes"}</button>
                <button onClick={() => setNi(null)}>Cancel</button>
              </div>
            </div>
          )}
          {!indents ? <div className="muted">Loading…</div> : open.length === 0 ? <span className="muted">No open orders. Site staff place them from Order Materials (catalogue).</span> : (
            <>
            {pager(indPage, setIndPage, open.length)}
            {openPage.map(ind => (
              <div key={ind.id} style={{ borderTop: "1px solid var(--border)" }}>
                <div onClick={() => openIndent(ind)} style={{ padding: "12px 0", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{ind.indent_no}</span>
                      {ind.urgency === "urgent" && <span style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: 10.5, padding: "2px 7px", borderRadius: 999 }}>Urgent</span>}
                      {ind.edited_at && <span style={{ background: "#E8F0FE", color: "#1D4ED8", fontSize: 10.5, padding: "2px 7px", borderRadius: 999 }}>Edited by site</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ind.site} · {ind.item_count} items · by {ind.raised_by || "—"} · {ind.date}{ind.required_by ? " · need by " + ind.required_by : ""}</div>
                  </div>
                  <span style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
                    {(ind.status === "open" || ind.status === "quoting") && (session?.id === ind.raised_by_id || canEditAnyIndent) && (
                      <button type="button" style={{ width: 30, height: 30, padding: 0 }} onClick={e => { e.stopPropagation(); startWebEdit(ind); }}
                              title={session?.id === ind.raised_by_id ? "Edit your indent" : "Editing under the Indent Edit right — the change is logged"}>✎</button>)}
                    {canEditAnyIndent && ind.edited_at && (
                      <button type="button" style={{ width: 30, height: 30, padding: 0 }} title="Who changed this indent, and what"
                              onClick={async e => { e.stopPropagation(); try { setEditLog(await getIndentEditAudit(ind.id)); } catch (x) { setErr(x.message); } }}>🕘</button>)}
                    {CAN_DELETE_ROLES.includes(session?.role) && (() => { const live = (ind.pos || []).filter(p => p.status !== "cancelled"); return (
                      <span title={live.length ? "Locked — PO already raised: " + live.map(p => p.po_no).join(", ") + ". Cancel the PO(s) first." : "Delete this indent"}>
                        <button type="button" style={{ width: 30, height: 30, padding: 0, color: live.length ? "var(--muted)" : "var(--red)" }} disabled={live.length > 0}
                          onClick={e => { e.stopPropagation(); delIndent(ind); }}>{live.length ? "🔒" : "🗑"}</button>
                      </span>); })()}
                    <span style={{ background: ind.status === "quoting" ? "#EDE9FE" : ind.status === "open" ? "#DCFCE7" : "#F3F4F6", color: ind.status === "quoting" ? "#6D28D9" : ind.status === "open" ? "#15803D" : "#6B7280", fontSize: 11, padding: "5px 10px", borderRadius: 999, textTransform: "capitalize" }}>{ind.status}</span>
                    {(() => { const n = (ind.items || []).length, k = (ind.items || []).filter(x => x.ordered).length; return n && k && k < n ? <span className="muted" style={{ fontSize: 11, marginLeft: 6 }} title="Items covered by a PO / total items">🔒 {k}/{n} under PO</span> : null; })()}
                  </span>
                </div>
                {openId === ind.id && (
                  <div style={{ padding: "0 12px 14px" }}>
                    <div className="muted" style={{ margin: "4px 0 8px" }}><b>1.</b> Review what's required, <b>2.</b> add the vendors you'll ask, <b>3.</b> tick which items each one should quote, <b>4.</b> enter list rate + discount % (net is auto-calculated), then compare & award.</div>

                    {/* requirement — always visible */}
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Requirement — {ind.items.length} item{ind.items.length !== 1 ? "s" : ""}{ind.required_by ? " · need by " + ind.required_by : ""}</div>
                      <table className="dt-compact req-tbl" style={{ width: "100%" }}>{/* update283: stacks on phones */}
                        <thead><tr><th>#</th><th>Item</th><th className="num">Qty</th><th>Purpose</th></tr></thead>
                        <tbody>
                          {ind.items.map((it, idx) => (
                            <tr key={it.id}>
                              <td className="muted">{idx + 1}</td>
                              <td style={{ fontWeight: 600, opacity: it.ordered ? 0.55 : 1 }}>{it.item_name}{it.spec ? <span className="muted" style={{ fontWeight: 400 }}> — {it.spec}</span> : ""}{it.ordered ? <a className="badge p" href={`/procure?po=${encodeURIComponent(it.po_no || "")}`} onClick={e => e.stopPropagation()} title="Open the PO" style={{ marginLeft: 6, fontSize: 10.5, textDecoration: "none" }}>🔒 PO issued{it.po_no ? " · " + it.po_no : ""}</a> : <span className="badge gray" style={{ marginLeft: 6, fontSize: 10.5 }}>pending</span>}
                                {!it.ordered && (ind.status === "open" || ind.status === "quoting") && (session?.role === "director" || session?.role === "it_executive" || session?.role === "accountant" || ind.raised_by_id === session?.id) && (
                                  <button type="button" title="Delete this item (needs a reason; logged)" onClick={e => { e.stopPropagation(); delItem(ind, it); }} style={{ marginLeft: 6, fontSize: 11, padding: "0 6px", color: "var(--red,#c0392b)" }}>🗑</button>)}
                                {it.ordered && <span className="muted" title={`Can't delete — already covered by ${it.po_no || "a PO"}`} style={{ marginLeft: 4, fontSize: 10.5 }}>🔒</span>}</td>
                              <td className="num rq-qty">{it.qty} {it.unit}</td>
                              <td className="muted rq-pur">{it.purpose || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {canPx !== true ? <div className="note" style={{ fontSize: 12.5 }}>🔒 Quotations, rates and purchase orders for this indent are handled by the office. You will see each delivery under <b>Site Deliveries</b> once material is dispatched.</div> : (<>{/* update463 */}
                    {/* enquiry download — by category (#6) */}
                    {(() => {
                      const enqItems = ind.items.filter(it => !it.ordered);   // update172: PO'd items excluded
                      const orderedCount = ind.items.length - enqItems.length;
                      const byCat = enqItems.reduce((a, it) => { (a[it.category] = a[it.category] || []).push(it); return a; }, {});
                      const chosenCount = enqItems.filter(it => enqSel[it.id]).length;
                      return (
                        <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Send enquiry to vendors</div>
                          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Tick the items to include, then download. Do it once per vendor group — e.g. pipes &amp; fittings together, hardware separately — and send via WhatsApp / mail.</div>
                          {orderedCount > 0 && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>🔒 {orderedCount} item{orderedCount > 1 ? "s" : ""} already under PO — not shown here.</div>}
                          {Object.entries(byCat).map(([cat, list]) => {
                            const allOn = list.every(it => enqSel[it.id]);
                            return (
                              <div key={cat} style={{ marginBottom: 6 }}>
                                <label style={{ fontWeight: 600, fontSize: 12.5, display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                                  <input type="checkbox" checked={allOn} onChange={() => toggleEnqCat(list, !allOn)} style={{ accentColor: "var(--copper)" }} />
                                  {cat} <span className="muted">({list.length})</span>
                                </label>
                                <div style={{ paddingLeft: 22 }}>
                                  {list.map(it => (
                                    <label key={it.id} style={{ display: "block", fontSize: 12, cursor: "pointer", padding: "1px 0" }}>
                                      <input type="checkbox" checked={!!enqSel[it.id]} onChange={() => toggleEnqItem(it.id)} style={{ accentColor: "var(--copper)", marginRight: 6 }} />
                                      {it.item_name}{it.spec ? " — " + it.spec : ""} · {it.qty} {it.unit}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                            <button onClick={() => downloadEnquiryPDF(ind)} disabled={!chosenCount}>⬇ PDF</button>
                            <button onClick={() => downloadEnquiryExcel(ind)} disabled={!chosenCount}>⬇ Excel</button>
                            <span className="muted" style={{ fontSize: 11.5 }}>{chosenCount} of {ind.items.length} items selected</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* add vendors */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <select value={vendorPick} onChange={e => setVendorPick(e.target.value)} style={{ width: 220 }}>
                        <option value="">Add a vendor…</option>
                        {masterVendors.filter(mv => !enqVendors.includes(mv.name)).map(mv => <option key={mv.id} value={mv.name}>{mv.name}</option>)}
                      </select>
                      <button onClick={addVendor} disabled={!vendorPick}>＋ Add vendor</button>
                      {enqVendors.map(v => (
                        <span key={v} className="badge gray" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          {v}<span onClick={() => removeVendor(v)} style={{ cursor: "pointer", fontWeight: 700 }}>✕</span>
                        </span>
                      ))}
                    </div>

                    {enqVendors.length === 0 ? (
                      <div className="muted" style={{ padding: "8px 0" }}>Add the vendors you want to send this enquiry to. For comparison, add 2–3 vendors for the same items.</div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table className="dt-compact">
                          <thead>
                            {ind.items.some(it => it.ordered) && <tr><td colSpan={2 + enqVendors.length} className="muted" style={{ fontSize: 12, padding: "4px 8px" }}>🔒 {ind.items.filter(it => it.ordered).length} item(s) already under PO — hidden from rate entry.</td></tr>}
                            <tr><th>Item</th><th className="num">Qty</th>{enqVendors.map(v => <th key={v} className="num">{v}</th>)}</tr></thead>
                          <tbody>
                            {ind.items.filter(it => !it.ordered).map(it => (
                              <tr key={it.id}>
                                <td style={{ fontWeight: 600 }}>{it.item_name}{it.spec ? <span className="muted" style={{ fontWeight: 400 }}> — {it.spec}</span> : ""}<div className="muted">{it.purpose}</div></td>
                                <td className="num">{it.qty} {it.unit}</td>
                                {enqVendors.map(v => {
                                  const on = !!alloc[it.id]?.[v]; const net = netOf(it.id, v);
                                  return (
                                    <td key={v} className="num" style={{ verticalAlign: "top" }}>
                                      <label style={{ display: "inline-flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
                                        <input type="checkbox" checked={on} onChange={() => toggleAlloc(it.id, v)} style={{ width: 15, height: 15, accentColor: "var(--copper)" }} />
                                        <span className="muted" style={{ fontSize: 11 }}>quote</span>
                                      </label>
                                      {on && (
                                        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
                                          <input style={{ width: 78 }} placeholder="list ₹" value={qin[it.id]?.[v]?.list || ""} onChange={e => setQ(it.id, v, "list", e.target.value)} />
                                          <input style={{ width: 78 }} placeholder="disc %" value={qin[it.id]?.[v]?.disc || ""} onChange={e => setQ(it.id, v, "disc", e.target.value)} />
                                          <div style={{ fontSize: 11.5, fontWeight: 700, color: net != null ? "var(--copper-deep)" : "var(--muted)" }}>{net != null ? "net " + inr(net) : "—"}</div>
                                          {vendHintLine(it.id, v) && <div style={{ fontSize: 10, color: "#1D4ED8", lineHeight: 1.35 }}>{vendHintLine(it.id, v)}</div>}{/* update408 */}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button onClick={() => compare(ind)}>Compare rates</button>
                      <button onClick={() => persistQuotes(ind)}>Save allocation & rates</button>
                    </div>

                    {/* update254: ONE proof section for the whole rate comparison, after the
                        rates are entered. Optional — nothing here is required to save. It is
                        NOT printed inside the PO; it prints as its own reference sheet. */}
                    <div className="note" style={{ marginTop: 10, background: "var(--copper-soft)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <b style={{ fontSize: 13 }}>📎 Rate comparison proof</b>
                        <span className="muted" style={{ fontSize: 11.5 }}>
                          Optional · vendor quotation, WhatsApp screenshot or email backing these rates
                        </span>
                        <label className="btn-like" style={{ marginLeft: "auto", fontSize: 12, cursor: "pointer",
                          border: "1px solid var(--copper)", color: "var(--copper)", borderRadius: 8, padding: "5px 11px", fontWeight: 700 }}>
                          {upBusy === "q" ? "Uploading…" : "+ Attach proof"}
                          {/* update266: FileList is LIVE — clearing the input first emptied it, so attachProof
                              received zero files and returned silently. Copy first, then reset. No capture=,
                              so Android offers camera OR gallery OR files (PDF / WhatsApp screenshots). */}
                          <input type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }}
                            onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ""; attachProof(ind.id, f); }} />
                        </label>
                        {proofs.length > 0 && (
                          <a href={"/purchase/rate-proof?indent=" + ind.id} target="_blank" rel="noreferrer"
                            style={{ fontSize: 12, fontWeight: 700, color: "var(--copper)" }}>🖨 Print proof sheet</a>
                        )}
                      </div>
                      {proofErr && <div className="error" style={{ fontSize: 12, marginTop: 6 }}>{proofErr}</div>}{/* update266 */}
                      {proofs.length === 0
                        ? <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>No proof attached yet — rates save fine without one.</div>
                        : <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                            {proofs.map(pr => (
                              <span key={pr.id} style={{ display: "inline-flex", alignItems: "center", gap: 5,
                                background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px" }}>
                                <a href={billUrl(pr.path)} target="_blank" rel="noreferrer" title="Open proof"
                                   style={{ display: "inline-flex", alignItems: "center", gap: 5, textDecoration: "none", color: "var(--text)" }}>
                                  {isPdf(pr.path)
                                    ? <span style={{ fontSize: 10, fontWeight: 800, color: "var(--copper)" }}>PDF</span>
                                    : <img src={billUrl(pr.path)} alt="" style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 4 }} />}
                                  <span style={{ fontSize: 11.5 }}>{pr.vendor_name ? pr.vendor_name : "Quotation"}</span>
                                </a>
                                <a onClick={() => removeProof(pr)} title="Remove"
                                   style={{ cursor: "pointer", color: "var(--red)", fontWeight: 800, fontSize: 13 }}>×</a>
                              </span>
                            ))}
                          </div>}
                    </div>

                    {cmp && (
                      <div style={{ marginTop: 14, background: "var(--bg)", borderRadius: 10, padding: 12 }}>
                        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Comparison</h3>

                        {/* per-item rate comparison — cheapest highlighted */}
                        <div style={{ overflowX: "auto", marginBottom: 12 }}>
                          <table className="dt-compact">
                            <thead><tr><th>Item</th><th className="num">Qty</th>{cmp.vendors.map(v => <th key={v} className="num">{v}</th>)}<th>Cheapest</th></tr></thead>
                            <tbody>
                              {ind.items.map(it => {
                                const row = cmp.matrix[it.id] || {};
                                const best = cmp.splitChoice[it.id];
                                return (
                                  <tr key={it.id}>
                                    <td style={{ fontWeight: 600, opacity: it.ordered ? 0.55 : 1 }}>{it.item_name}{it.spec ? <span className="muted" style={{ fontWeight: 400 }}> — {it.spec}</span> : ""}{it.ordered ? <span className="badge p" style={{ marginLeft: 6, fontSize: 10.5 }}>🔒 PO issued</span> : ""}<div className="muted">{it.qty} {it.unit}</div>{priceFor(it) && <div style={{ fontWeight: 600, fontSize: 10.5, color: "#0b5cad" }}>📗 Price list: {inr(priceFor(it).list)} − {priceFor(it).disc}% = {inr(priceFor(it).net)}/{priceFor(it).per} <span style={{ fontWeight: 400, color: "var(--muted)" }}>({priceFor(it).from})</span></div>}{/* update303 */}
                                {sugLine(it.item_name) && <div style={{ fontWeight: 500, fontSize: 10.5, color: "#0e7a3d" }}>💡 {sugLine(it.item_name)}</div>}</td>
                                    <td className="num">{it.qty} {it.unit}</td>
                                    {cmp.vendors.map(v => {
                                      const r = row[v]; const isBest = best && best.vendor === v;
                                      return (
                                        <td key={v} className="num" style={{ fontWeight: isBest ? 700 : 400, color: isBest ? "var(--copper-deep)" : (r == null ? "var(--muted)" : "inherit"), background: isBest ? "rgba(255,122,26,0.10)" : "transparent" }}>
                                          {r == null ? "—" : inr(r)}
                                        </td>
                                      );
                                    })}
                                    <td>{best ? <span className="badge p">{best.vendor}</span> : <span className="muted">no quote</span>}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {cmp.vendorTotals.length > 0 ? (
                          <table className="dt-compact">
                            <thead><tr><th>Vendor (quoted full indent)</th><th className="num">Total</th><th></th></tr></thead>
                            <tbody>
                              {cmp.vendorTotals.map((v, i) => (
                                <tr key={v.vendor}>
                                  <td style={{ fontWeight: 600 }}>{v.vendor} {i === 0 && <span className="badge p">Lowest</span>}</td>
                                  <td className="num">{inr(v.total)}</td>
                                  <td>{i > 0 && <span className="muted">+{inr(v.total - cmp.bestWhole.total)}</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="muted" style={{ fontSize: 12.5 }}>No single vendor quoted every item — that's normal when you split pipes and hardware across different vendors. Use the per-item table above, or <b>Split</b> below to award each item to its cheapest vendor.</div>
                        )}
                        <div className="muted" style={{ marginTop: 8 }}>
                          {cmp.bestWhole && <>Best single vendor: <b>{cmp.bestWhole.vendor} at {inr(cmp.bestWhole.total)}</b>. </>}
                          Split to cheapest per item: <b>{inr(cmp.splitTotal)}</b>
                          {cmp.gap > 0 && <> — splitting saves <b style={{ color: "var(--copper-deep)" }}>{inr(cmp.gap)} ({cmp.gapPct}%)</b> but needs multiple POs / more transport.</>}
                        </div>
                        <div style={{ marginTop: 10, marginBottom: 4 }}>
                          <label style={{ fontSize: 12.5, display: "inline-flex", gap: 7, alignItems: "center", cursor: "pointer" }}>
                            <input type="checkbox" checked={splitMode} onChange={e => setSplitMode(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--copper)" }} />
                            Split — choose a vendor per item (creates one PO per vendor)
                          </label>
                        </div>

                        {!splitMode ? (
                          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <label className="muted">Award whole indent to:</label>
                            <select value={awardVendor} onChange={e => { setAwardVendor(e.target.value); setReason(""); }}>
                              <option value="">Select vendor…</option>
                              {cmp.vendors.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                            {awardVendor && cmp.bestWhole && awardVendor !== cmp.bestWhole.vendor &&
                              <input placeholder="Reason for not choosing lowest *" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 280 }} />}
                            {canIssuePO(ind) ? <button className="primary" disabled={busy} onClick={() => award(ind)}>{busy ? "Issuing…" : "Issue PO"}</button>
                              : <span className="muted" style={{ fontSize: 12 }}>You don't have PO-issue rights for this site (Indent &amp; Purchase → Create). Ask a Director.</span>}
                          </div>
                        ) : (
                          <div style={{ marginTop: 8 }}>
                            <div className="muted" style={{ marginBottom: 6 }}>Pick who supplies each item. Use “+ split qty” if one item must come from more than one vendor.</div>
                            <table className="dt-compact">
                              <thead><tr><th>Item</th><th className="num">Qty</th><th>Vendor / split</th><th className="num">Amount</th></tr></thead>
                              <tbody>
                                {ind.items.map(it => {
                                  const splits = itemSplits[it.id];
                                  const vendorOpts = cmp.vendors.filter(vn => rates[it.id]?.[vn]);
                                  if (splits && splits.length) {
                                    const totalSplit = splits.reduce((s, r) => s + Number(r.qty || 0), 0);
                                    const okTotal = totalSplit === Number(it.qty);
                                    return (
                                      <tr key={it.id}>
                                        <td style={{ fontWeight: 600 }}>{it.item_name}</td>
                                        <td className="num">{it.qty} {it.unit}</td>
                                        <td>
                                          {splits.map((row, ri) => (
                                            <div key={ri} style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center" }}>
                                              <select value={row.vendor} onChange={e => setItemSplits(p => ({ ...p, [it.id]: p[it.id].map((r, i) => i === ri ? { ...r, vendor: e.target.value } : r) }))}>
                                                <option value="">Vendor…</option>
                                                {vendorOpts.map(vn => <option key={vn} value={vn}>{vn} (₹{rates[it.id][vn]})</option>)}
                                              </select>
                                              <input style={{ width: 70 }} placeholder="qty" value={row.qty} onChange={e => setItemSplits(p => ({ ...p, [it.id]: p[it.id].map((r, i) => i === ri ? { ...r, qty: e.target.value } : r) }))} />
                                              <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => ({ ...p, [it.id]: p[it.id].filter((_, i) => i !== ri) }))}>✕</button>
                                            </div>
                                          ))}
                                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => ({ ...p, [it.id]: [...p[it.id], { vendor: "", qty: "" }] }))}>+ vendor</button>
                                            <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => { const n = { ...p }; delete n[it.id]; return n; })}>cancel split</button>
                                            <span style={{ fontSize: 11.5, color: okTotal ? "var(--green)" : "var(--red)" }}>
                                              {totalSplit}/{it.qty} {it.unit}{okTotal ? " ✓" : " — must total " + it.qty}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="num">{splits.reduce((s, r) => s + (rates[it.id]?.[r.vendor] ? Number(rates[it.id][r.vendor]) * Number(r.qty || 0) : 0), 0) ? inr(splits.reduce((s, r) => s + (rates[it.id]?.[r.vendor] ? Number(rates[it.id][r.vendor]) * Number(r.qty || 0) : 0), 0)) : "—"}</td>
                                      </tr>
                                    );
                                  }
                                  const v = itemVendor[it.id] || "";
                                  const r = v ? rates[it.id]?.[v] : "";
                                  return (
                                    <tr key={it.id}>
                                      <td style={{ fontWeight: 600, opacity: it.ordered ? 0.55 : 1 }}>{it.item_name}{it.ordered ? <span className="badge p" style={{ marginLeft: 6, fontSize: 10.5 }}>🔒 PO issued</span> : ""}</td>
                                      <td className="num">{it.qty} {it.unit}</td>
                                      {it.ordered ? <td className="muted">locked — already under a PO</td> : (
                                      <td style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                        <select title="GST %" value={gstSel[it.id] ?? 18} onChange={e => setGstSel(g => ({ ...g, [it.id]: Number(e.target.value) }))} style={{ width: 70 }}>
                                          {[0, 5, 12, 18, 28].map(x => <option key={x} value={x}>{x}% GST</option>)}
                                        </select>
                                        <select value={v} onChange={e => setItemVendor(p => ({ ...p, [it.id]: e.target.value }))}>
                                          <option value="">Select…</option>
                                          {vendorOpts.map(vn => <option key={vn} value={vn}>{vn} (₹{rates[it.id][vn]})</option>)}
                                        </select>
                                        <button style={{ fontSize: 11 }} onClick={() => setItemSplits(p => ({ ...p, [it.id]: [{ vendor: v || "", qty: it.qty }, { vendor: "", qty: "" }] }))}>+ split qty</button>
                                      </td>)}
                                      <td className="num">{it.ordered ? "—" : r ? inr(Number(r) * Number(it.qty)) : "—"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {canIssuePO(ind) ? <button className="primary" disabled={busy} onClick={() => awardSplit(ind)} style={{ marginTop: 10 }}>{busy ? "Issuing…" : "Issue split POs"}</button>
                              : <span className="muted" style={{ fontSize: 12 }}>You don't have PO-issue rights for this site.</span>}
                          </div>
                        )}
                      </div>
                    )}
                    </>)}{/* update463 */}
                    {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
                  </div>
                )}
              </div>
            ))}
            {pager(indPage, setIndPage, open.length)}
          </>
          )}
        </div>}

        {showPo && <div className="it-procure-po" style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>{/* update407 */}
          <div style={{ fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span className="muted">🧾</span>Purchase orders issued<span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>{poShown.length}{canPx === true ? " · " + inr(poShown.reduce((s2, p) => s2 + (p.status === "cancelled" ? 0 : Number(p.total || 0)), 0)) : ""}</span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 12px", alignItems: "center" }}>
            <select value={poFsite} onChange={e => setPoFsite(e.target.value)} style={{ height: 34 }}><option value="all">Site: all</option>{[...new Set(pos.map(p => p.site).filter(Boolean))].sort().map(x => <option key={x} value={x}>{x}</option>)}</select>
            <select value={poFvendorSel} onChange={e => setPoFvendorSel(e.target.value)} style={{ height: 34 }}><option value="all">Vendor: all</option>{[...new Set(pos.map(p => p.vendor).filter(Boolean))].sort().map(x => <option key={x} value={x}>{x}</option>)}</select>
            <select value={poFstatus} onChange={e => setPoFstatus(e.target.value)} style={{ height: 34 }}><option value="all">Status: all</option><option value="live">Live (not cancelled)</option>{[...new Set(pos.map(p => p.status).filter(Boolean))].sort().map(x => <option key={x} value={x}>{x}</option>)}</select>
            <div style={{ flex: "1 1 160px", display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "0 10px", height: 34 }}><span className="muted">🔍</span><input placeholder="PO or indent no…" value={poFindent} onChange={e => setPoFindent(e.target.value)} style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: 13 }} /></div>
            <button type="button" className={poMore ? "primary" : ""} style={{ height: 34 }} onClick={() => setPoMore(m => !m)}>⚙ More filters{(poFraised !== "all" || poFdeliv !== "all" || poFfrom || poFto || poFvendor) ? " •" : ""}</button>
          </div>
          {poMore && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "var(--gray-bg)", borderRadius: 8, padding: 10, marginBottom: 12 }}>
              <select value={poFraised} onChange={e => setPoFraised(e.target.value)}><option value="all">Raised by: all</option>{[...new Set(pos.map(p => p.raised_by).filter(Boolean))].sort().map(x => <option key={x} value={x}>{x}</option>)}</select>
              <select value={poFdeliv} onChange={e => setPoFdeliv(e.target.value)}><option value="all">Delivery: all</option>{Object.entries(DELIVERY_STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
              <input placeholder="Vendor contains…" value={poFvendor} onChange={e => setPoFvendor(e.target.value)} style={{ width: 140 }} />
              <span className="muted" style={{ fontSize: 12 }}>PO date</span><input type="date" value={poFfrom} onChange={e => setPoFfrom(e.target.value)} /><span className="muted" style={{ fontSize: 12 }}>to</span><input type="date" value={poFto} onChange={e => setPoFto(e.target.value)} />
              <button type="button" style={{ fontSize: 11.5, marginLeft: "auto" }} onClick={() => { setPoFsite("all"); setPoFindent(""); setPoFraised("all"); setPoFvendorSel("all"); setPoFvendor(""); setPoFdeliv("all"); setPoFstatus("all"); setPoFfrom(""); setPoFto(""); }}>✕ Clear</button>
            </div>
          )}
          {pos.length === 0 ? <span className="muted">No POs yet.</span> : poShown.length === 0 ? <span className="muted">No POs match these filters.</span> : (
            <>
              <div id="po-list" style={{ display: "grid", gap: 12 }}>{/* update410: every PO card shows detail + actions, no click */}
                  {poShown.slice((poPage - 1) * PAGE, poPage * PAGE).map(p => {
                    const [dl, dc] = DELIVERY_STATUS[p.delivery_status] || DELIVERY_STATUS.pending; const dcp = dcPend[p.id];   // update441
                    const void_ = p.status === "cancelled";
                    return (
                    <div key={p.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: 14, opacity: void_ ? .65 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                        <div><div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: void_ ? "line-through" : "none" }}>{p.po_no}</div><div className="muted" style={{ fontSize: 11.5 }}>{p.date} · {p.site || "—"}</div></div>
                        <div style={{ textAlign: "right" }}><div style={{ fontSize: 13 }}>{canPx === true && p.total != null ? inr(p.total) : ""}</div>
                          {void_ ? <span style={{ background: "#F3F4F6", color: "#6B7280", fontSize: 11, padding: "2px 8px", borderRadius: 999 }}>Cancelled</span>
                          : p.approval === "approved" ? <span style={{ background: "#DCFCE7", color: "#15803D", fontSize: 11, padding: "2px 8px", borderRadius: 999 }}>Approved</span>
                          : p.approval === "rejected" ? <span style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: 11, padding: "2px 8px", borderRadius: 999 }}>Rejected</span>
                          : <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: 11, padding: "2px 8px", borderRadius: 999 }}>Awaiting approval</span>}</div>
                      </div>
                      <div style={{ fontSize: 13, marginBottom: 8 }}>Vendor: <VendorLink name={p.vendor} /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, fontSize: 12, padding: "10px 0", borderTop: "1px solid var(--border)", marginBottom: 10 }}>
                        <div><span className="muted" style={{ display: "block" }}>Indent</span><b style={{ fontWeight: 500 }}>{p.indent_no || "—"}</b></div>
                        <div><span className="muted" style={{ display: "block" }}>Raised by</span><b style={{ fontWeight: 500 }}>{p.raised_by || "—"}</b></div>
                        <div><span className="muted" style={{ display: "block" }}>Delivery</span><b style={{ fontWeight: 500 }}>{dl}{p.expected_delivery ? " · by " + p.expected_delivery : ""}</b>{dcp && Number(dcp.pending_qty) > 0 && <div><span title={`${dcp.received_qty} of ${dcp.ordered_qty} received on challans · ${dcp.pending_qty} pending`} style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: 10.5, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>🚚 Delivery challan pending · {Number(dcp.pending_qty)}</span></div>}{dcp && Number(dcp.pending_qty) <= 0 && dcp.grn_pending_on_dc && <div><span style={{ background: "#EDE9FE", color: "#6D28D9", fontSize: 10.5, padding: "2px 8px", borderRadius: 999 }}>GRN pending</span></div>}</div>
                        <div><span className="muted" style={{ display: "block" }}>Received</span>{p.received_pct == null ? <b style={{ fontWeight: 500 }}>—</b> : <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ flex: 1, height: 5, background: "var(--gray-bg)", borderRadius: 99, overflow: "hidden" }}><div style={{ width: Math.min(100, p.received_pct) + "%", height: "100%", background: void_ ? "var(--muted)" : p.received_pct >= 100 ? "#15803D" : "#FF7A1A" }} /></div><b style={{ fontWeight: 500, fontSize: 11.5 }}>{p.items_complete}/{p.item_count} items</b></div>}</div>
                        <div><span className="muted" style={{ display: "block" }}>{p.approval === "approved" ? "Approved by" : p.approval === "rejected" ? "Rejected by" : "Approval"}</span><b style={{ fontWeight: 500 }}>{p.approval === "approved" ? (p.approved_by || "Director") + (p.approved_at ? " · " + p.approved_at : "") : p.approval === "rejected" ? (p.approved_by || "—") + (p.reject_reason ? " — " + p.reject_reason : "") : (canApprPO ? "Your decision needed" : "Sent to Director")}</b></div>
                        <div><span className="muted" style={{ display: "block" }}>PO status</span><b style={{ fontWeight: 500, textTransform: "capitalize" }}>{void_ ? "Cancelled" : p.status}</b></div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 12 }}>{/* update198: Director approval */}
                        {p.approval === "approved"
                          ? <span className="badge p" title={p.approved_by ? "Approved by " + p.approved_by + (p.approved_at ? " on " + p.approved_at : "") : "Approved"}>✓ Approved by Director</span>
                          : p.approval === "rejected"
                          ? <span className="badge red">✕ Rejected</span>
                          : <span className="badge warn">Draft · Awaiting approval</span>}
                        {p.approval === "approved" && p.approved_by && <div className="muted" style={{ fontSize: 10.5 }}>{p.approved_by}{p.approved_at ? " · " + p.approved_at : ""}</div>}
                        {p.approval === "rejected" && p.reject_reason && <div className="muted" style={{ fontSize: 10.5, maxWidth: 140 }}>{p.reject_reason}{p.approved_by ? " — " + p.approved_by : ""}</div>}
                        {!canApprPO && p.approval === "pending" && <div style={{ fontSize: 10.5, color: "var(--amber)", marginTop: 2 }}>⏳ Sent to Director — not yet active</div>}
                        {canApprPO && p.approval === "pending" && p.status !== "cancelled" && (
                          <div style={{ marginTop: 3 }}>
                            <button style={{ fontSize: 12.5, background: "#DCFCE7", color: "#15803D", border: 0, borderRadius: 8, padding: "7px 14px", marginRight: 4 }}
                              onClick={async () => { if (!window.confirm("Approve " + p.po_no + " (" + inr(p.total) + " · " + p.vendor + ")?")) return; const r = await approvePO(p.id, "approved"); if (!r.ok) { setErr(r.error); return; } setMsg(p.po_no + " approved."); load(); }}>✓ Approve</button>
                            <button style={{ fontSize: 12.5, background: "#FEE2E2", color: "#B91C1C", border: 0, borderRadius: 8, padding: "7px 14px" }}
                              onClick={async () => { const why = window.prompt("Reason for rejecting " + p.po_no + ":"); if (why === null) return; const r = await approvePO(p.id, "rejected", why); if (!r.ok) { setErr(r.error); return; } setMsg(p.po_no + " rejected."); load(); }}>✗ Reject</button>
                          </div>
                        )}
                      </span>
                        {/* update258: nothing to receive and nothing to send on a cancelled PO */}
                        {void_
                          ? <button style={{ fontSize: 11.5, marginRight: 4 }} disabled title="This PO is cancelled — delivery tracking no longer applies">📦 Delivery</button>
                          : <button style={{ fontSize: 11.5, marginRight: 4 }} onClick={() => setDeliv({ id: p.id, po_no: p.po_no, expected_delivery: p.expected_delivery || "", delivery_status: p.delivery_status || "pending", delivery_note: p.delivery_note || "" })}>📦 Delivery</button>}
                        {void_
                          ? <button style={{ fontSize: 11.5, marginRight: 4 }} disabled title="Cancelled — not valid for issue to the vendor">🔒 Print</button>
                          : p.approval === "approved"
                          ? <a href={"/purchase/po?po=" + p.id} target="_blank" rel="noreferrer"><button style={{ fontSize: 11.5, marginRight: 4 }}>Print</button></a>
                          : p.approval !== "rejected" && canApprPO
                            /* update221: the APPROVER must be able to review the full draft before deciding */
                            ? <a href={"/purchase/po?po=" + p.id + "&review=1"} target="_blank" rel="noreferrer"><button style={{ fontSize: 11.5, marginRight: 4, border: "1px solid var(--amber)", color: "var(--amber)", fontWeight: 700 }} title="Review the draft PO (printed copy is watermarked DRAFT)">👁 Review draft</button></a>
                            : <button style={{ fontSize: 11.5, marginRight: 4, color: "var(--muted)" }} disabled title={p.approval === "rejected" ? "Rejected — cannot be issued" : "Waiting for Director approval — cannot be issued yet"}>🔒 Print</button>}
                        {/* update255: reach the rate-comparison proof straight from the list.
                            Shown whenever the PO came from an indent, so "none attached" is
                            distinguishable from "no way to look". */}
                        {p.indent_id && (
                          <a href={"/purchase/rate-proof?indent=" + p.indent_id} target="_blank" rel="noreferrer">
                            <button style={{ fontSize: 11.5, marginRight: 4,
                              border: "1px solid " + (p.proof_count > 0 ? "var(--copper)" : "var(--border)"),
                              color: p.proof_count > 0 ? "var(--copper)" : "var(--muted)",
                              fontWeight: p.proof_count > 0 ? 700 : 400 }}
                              title={p.proof_count > 0 ? "Rate comparison proof — opens separately" : "No rate proof attached to this indent"}>
                              📎 {p.proof_count > 0 ? p.proof_count : "0"}</button>
                          </a>
                        )}
                        {p.status !== "cancelled" && <button style={{ fontSize: 11.5, color: "var(--red)" }} onClick={() => doCancel(p)}>Cancel</button>}
                      </div>
                    </div>
                  ); })}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 4px", marginTop: 10, flexWrap: "wrap", gap: 8 }}>
                <span className="muted" style={{ fontSize: 12 }}>Showing {(poPage - 1) * PAGE + (poShown.length ? 1 : 0)}–{Math.min(poPage * PAGE, poShown.length)} of {poShown.length} · vendor names open the vendor profile</span>
                <div style={{ display: "flex", gap: 4 }}><button type="button" style={{ padding: "5px 9px" }} disabled={poPage <= 1} onClick={() => setPoPage(x => x - 1)}>‹</button><button type="button" style={{ padding: "5px 9px" }} disabled={poPage * PAGE >= poShown.length} onClick={() => setPoPage(x => x + 1)}>›</button></div>
              </div></>
          )}
        </div>}
        {deliv && (
          <div onClick={() => setDeliv(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 440, width: "100%", padding: 22 }}>
              <h2 style={{ marginBottom: 2 }}>Delivery — {deliv.po_no}</h2>
              <div className="muted" style={{ marginBottom: 14, fontSize: 13 }}>The site sees this live on their mobile indent list.</div>
              <div style={{ display: "grid", gap: 10 }}>
                <div><label className="muted">Expected delivery date</label>
                  <input type="date" style={{ width: "100%" }} value={deliv.expected_delivery} onChange={e => setDeliv(d => ({ ...d, expected_delivery: e.target.value }))} /></div>
                <div><label className="muted">Status</label>
                  <select style={{ width: "100%" }} value={deliv.delivery_status} onChange={e => setDeliv(d => ({ ...d, delivery_status: e.target.value }))}>
                    {Object.entries(DELIVERY_STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
                  </select></div>
                <div><label className="muted">Note (optional, e.g. reason for delay)</label>
                  <input style={{ width: "100%" }} value={deliv.delivery_note} onChange={e => setDeliv(d => ({ ...d, delivery_note: e.target.value }))} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="primary" disabled={busy} onClick={saveDelivery}>{busy ? "Saving…" : "Update delivery"}</button>
                <button onClick={() => setDeliv(null)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
        {allInd !== null && (
          <div onClick={() => setAllInd(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 95, padding: 14 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, maxWidth: 1000, width: "100%", padding: 20, maxHeight: "92vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0 }}>🗂 All indents ever raised</h2>
                <button type="button" onClick={() => setAllInd(null)}>✕ Close</button>
              </div>
              <div className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>Every indent, any status — nothing disappears just because a PO was raised from it.</div>
              {allInd.length === 0 ? <div className="muted">Loading…</div> : (
                <div style={{ overflowX: "auto" }}>
                  {/* update222: 4 folded wrapping columns — the whole record fits without sideways scrolling */}
                  <table className="dt-compact allind-tbl" style={{ width: "100%" }}>
                    <thead><tr><th>Indent · Site</th><th>Raised</th><th className="num">Items</th><th>Status &amp; POs</th></tr></thead>
                    <tbody>
                      {allInd.map(i => { const [lbl, cls] = ({ open: ["open", "warn"], quoting: ["quoting", "h"], po_issued: ["PO Raised", "p"], closed: ["closed", "gray"], cancelled: ["cancelled", "red"] })[i.status] || [i.status, "gray"]; return (
                        <tr key={i.id}>
                          <td>
                            <b>{i.indent_no}</b>{i.urgency === "urgent" && <span className="badge red" style={{ marginLeft: 6, fontSize: 10 }}>Urgent</span>}
                            <div className="muted" style={{ fontSize: 11.5 }}>📍 {i.site}</div>
                          </td>
                          <td style={{ fontSize: 12 }}>{i.by || "—"}<div className="muted" style={{ fontSize: 11 }}>{i.date}{i.required_by ? " · need by " + i.required_by : ""}</div></td>
                          <td className="num" style={{ fontWeight: 700 }}>{i.items}</td>
                          <td>
                            <span className={"badge " + cls}>{lbl}</span>
                            {i.pos.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                              {i.pos.map(pn => <span key={pn} className="badge p" style={{ fontSize: 10.5 }}>{pn}</span>)}</div>}
                          </td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      {/* update337: indent edit trail — before/after, who, and what stayed PO-locked */}
      {editLog && (
        <div onClick={() => setEditLog(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,20,25,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 760, padding: 22, maxHeight: "88vh", overflowY: "auto" }}>
            <h2 style={{ marginBottom: 2 }}>Indent edit log</h2>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Newest first. Entries can never be edited or deleted.</div>
            {!editLog.length ? <div className="muted">No edits recorded for this indent.</div> : editLog.map(a => (
              <div key={a.id} style={{ borderTop: "1px solid var(--border)", padding: "10px 0" }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {new Date(a.changed_at).toLocaleString("en-IN")} · {a.changed_by_name || "—"}
                  <span className="muted" style={{ fontWeight: 400 }}>
                    {" "}({a.as_role === "raiser" ? "the raiser" : a.as_role === "director" ? "Director" : "Indent Edit right"})
                  </span>
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {a.items_before} item(s) → {a.items_after}
                  {Array.isArray(a.locked_items) && a.locked_items.length ? ` · ${a.locked_items.length} left untouched (already on a PO)` : ""}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap", fontSize: 11.5 }}>
                  <div style={{ flex: "1 1 260px" }}>
                    <div style={{ fontWeight: 700, color: "#b91c1c", marginBottom: 2 }}>Before</div>
                    {(a.old_items || []).map((it, k) => <div key={k}>{it.item_name} — {it.qty} {it.unit || ""}</div>)}
                  </div>
                  <div style={{ flex: "1 1 260px" }}>
                    <div style={{ fontWeight: 700, color: "#15803d", marginBottom: 2 }}>After</div>
                    {(a.new_items || []).map((it, k) => <div key={k}>{it.item_name} — {it.qty} {it.unit || ""}</div>)}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14, textAlign: "right" }}><button onClick={() => setEditLog(null)}>Close</button></div>
          </div>
        </div>
      )}
    </>

  );
}