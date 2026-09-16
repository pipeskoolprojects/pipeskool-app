import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isDemo = !url || !key;
export const supabase = isDemo ? null : createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },   // update328: explicit — session lives in storage, refreshes itself, no URL magic
});


// update391: resolve once the auth token has been RESTORED from storage (fresh load, new
// deploy, app resumed) — one explicit refresh retry for the transient cases update328 named.
// Returns the auth session or null. Never throws, never logs anyone out.
let _ready = null;
export function authReady() {
  if (isDemo) return Promise.resolve(null);
  if (_ready) return _ready;
  _ready = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) return data.session;
      const { data: rf } = await supabase.auth.refreshSession();
      return rf?.session || null;
    } catch { return null; }
    finally { setTimeout(() => { _ready = null; }, 5000); }   // re-check on the next cold call
  })();
  return _ready;
}

// update320: fetch EVERY row of a query, 1,000 at a time — the server clamps any single
// request at 1,000 rows (even with .limit(20000)), so growing tables must be paged.
// Pass a FACTORY that builds a fresh query each call; ordering is applied for stable pages.
export async function fetchAll(makeQuery) {
  const out = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await makeQuery().range(f, f + 999);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < 1000) return { data: out, error: null };
  }
}
