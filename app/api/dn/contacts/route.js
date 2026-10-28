// update480: GET ?site_id → saved contacts for the chips: staff allotted to the site (Workers & Staff Master) and the
// site's client contact (Client Master). Full numbers are returned only to staff holding challan.send; the panel masks them.
import { staffFromReq, canSend, forbid, sbGet } from "@/lib/server/dn";
export const dynamic = "force-dynamic"; export const runtime = "nodejs";
export async function GET(req) {
  try {
    const staff = await staffFromReq(req); if (!staff) return Response.json({ ok: false, code: "DN_NO_LOGIN", error: "Your login has expired — sign in again." }, { status: 401 });
    if (!(await canSend(staff))) return forbid();
    const site = Number(new URL(req.url).searchParams.get("site_id")); const out = [];
    if (site) {
      const us = await sbGet(`user_sites?select=app_users(full_name,mobile,role,is_active)&site_id=eq.${site}`);
      (us || []).map(r => r.app_users).filter(u => u && u.is_active !== false && /^[6-9]\d{9}$/.test(String(u.mobile || "").replace(/\D/g, "").slice(-10)))
        .sort((a, b) => (/supervisor|incharge/i.test(a.role) ? 0 : 1) - (/supervisor|incharge/i.test(b.role) ? 0 : 1))
        .forEach(u => out.push({ label: `${u.full_name} · ${String(u.role || "").replace(/_/g, " ")}`, mobile: String(u.mobile).replace(/\D/g, "").slice(-10) }));
      const cl = await sbGet(`delivery_challans?select=clients(contact_name,mobile)&site_id=eq.${site}&client_id=not.is.null&order=created_at.desc&limit=1`);
      const c = cl?.[0]?.clients; if (c?.mobile && /^[6-9]\d{9}$/.test(String(c.mobile).replace(/\D/g, "").slice(-10))) out.push({ label: `${c.contact_name || "Client contact"} · client`, mobile: String(c.mobile).replace(/\D/g, "").slice(-10) });
    }
    const seen = new Set(); return Response.json({ ok: true, contacts: out.filter(c => !seen.has(c.mobile) && seen.add(c.mobile)).slice(0, 8) });
  } catch (e) { console.error("DN_CONTACTS_FAILED", (e?.message || String(e)).slice(0, 160)); return Response.json({ ok: true, contacts: [] }); }
}
