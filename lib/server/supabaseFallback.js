// update460: serve a file from Supabase Storage — used (a) in rollback mode (FILE_BACKEND=supabase) and (b) while
// FILE_FALLBACK is on, for a file that has not reached R2 yet (uploaded between the bulk copy and the switch-over).
// Key = the stored path. grn/ files may live in the private grn-docs bucket (signed link) or the public bucket.
const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE = () => process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const enc = k => String(k).split("/").map(encodeURIComponent).join("/");
export async function supabaseUrl(key, { download = false, name = "" } = {}) {
  const dl = download ? `download=${encodeURIComponent(name || "")}` : "";
  if (String(key).startsWith("grn/") && SERVICE()) {
    const r = await fetch(`${SB()}/storage/v1/object/sign/grn-docs/${enc(key)}`, { method: "POST", cache: "no-store",
      headers: { apikey: SERVICE(), authorization: `Bearer ${SERVICE()}`, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 300 }) });
    if (r.ok) { const j = await r.json(); const p = j.signedURL || j.signedUrl; if (p) return `${SB()}/storage/v1${p.startsWith("/") ? p : "/" + p}${dl ? "&" + dl : ""}`; }
  }
  return `${SB()}/storage/v1/object/public/attendance-photos/${enc(key)}${dl ? "?" + dl : ""}`;
}
