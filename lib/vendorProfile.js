"use client";
// update410: VENDOR PROFILE — everything the app knows about one vendor, by name: POs, GRNs, challans,
// direct payments — as stats + one activity timeline. Read-only; every source is an existing table.
import { supabase, isDemo } from "./supabase";

const norm = s => String(s || "").trim().toLowerCase();
export async function getVendorProfile(name) {
  if (isDemo || !name) return null;
  const n = String(name).trim();
  const [{ data: pos }, { data: txns }, { data: dcs }, { data: pays }, { data: vend }] = await Promise.all([
    supabase.from("purchase_orders").select("id, po_no, created_at, total_amount, status, approval_status, approved_at, approver:approved_by(full_name), sites(name)").ilike("vendor_name", n).order("created_at", { ascending: false }),
    supabase.from("stock_txns").select("grn_no, created_at, qty, rate, site_id, sites(name), po_id").eq("txn_type", "grn").or(`supplier.ilike.${n},vendor.ilike.${n}`).not("grn_no", "is", null),
    supabase.from("delivery_challans").select("id, dc_ref, dc_date, status, grn_no, sites(name)").ilike("vendor_name", n).order("dc_date", { ascending: false }),
    supabase.from("expenses").select("id, voucher_no, expense_date, amount, status, payment_status, paid_on, sites(name)").eq("is_vendor_direct", true).ilike("paid_to", n).order("expense_date", { ascending: false }),
    supabase.from("vendors").select("id, name, gstin, contact_name, mobile, is_active").ilike("name", n).limit(1),
  ]);
  const grns = {}; (txns || []).forEach(t => { const g = grns[t.grn_no] = grns[t.grn_no] || { grn_no: t.grn_no, at: t.created_at, site: t.sites?.name || "", lines: 0, value: 0, po_id: t.po_id }; g.lines++; g.value += Number(t.qty || 0) * Number(t.rate || 0); if (t.created_at < g.at) g.at = t.created_at; });
  const livePos = (pos || []).filter(p => p.status !== "cancelled");
  const totalValue = livePos.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const paid = (pays || []).filter(x => x.payment_status === "paid" && x.status !== "rejected").reduce((s, x) => s + Number(x.amount || 0), 0);
  const act = [];
  (pos || []).forEach(p => act.push({ kind: "po", id: p.id, ref: p.po_no, at: p.created_at, text: `${p.po_no} ${p.status === "cancelled" ? "cancelled" : p.approval_status === "approved" ? "approved" : p.approval_status === "rejected" ? "rejected" : "raised · awaiting approval"}`, sub: `${p.sites?.name || ""} · ₹${Number(p.total_amount || 0).toLocaleString("en-IN")}${p.approver?.full_name ? " · " + p.approver.full_name : ""}` }));
  Object.values(grns).forEach(g => act.push({ kind: "grn", id: g.grn_no, ref: g.grn_no, at: g.at, text: `${g.grn_no} received`, sub: `${g.site} · ${g.lines} line(s)${g.value ? " · ₹" + Math.round(g.value).toLocaleString("en-IN") : ""}` }));
  (dcs || []).forEach(d => act.push({ kind: "dc", id: d.id, ref: d.dc_ref, at: d.dc_date, text: `${d.dc_ref} challan ${d.status === "cancelled" ? "cancelled" : d.grn_no ? "converted → " + d.grn_no : "recorded"}`, sub: d.sites?.name || "" }));
  (pays || []).forEach(x => act.push({ kind: "pay", id: x.id, ref: x.voucher_no, at: x.paid_on || x.expense_date, text: `${x.voucher_no || "Voucher"} ${x.payment_status === "paid" ? "paid" : x.status === "approved" ? "approved · payment pending" : x.status}`, sub: `${x.sites?.name || ""} · ₹${Number(x.amount || 0).toLocaleString("en-IN")}` }));
  act.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { name: n, vendor: (vend && vend[0]) || null, totalPos: livePos.length, totalValue, paid, outstanding: Math.max(totalValue - paid, 0), grnCount: Object.keys(grns).length, dcCount: (dcs || []).length, activity: act };
}
