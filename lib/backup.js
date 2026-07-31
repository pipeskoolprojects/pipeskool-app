// One-click Backup & Restore — update128 (Director only; enforced in the DB too)
import { supabase, isDemo } from "./supabase";

export async function listBackupTables() {
  const { data, error } = await supabase.rpc("fn_list_tables");
  if (error) throw new Error(error.message);
  return data || [];
}

// Download everything: every table, every row (paged past the 1000-row cap)
export async function buildBackup(onProgress) {
  if (isDemo) throw new Error("Demo mode has no live data.");
  const tables = await listBackupTables();
  const out = { app: "pipeskool", format: 1, taken_at: new Date().toISOString(), tables: {} };
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    onProgress?.(`Reading ${t}… (${i + 1}/${tables.length})`);
    const PAGE = 1000; let rows = [], from = 0;
    for (;;) {
      const { data, error } = await supabase.from(t).select("*").range(from, from + PAGE - 1);
      if (error) { out.tables[t] = { error: error.message, rows: [] }; break; }
      rows = rows.concat(data || []);
      if ((data || []).length < PAGE) { out.tables[t] = { rows }; break; }
      from += PAGE;
    }
  }
  return out;
}

export function downloadBackupFile(backup) {
  const name = `pipeskool_backup_${backup.taken_at.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  URL.revokeObjectURL(a.href);
  return name;
}

export function summarizeBackup(json) {
  const tables = Object.entries(json.tables || {}).map(([name, v]) => ({
    name, rows: (v.rows || []).length, error: v.error || null,
  }));
  return {
    taken_at: json.taken_at, tableCount: tables.length,
    totalRows: tables.reduce((s, t) => s + t.rows, 0), tables,
  };
}

// Restore = put back MISSING rows (never overwrites or deletes current data).
// Multiple passes so parent tables land before children (FK order resolves itself).
export async function restoreBackup(json, onProgress) {
  const entries = Object.entries(json.tables || {}).filter(([, v]) => (v.rows || []).length);
  let pending = entries.map(([name, v]) => ({ name, rows: v.rows }));
  const results = {};                       // name -> {inserted, error}
  const CHUNK = 400;
  for (let pass = 1; pass <= 4 && pending.length; pass++) {
    const next = [];
    for (const t of pending) {
      onProgress?.(`Pass ${pass}: restoring ${t.name}…`);
      let inserted = 0, failed = null;
      for (let i = 0; i < t.rows.length; i += CHUNK) {
        const { data, error } = await supabase.rpc("fn_restore_table", {
          p_table: t.name, p_rows: t.rows.slice(i, i + CHUNK),
        });
        if (error) { failed = error.message; break; }
        inserted += data || 0;
      }
      if (failed) { next.push(t); results[t.name] = { inserted, error: failed }; }
      else results[t.name] = { inserted: (results[t.name]?.inserted || 0) + inserted, error: null };
    }
    pending = next;
  }
  return results;
}
