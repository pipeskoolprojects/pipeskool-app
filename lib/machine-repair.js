"use client";
import { supabase, isDemo } from "./supabase";
import { fileStore, shareLink } from "./files";
import { paginateRepairMachines } from "./machine-repair-core.mjs";

export async function listRepairRequests() {
  if (isDemo) return [];
  const { data, error } = await supabase.from("v_machine_repair_requests").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  const ids = (data || []).map(r => r.id);
  if (!ids.length) return [];
  const { data: machines, error: me } = await supabase.from("machine_repair_machines").select("id,request_id,sequence_no,name,problem,photo_url,received_at").in("request_id", ids).order("sequence_no");
  if (me) throw me;
  const by = {};
  (machines || []).forEach(m => (by[m.request_id] ||= []).push(m));
  return data.map(r => ({ ...r, machines: by[r.id] || [] }));
}
export async function getRepairDetail(id) {
  const { data: req, error } = await supabase.from("v_machine_repair_requests").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!req) return null;
  const [mr, rr] = await Promise.all([
    supabase.from("machine_repair_machines").select("*,receiver:app_users!machine_repair_machines_received_by_fkey(full_name)").eq("request_id", id).order("sequence_no"),
    supabase.from("machine_repair_receipts").select("*").eq("request_id", id).order("version", { ascending: false }),
  ]);
  if (mr.error) throw mr.error;
  if (rr.error) throw rr.error;
  return { ...req, machines: mr.data || [], receipts: rr.data || [] };
}
export async function listRepairVendors() {
  const { data, error } = await supabase.from("vendors").select("id,name,contact_person,contact_mobile,email,contact,phone,is_active").eq("is_active", true).order("name").limit(500);
  if (error) throw error;
  return data || [];
}
export async function createRepairRequest(siteId, machines) {
  const { data, error } = await supabase.rpc("fn_machine_repair_create", { p_site_id: Number(siteId), p_machines: machines });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Could not create request.");
  return data;
}
export async function sendRepairRequest(requestId, vendorId, pdfBlob) {
  if (isDemo) throw new Error("Connect the app to save repair requests.");
  const key = `repairs/receipts/repair-${requestId}-${Date.now()}.pdf`;
  const { error: upErr } = await fileStore.from("attendance-photos").upload(key, pdfBlob, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error("Receipt PDF could not upload: " + upErr.message);
  const url = await shareLink(key);
  if (!url) throw new Error("PDF uploaded, but its vendor share link could not be created. Retry Send to Vendor.");
  const { data, error } = await supabase.rpc("fn_machine_repair_send", {
    p_request_id: Number(requestId), p_vendor_id: Number(vendorId), p_pdf_path: key, p_pdf_url: url,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Could not send request.");
  return { ...data, pdf_url: url, pdf_path: key };
}
export async function saveRepairReceiptVersion(requestId, pdfBlob) {
  const key = `repairs/receipts/repair-${requestId}-${Date.now()}.pdf`;
  const { error: upErr } = await fileStore.from("attendance-photos").upload(key, pdfBlob, { contentType: "application/pdf", upsert: false });
  if (upErr) throw new Error("Receipt PDF could not upload: " + upErr.message);
  const url = await shareLink(key);
  if (!url) throw new Error("PDF uploaded, but its vendor share link could not be created.");
  const { data, error } = await supabase.rpc("fn_machine_repair_receipt_version", {
    p_request_id: Number(requestId), p_pdf_path: key, p_pdf_url: url,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Could not save receipt version.");
  return { ...data, pdf_url: url, pdf_path: key };
}
export async function getRepairDashboardCount(siteId) {
  const { data, error } = await supabase.rpc("fn_machine_repair_dashboard", { p_site_id: Number(siteId) });
  if (error) throw error;
  return Number(Array.isArray(data) ? data[0]?.with_vendor : data?.with_vendor || 0);
}
export async function receiveRepairMachine(machineId, remark) {
  const { data, error } = await supabase.rpc("fn_machine_repair_receive", { p_machine_id: Number(machineId), p_remark: remark || null });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "Could not mark received.");
  return data;
}
export async function repairVendorList() {
  const { data, error } = await supabase.from("machine_repair_receipts").select("request_id,version,pdf_url,pdf_path,sent_at,generated_at");
  if (error) throw error;
  return data || [];
}
export async function makeRepairPdf(root, request) {
  if (!root) throw new Error("Receipt preview is not ready.");
  const html2pdf = (await import("html2pdf.js")).default;
  await Promise.all(Array.from(root.querySelectorAll("img")).map(img => img.decode?.().catch(() => undefined)));
  const pages = Array.from(root.querySelectorAll(".repairReceiptPage"));
  const pdf = await html2pdf().set({
    margin: 0, filename: `${request.number}-repair-receipt.pdf`,
    image: { type: "jpeg", quality: 0.96 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], before: ".repairReceiptPage:not(:first-child)" },
  }).from(root).toPdf().get("pdf");
  // Rebuild from one rendered DOM page at a time when page count differs, avoiding a split grid.
  if (pdf.internal.getNumberOfPages() !== pages.length) {
    const h2c = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");
    const exact = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    for (let i = 0; i < pages.length; i++) {
      if (i) exact.addPage("a4", "portrait");
      const canvas = await h2c(pages[i], { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      exact.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, 210, 297);
    }
    return exact.output("blob");
  }
  return pdf.output("blob");
}
export function repairPages(machines) { return paginateRepairMachines(machines, 4); }
