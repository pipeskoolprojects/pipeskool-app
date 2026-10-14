// lib/bills.js — update159: bill file preview & download (images + PDF)
import { fileHref } from "./files";   // update460: files live in Cloudflare R2 (private)

// update460: any stored value (path, legacy Supabase link, new app link) → a link that opens through the authorised
// /api/files route. Legacy full Supabase links in old rows keep working without touching the database.
export function billUrl(path, download) {
  if (!path) return null;
  try { return fileHref(path, download ? { download: true } : {}); } catch { return null; }
}

export const isPdf = path => /\.pdf($|\?)/i.test(String(path || ""));
