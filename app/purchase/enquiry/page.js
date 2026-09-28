"use client";
// update440: Enquiry builder — pending-only items (server-enforced), balance qty, vendor groups with ENQ numbers, WhatsApp / Email / PDF / Excel, send log.
// Print mode: ?print=<enquiry id>  (also used by the public share page via token)
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getSession } from "@/lib/auth";
import { EnquiryDoc, fmtD } from "@/components/EnquiryDoc";
import { getPendingEnquiryItems, getIndentHeader, getVendorContacts, setVendorContact, createEnquiry, getEnquiriesForIndent, getEnquiry, getTemplate, saveTemplate, fillTemplate, waLink, mailtoLink } from "@/lib/enquiry";

function Builder() {
  const params = useSearchParams(); const indentId = params.get("indent"); const itemFilter = params.get("items"); const printId = params.get("print");
  const vendorParam = params.get("vendors");
  const sess = typeof window !== "undefined" ? getSession() : null;
  const [hdr, setHdr] = useState(null); const [pend, setPend] = useState(null); const [vendors, setVendors] = useState([]); const [assign, setAssign] = useState({}); const [sel, setSel] = useState({});
  const [contacts, setContacts] = useState({}); const [tpl, setTpl] = useState(""); const [msgs, setMsgs] = useState({}); const [sent, setSent] = useState([]); const [err, setErr] = useState(""); const [note, setNote] = useState(""); const [printEnq, setPrintEnq] = useState(null); const [editTpl, setEditTpl] = useState(false); const [newVendor, setNewVendor] = useState("");

  useEffect(() => { if (printId) getEnquiry(printId).then(e => { setPrintEnq(e); setTimeout(() => window.print(), 600); }); }, [printId]);
  useEffect(() => {
    if (!indentId || printId) return;
    const ids = itemFilter ? itemFilter.split(",").map(s => Number(s.trim())).filter(Boolean) : null;
    const vs = vendorParam ? vendorParam.split("|").map(s => decodeURIComponent(s)).filter(Boolean) : [];
    Promise.all([getIndentHeader(indentId), getPendingEnquiryItems(indentId, ids), getVendorContacts(vs), getTemplate(), getEnquiriesForIndent(indentId)]).then(([h, p, c, t, e]) => {
      setHdr(h); setPend(p); if (p.error) setErr(p.error); setVendors(vs); setContacts(c); setTpl(t); setSent(e);
      const a = {}, s = {}; p.rows.forEach((r, i) => { a[r.id] = vs[0] || ""; s[r.id] = true; }); setAssign(a); setSel(s);
    });
  }, [indentId, itemFilter, vendorParam, printId]);

  if (printId) return printEnq ? <EnquiryDoc enq={printEnq} /> : <div style={{ padding: 40, textAlign: "center" }}>Loading…</div>;
  if (!indentId) return <div style={{ padding: 40, textAlign: "center" }}>Open this from Procurement → indent → Send enquiry.</div>;
  if (!pend) return <div style={{ padding: 40, textAlign: "center" }}>Loading pending items…</div>;

  const rows = pend.rows; const groups = vendors.length ? vendors : ["(no vendor)"];
  const lastSentFor = (itemId, vendor) => sent.filter(e => e.vendor_name.toLowerCase() === String(vendor).toLowerCase() && (e.items || []).some(x => Number(x.item_id) === itemId)).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0];
  const itemsOf = v => rows.filter(r => (assign[r.id] || "") === v); const chosenOf = v => itemsOf(v).filter(r => sel[r.id]);
  const buildMsg = (v, enqNo, link, n) => fillTemplate(tpl, { vendor: v, enq_no: enqNo, n, indent: hdr?.indent_no, date: fmtD(hdr?.required_by), link });
  async function send(v, via) {
    const ids = chosenOf(v).map(r => r.id); if (!ids.length) { setErr("Tick at least one item for " + v + "."); return; }
    const c = contacts[v.toLowerCase()]; const mobile = c?.phone, email = c?.email;
    if (via === "whatsapp" && !mobile) { setErr("No mobile saved for " + v + " — add it below first."); return; }
    if (via === "email" && !email) { setErr("No email saved for " + v + " — add it below first."); return; }
    const r = await createEnquiry(indentId, v, ids, via, null); if (!r.ok) { setErr(r.error); return; }
    const link = `${window.location.origin}/e/${r.token}`; const text = msgs[v] ? msgs[v].replace(/ENQ\/\S+|\{enq_no\}/, r.enq_no).replace(/\{link\}|https?:\/\/\S*\/e\/\S+/, link) : buildMsg(v, r.enq_no, link, ids.length);
    if (via === "whatsapp") window.open(waLink(mobile, text), "_blank");
    else if (via === "email") window.location.href = mailtoLink(email, `Enquiry ${r.enq_no} — Pipeskool Projects (Indent ${hdr?.indent_no})`, text + "\n\nPDF: " + link);
    else if (via === "pdf") window.open(`/purchase/enquiry?print=${r.id}`, "_blank");
    else if (via === "excel") { const XLSX = await import("xlsx"); const e = await getEnquiry(r.id); const ws = XLSX.utils.aoa_to_sheet([[`Enquiry ${e.enq_no} — ${e.vendor_name}`], [`Indent ${e.indent_no} · ${e.site_name} · required by ${fmtD(e.required_by)}`], [], ["#", "Category", "Description", "Balance qty", "Unit", "List rate", "Disc %", "Net rate"], ...e.items.map((it, i) => [i + 1, it.category, it.item_name, Number(it.balance_qty), it.unit, "", "", ""])]); ws["!cols"] = [{ wch: 4 }, { wch: 16 }, { wch: 60 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 10 }]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Enquiry"); XLSX.writeFile(wb, `${e.enq_no.replace(/\//g, "-")}_${e.vendor_name.replace(/[^A-Za-z0-9]+/g, "_")}.xlsx`); }
    setNote(`${r.enq_no} recorded for ${v} (${ids.length} items${r.already_enquired ? "; ⚠ some items were already enquired from this vendor in " + r.already_enquired : ""}).`); setErr("");
    getEnquiriesForIndent(indentId).then(setSent);
  }
  async function saveContact(v, phone, email) { const r = await setVendorContact(v, phone, email); if (!r.ok) { setErr(r.error); return; } setContacts(await getVendorContacts(vendors)); setNote("Saved to Vendor Master."); }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Send enquiry — {hdr?.indent_no} · {hdr?.site}{hdr?.required_by ? " · needed by " + fmtD(hdr.required_by) : ""}</div>
      <div className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>Only pending items are enquired. PO-issued items are removed on the server — the URL cannot bring them back.</div>
      {err && <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "8px 12px", borderRadius: 8, marginBottom: 8, fontSize: 12.5 }}>⚠ {err}</div>}
      {note && <div style={{ background: "#ECFDF5", color: "#065F46", padding: "8px 12px", borderRadius: 8, marginBottom: 8, fontSize: 12.5 }}>{note}</div>}
      <div style={{ background: "#FFF7E6", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, color: "#92400E", marginBottom: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>🔒 <b>{pend.excluded} items already under PO excluded.</b> {rows.length} pending item{rows.length === 1 ? "" : "s"}{rows.some(r => r.po_qty > 0) ? ` · ${rows.filter(r => r.po_qty > 0).length} partially covered (balance qty shown)` : ""}</span>
        <span style={{ flex: 1 }} /><span>Message template: <button style={{ fontSize: 11.5 }} onClick={() => setEditTpl(x => !x)}>✎ {editTpl ? "Close" : "Edit"}</button></span>
      </div>
      {editTpl && <div style={{ marginBottom: 10 }}><textarea value={tpl} onChange={e => setTpl(e.target.value)} rows={3} style={{ width: "100%" }} /><div className="muted" style={{ fontSize: 11 }}>Placeholders: {"{vendor} {enq_no} {n} {indent} {date} {link}"}</div><button style={{ fontSize: 12, marginTop: 4 }} onClick={async () => { const r = await saveTemplate(tpl); setNote(r.ok ? "Template saved." : r.error); }}>Save template</button></div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}><input placeholder="Add a vendor group…" value={newVendor} onChange={e => setNewVendor(e.target.value)} style={{ width: 240 }} /><button style={{ fontSize: 12 }} onClick={async () => { const v = newVendor.trim(); if (!v || vendors.includes(v)) return; const nv = [...vendors, v]; setVendors(nv); setContacts(await getVendorContacts(nv)); setNewVendor(""); }}>+ Add vendor</button></div>
      {rows.length === 0 && <div style={{ padding: 30, textAlign: "center", border: "1px dashed #d5d5d0", borderRadius: 12 }}><b>Nothing pending to enquire</b><div className="muted">Every selected item is already under PO.</div></div>}
      {rows.length > 0 && groups.map(v => {
        const its = itemsOf(v); if (!its.length && v !== "(no vendor)") return null; const c = contacts[v.toLowerCase()]; const n = chosenOf(v).length; const canSend = v !== "(no vendor)" && n > 0;
        return (
          <div key={v} style={{ border: "1px solid #e3e3de", borderRadius: 12, marginBottom: 12, overflow: "hidden", background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#F7F7F5", borderBottom: "1px solid #e3e3de", flexWrap: "wrap" }}>
              <b style={{ fontSize: 13.5 }}>{v}</b><span className="muted" style={{ fontSize: 11.5 }}>📱 {c?.phone || "—"} · ✉ {c?.email || "—"}</span><span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#DCFCE7", color: "#15803D" }}>{its.length} items · {n} selected</span>
              <button disabled={!canSend || !c?.phone} title={!c?.phone ? "Add the vendor's mobile first" : ""} style={{ background: "#25D366", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, opacity: canSend && c?.phone ? 1 : .45 }} onClick={() => send(v, "whatsapp")}>💬 WhatsApp</button>
              <button disabled={!canSend || !c?.email} title={!c?.email ? "Add the vendor's email first" : ""} style={{ background: "#1D4ED8", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, opacity: canSend && c?.email ? 1 : .45 }} onClick={() => send(v, "email")}>✉ Email</button>
              <button disabled={!canSend} style={{ fontSize: 12 }} onClick={() => send(v, "pdf")}>⬇ PDF</button><button disabled={!canSend} style={{ fontSize: 12 }} onClick={() => send(v, "excel")}>⬇ Excel</button>
            </div>
            {v !== "(no vendor)" && (!c?.phone || !c?.email) && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#991B1B", display: "flex", gap: 8, alignItems: "center", margin: "10px 14px 0", flexWrap: "wrap" }}>⚠ {!c ? "Vendor not in Vendor Master." : "Contact missing."} <input id={"ph-" + v} placeholder="Mobile" defaultValue={c?.phone || ""} style={{ width: 130 }} /><input id={"em-" + v} placeholder="Email" defaultValue={c?.email || ""} style={{ width: 200 }} /><button style={{ fontSize: 11.5 }} onClick={() => saveContact(v, document.getElementById("ph-" + v).value, document.getElementById("em-" + v).value)}>Save to Vendor Master</button></div>)}
            <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead><tr>{["", "#", "Category", "Description", "Indent qty", "Under PO", "Balance qty", "Unit", "Vendor", "Status"].map((h, i) => <th key={i} style={{ textAlign: [4, 5, 6].includes(i) ? "right" : "left", fontSize: 11, color: "#555", padding: "7px 12px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{its.map((r, i) => { const ls = lastSentFor(r.id, v); return (
                <tr key={r.id} style={{ borderBottom: "1px solid #f1f1ef" }}>
                  <td style={{ padding: "6px 12px" }}><input type="checkbox" checked={!!sel[r.id]} onChange={e => setSel(s => ({ ...s, [r.id]: e.target.checked }))} /></td><td style={{ padding: "6px 12px" }}>{i + 1}</td><td style={{ padding: "6px 12px" }}>{r.category}</td><td style={{ padding: "6px 12px" }}>{r.item_name}{r.spec ? <span className="muted"> — {r.spec}</span> : null}</td>
                  <td style={{ padding: "6px 12px", textAlign: "right" }}>{r.indent_qty}</td><td style={{ padding: "6px 12px", textAlign: "right" }}>{r.po_qty > 0 ? <span>{r.po_qty}<div className="muted" style={{ fontSize: 10.5 }}>{r.po_nos}</div></span> : "—"}</td><td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 700 }}>{r.balance_qty}</td><td style={{ padding: "6px 12px" }}>{r.unit}</td>
                  <td style={{ padding: "6px 12px" }}><select value={assign[r.id] || ""} onChange={e => setAssign(a => ({ ...a, [r.id]: e.target.value }))} style={{ fontSize: 11.5 }}><option value="">(no vendor)</option>{vendors.map(x => <option key={x} value={x}>{x}</option>)}</select></td>
                  <td style={{ padding: "6px 12px", whiteSpace: "nowrap" }}>{r.po_qty > 0 && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#FEF3C7", color: "#B45309", marginRight: 4 }}>partial PO</span>}{ls ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#DBEAFE", color: "#1D4ED8" }} title={ls.enq_no}>Enquiry sent · {fmtD(ls.sent_at)}</span> : "—"}{ls && sel[r.id] ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#FEF3C7", color: "#B45309", marginLeft: 4 }}>⚠ again?</span> : null}</td>
                </tr>); })}</tbody></table></div>
            {v !== "(no vendor)" && <div style={{ margin: "10px 14px 14px", background: "#FAFAF9", border: "1px solid #e3e3de", borderRadius: 10, padding: "10px 12px" }}><div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Message (editable · ENQ number and link are filled in when you send)</div><textarea rows={3} value={msgs[v] ?? buildMsg(v, "{enq_no}", "{link}", n)} onChange={e => setMsgs(m => ({ ...m, [v]: e.target.value }))} style={{ width: "100%", fontSize: 12.5 }} /></div>}
          </div>);
      })}
      {sent.length > 0 && <div style={{ marginTop: 14 }}><b style={{ fontSize: 13 }}>Enquiries sent for this indent</b>{sent.map(e => <div key={e.id} style={{ fontSize: 12.5, padding: "6px 0", borderTop: "1px solid #eee", display: "flex", gap: 10, flexWrap: "wrap" }}><b>{e.enq_no}</b><span>{e.vendor_name}</span><span className="muted">{(e.items || []).length} items · via {e.via} · {e.sent_by_name} · {fmtD(e.sent_at)}</span><a href={`/purchase/enquiry?print=${e.id}`} target="_blank" rel="noreferrer">PDF</a><a href={`/e/${e.share_token}`} target="_blank" rel="noreferrer">share link</a></div>)}</div>}
    </div>);
}
export default function EnquiryPage() { return <Suspense fallback={<div style={{ padding: 40, textAlign: "center" }}>Loading…</div>}><Builder /></Suspense>; }
