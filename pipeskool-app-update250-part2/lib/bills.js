// lib/bills.js — update159: bill file preview & download (images + PDF)
import { supabase } from "./supabase";

export function billUrl(path, download) {
  if (!path) return null;
  if (String(path).startsWith("http")) return path;
  try {
    const { data } = supabase.storage.from("attendance-photos")
      .getPublicUrl(path, download ? { download: true } : undefined);
    return data.publicUrl;
  } catch { return null; }
}

export const isPdf = path => /\.pdf($|\?)/i.test(String(path || ""));
