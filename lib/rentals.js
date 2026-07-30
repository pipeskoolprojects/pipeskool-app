import { supabase, isDemo } from "./supabase";
export const inr = n => "₹" + Number(n || 0).toLocaleString("en-IN");

// Next rent-due date: the coming occurrence of due_day (clamped to month length).
export function nextDue(dueDay) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const mk = (y, m) => new Date(y, m, Math.min(dueDay, new Date(y, m + 1, 0).getDate()));
  let d = mk(t.getFullYear(), t.getMonth());
  if (d < t) d = mk(t.getFullYear(), t.getMonth() + 1);
  const days = Math.round((d - t) / 86400000);
  return { date: d.toLocaleDateString("en-CA"), days };
}

export async function getRentals(siteId) {
  if (isDemo) return [];
  let q = supabase.from("rentals")
    .select("id, kind, name, site_id, supplier_name, rent_amount, deposit_amount, start_date, rent_due_day, note, is_active, ended_on, sites(name), rental_docs(id)")
    .order("is_active", { ascending: false }).order("id", { ascending: false });
  if (siteId && siteId !== "all") q = q.eq("site_id", siteId);
  const { data } = await q;
  return (data || []).map(r => ({ ...r, site_name: r.sites?.name || "", docs: (r.rental_docs || []).length,
    due: r.is_active ? nextDue(r.rent_due_day) : null }));
}

export async function addRental(v) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("rentals").insert({
    kind: v.kind, name: (v.name || "").trim(), site_id: Number(v.site_id),
    supplier_name: (v.supplier_name || "").trim() || null,
    rent_amount: Number(v.rent_amount) || 0, deposit_amount: Number(v.deposit_amount) || 0,
    start_date: v.start_date, rent_due_day: Number(v.rent_due_day) || Number(String(v.start_date).slice(8, 10)),
    note: v.note || null, created_by: v.created_by || null });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Edit an existing rental's terms (rent, deposit, due day, owner, dates, note).
// Corrects rows saved with ₹0 rent during openings entry.
export async function updateRental(id, v) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("rentals").update({
    name: (v.name || "").trim(), site_id: Number(v.site_id),
    supplier_name: (v.supplier_name || "").trim() || null,
    rent_amount: Number(v.rent_amount) || 0, deposit_amount: Number(v.deposit_amount) || 0,
    start_date: v.start_date, rent_due_day: Number(v.rent_due_day) || Number(String(v.start_date).slice(8, 10)),
    note: v.note || null }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function endRental(id) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const { error } = await supabase.from("rentals")
    .update({ is_active: false, ended_on: new Date().toLocaleDateString("en-CA") }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getRentalDocs(rentalId) {
  if (isDemo) return [];
  const { data } = await supabase.from("rental_docs")
    .select("id, doc_name, file_path, uploaded_at, app_users(full_name)").eq("rental_id", rentalId).order("id");
  return (data || []).map(d => ({ id: d.id, name: d.doc_name, at: d.uploaded_at, by: d.app_users?.full_name || "",
    url: supabase.storage.from("attendance-photos").getPublicUrl(d.file_path).data.publicUrl }));
}

export async function uploadRentalDoc(rentalId, file, docName, byUser) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `rentals/${rentalId}/${Date.now()}_${(docName || file.name).replace(/[^a-zA-Z0-9._-]+/g, "_")}.${ext}`;
  const { error } = await supabase.storage.from("attendance-photos").upload(path, file, { upsert: true });
  if (error) return { ok: false, error: error.message };
  const { error: e2 } = await supabase.from("rental_docs")
    .insert({ rental_id: rentalId, doc_name: docName || file.name, file_path: path, uploaded_by: byUser || null });
  return e2 ? { ok: false, error: e2.message } : { ok: true };
}


export async function getMachineTypes() {
  if (isDemo) return [{ id: 1, name: "JCB" }, { id: 2, name: "Boom Lift" }];
  const { data } = await supabase.from("rental_machine_types").select("id, name").eq("is_active", true).order("name");
  return data || [];
}

// Case-insensitive: returns the existing type instead of creating "JCB machine" twins.
export async function addMachineType(name) {
  if (isDemo) return { ok: false, error: "Demo mode." };
  const clean = (name || "").trim().replace(/\s+/g, " ");
  if (!clean) return { ok: false, error: "Type a machine name." };
  const { data: ex } = await supabase.from("rental_machine_types").select("id, name").ilike("name", clean).limit(1);
  if (ex && ex[0]) return { ok: true, type: ex[0], existed: true };
  const { data, error } = await supabase.from("rental_machine_types").insert({ name: clean }).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, type: data };
}
