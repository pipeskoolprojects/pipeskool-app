// update421: /api/ai/bill — vendor bill upload → OCR (Groq vision for images; Anthropic for PDF when key present)
// → Bill ↔ PO ↔ GRN 3-way match → stored in vendor_bills with uploaded_by (from the JWT). Read-only on ERP tables.
import { createClient } from "@supabase/supabase-js";
const VISION = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const PROMPT = `This is a vendor's tax invoice/bill for a plumbing contractor in India. Return ONLY strict JSON, no markdown:
{"vendor":string,"gstin":string,"invoice_no":string,"invoice_date":"YYYY-MM-DD" or "","po_no":string,"lines":[{"item":string,"qty":number,"unit":string,"rate":number,"gst_pct":number,"amount":number}],"subtotal":number,"discount":number,"gst_amount":number,"total":number}
Use 0 or "" when unreadable. Rates are per unit before GST.`;
const bigrams = t => { const x = ` ${String(t).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()} `; const b = new Set(); for (let i = 0; i < x.length - 1; i++) b.add(x.slice(i, i + 2)); return b; };
const sim = (a, b) => { const A = bigrams(a), B = bigrams(b); let n = 0; A.forEach(g => { if (B.has(g)) n++; }); return (2 * n) / (A.size + B.size || 1); };

async function ocr(base64, mime) {
  if (mime === "application/pdf") {
    const key = process.env.ANTHROPIC_API_KEY; if (!key) return { error: "PDF reading needs ANTHROPIC_API_KEY on the server — upload a JPG/PNG photo of the bill for now." };
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }, { type: "text", text: PROMPT }] }] }) });
    const j = await r.json(); const text = (j.content || []).map(c => c.text || "").join(""); return JSON.parse(text.replace(/```json|```/g, "").trim());
  }
  const key = process.env.GROQ_API_KEY; if (!key) return { error: "no_key" };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ model: VISION, temperature: 0, max_tokens: 1500, messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } }] }] }) });
  const j = await r.json(); if (!r.ok) return { error: j?.error?.message || "OCR failed" };
  const text = j?.choices?.[0]?.message?.content || ""; try { return JSON.parse(text.replace(/```json|```/g, "").trim()); } catch { return { error: "Could not read the bill clearly — try a sharper photo." }; }
}

export async function POST(req) {
  const t0 = Date.now();
  try {
    const auth = req.headers.get("authorization") || ""; const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return Response.json({ ok: false, error: "Login required." }, { status: 401 });
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: ud } = await sb.auth.getUser(token); const user = ud?.user; if (!user) return Response.json({ ok: false, error: "Login required." }, { status: 401 });
    const { data: me } = await sb.from("app_users").select("id, full_name").eq("auth_id", user.id).maybeSingle();
    const { file_name, mime, data_base64, po_hint, file_path } = await req.json();
    if (!data_base64) return Response.json({ ok: false, error: "No file received." });
    console.log("BILL_UPLOAD_STARTED", JSON.stringify({ mime, kb: Math.round(data_base64.length * 0.75 / 1024) }));
    const x = await ocr(data_base64, mime || "image/jpeg");
    if (x.error) { console.warn("BILL_OCR_FAILED", JSON.stringify({ error: String(x.error).slice(0, 120) })); return Response.json({ ok: false, error: x.error === "no_key" ? "AI service not configured." : x.error }); }
    // ---- find the PO: OCR po_no → hint → vendor + nearest date
    const sites = (await sb.from("sites").select("id, name")).data || []; const sname = id => sites.find(s2 => s2.id === id)?.name || "";
    let po = null; const key = String(x.po_no || po_hint || "").replace(/\s+/g, "").toUpperCase();
    if (key) { const tail = key.split("/").pop(); const { data: h } = await sb.from("purchase_orders").select("id, po_no, vendor_name, site_id, created_at, total_amount, approval_status, po_items(id, item_id, item_name, qty, unit, rate, gst_pct, returned_qty)").or(`po_no.ilike.%${key}%,po_no.ilike.%/${tail}`).neq("status", "cancelled").limit(5); po = (h || []).find(p => p.po_no.toUpperCase() === key) || ((h || []).length === 1 ? h[0] : null); }
    if (!po && x.vendor) { const { data: h } = await sb.from("purchase_orders").select("id, po_no, vendor_name, site_id, created_at, total_amount, approval_status, po_items(id, item_id, item_name, qty, unit, rate, gst_pct, returned_qty)").neq("status", "cancelled").order("created_at", { ascending: false }).limit(300); const cand = (h || []).filter(p => sim(x.vendor, p.vendor_name) >= 0.5); if (cand.length) { const inv = x.invoice_date ? new Date(x.invoice_date) : null; cand.sort((p, q) => inv ? Math.abs(new Date(p.created_at) - inv) - Math.abs(new Date(q.created_at) - inv) : 0); po = cand[0]; } }
    // ---- GRN quantities for the PO (ledger rows by po_id or GRN header)
    let recv = {}; if (po) {
      const { data: hdr } = await sb.from("grn_headers").select("grn_no").eq("po_id", po.id).neq("status", "cancelled"); const nos = (hdr || []).map(h => h.grn_no);
      let q = sb.from("stock_txns").select("item_id, qty, po_id, grn_no").eq("txn_type", "grn"); q = nos.length ? q.or(`po_id.eq.${po.id},grn_no.in.(${nos.map(n => '"' + n + '"').join(",")})`) : q.eq("po_id", po.id);
      ((await q).data || []).forEach(t => { recv[t.item_id] = (recv[t.item_id] || 0) + Number(t.qty || 0); });
    }
    // ---- 3-way match
    const issues = []; const lines = [];
    if (!po) issues.push("No matching PO found (no PO number on the bill and no vendor/date match).");
    (x.lines || []).forEach(bl => {
      const pl = po ? (po.po_items || []).map(p => ({ p, s: sim(bl.item, p.item_name) })).sort((a, b) => b.s - a.s)[0] : null;
      const m = pl && pl.s >= 0.4 ? pl.p : null;
      const row = { bill_item: bl.item, bill_qty: Number(bl.qty || 0), bill_rate: Number(bl.rate || 0), po_item: m?.item_name || null, po_qty: m ? Number(m.qty) - Number(m.returned_qty || 0) : null, po_rate: m ? Number(m.rate || 0) : null, grn_qty: m ? (recv[m.item_id] || 0) : null, issues: [] };
      if (!m) row.issues.push("not on PO");
      else { if (row.bill_qty > row.grn_qty + 1e-6) row.issues.push(`${(row.bill_qty - row.grn_qty)} qty not yet received (GRN ${row.grn_qty})`); if (row.bill_qty > row.po_qty + 1e-6) row.issues.push(`bill qty ${row.bill_qty} > PO qty ${row.po_qty}`); if (row.po_rate && Math.abs(row.bill_rate - row.po_rate) > 0.5) row.issues.push(`₹${(row.bill_rate - row.po_rate).toFixed(2)} rate difference (PO ₹${row.po_rate})`); }
      row.ok = row.issues.length === 0; row.issues.forEach(f => issues.push(`${bl.item}: ${f}`)); lines.push(row);
    });
    if (po && x.gstin) { const { data: v } = await sb.from("vendors").select("gstin").ilike("name", po.vendor_name).maybeSingle(); if (v?.gstin && v.gstin.toUpperCase() !== String(x.gstin).toUpperCase()) issues.push(`GSTIN on bill (${x.gstin}) differs from Vendor Master (${v.gstin})`); }
    const status = !po ? "no_po" : issues.length ? "mismatch" : "matched"; const eligible = status === "matched";
    // ---- store file + record (uploaded_by = the logged-in user)
    const path = file_path || null;   // update423: the browser uploads the file to the vendor-bills bucket itself; the server only reads it
    const rec = { file_name: file_name || "bill", file_path: path, mime, uploaded_by: me?.id || null, uploaded_by_name: me?.full_name || user.email || "", vendor_name: x.vendor || null, vendor_gstin: x.gstin || null, invoice_no: x.invoice_no || null, invoice_date: /^\d{4}-\d{2}-\d{2}$/.test(x.invoice_date || "") ? x.invoice_date : null, po_no: po?.po_no || x.po_no || null, po_id: po?.id || null, subtotal: Number(x.subtotal || 0), gst_amount: Number(x.gst_amount || 0), discount: Number(x.discount || 0), total: Number(x.total || 0), lines: x.lines || [], match: { status, issues, lines }, match_status: status, payment_eligible: eligible };
    const { data: saved, error: ie } = await sb.from("vendor_bills").insert(rec).select("id, uploaded_at").single();
    if (ie) console.warn("BILL_SAVE_FAILED", JSON.stringify({ error: ie.message.slice(0, 120) }));
    console.log("BILL_MATCH_DONE", JSON.stringify({ status, issues: issues.length, po: !!po, ms: Date.now() - t0 }));
    const verdict = status === "matched" ? "✅ MATCHED — payment eligible" : status === "no_po" ? "⚠ NO PO FOUND — payment not eligible" : `❌ PAYMENT NOT ELIGIBLE — ${issues.length} mismatch(es)`;
    const bill = { id: saved?.id || null, file_name: rec.file_name, uploaded_by: rec.uploaded_by_name, uploaded_at: saved?.uploaded_at || new Date().toISOString(), vendor: rec.vendor_name || "—", gstin: rec.vendor_gstin || "", invoice_no: rec.invoice_no || "—", invoice_date: rec.invoice_date || "", total: rec.total, po_no: po?.po_no || null, site: po ? sname(po.site_id) : "", status, verdict, lines, issues, saved: !ie, save_error: ie ? "not saved — run pipeskool_vendor_bills.sql (update 421)" : null };
    const dataset = lines.length ? { title: `Bill match · ${bill.invoice_no}`, filters: `PO ${bill.po_no || "—"} · ${bill.vendor}`, columns: ["Bill item", "Bill qty", "Bill rate", "PO item", "PO qty", "PO rate", "GRN qty", "OK", "Issues"], rows: lines.map(l => [l.bill_item, l.bill_qty, l.bill_rate, l.po_item || "", l.po_qty ?? "", l.po_rate ?? "", l.grn_qty ?? "", l.ok ? "Yes" : "No", l.issues.join("; ")]) } : null;
    return Response.json({ ok: true, bill, dataset });
  } catch (e) {
    console.error("BILL_FAILED", JSON.stringify({ error: (e.message || String(e)).slice(0, 160) }));
    return Response.json({ ok: false, error: "Could not process the bill. Please try again with a clearer image." });
  }
}
