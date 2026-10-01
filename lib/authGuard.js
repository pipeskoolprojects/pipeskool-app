// update451: THE ANON GUARD — no data request may leave the browser as an anonymous request while the
// app believes someone is logged in.
//
// WHY: the app keeps its own login record (psk_session) separately from the Supabase auth token. On a
// fresh page load (every open tab reloads at once after a deploy) auth-js restores the token from
// storage; if that token has EXPIRED it refreshes it, and if the refresh fails with a non-retryable
// error (token rotated by another load, revoked, not found) auth-js silently REMOVES the auth session
// (console.error only). The app still shows the user as logged in, but every query now goes out with
// the anon key — and the row-level policies answer an anonymous caller with EMPTY arrays, not errors.
// Result: "all data disappeared", fixed only by logging out and in (new tokens).
//
// HOW: every /rest/v1 and /storage/v1 request is inspected before it is sent. If the app has a login
// record but the request carries no user token (or the anon key as its bearer), the guard first tries
// ONE refresh; on success the request is re-signed with the new token and goes out normally; on failure
// the request is refused with a readable error and the app is told the sign-in was lost (banner →
// login). Auth endpoints are never gated (they are what the recovery calls).
//
// Pure function so it can be unit-tested without a browser: makeGuardedFetch({ baseFetch, anonKey,
// hasAppSession, recover, onLost }).

export const AUTH_LOST_EVENT = "psk-auth-lost";
export const AUTH_LOST_MESSAGE = "Your sign-in has expired on this device — please log in again. (Nothing was lost: the data is on the server; this device just needs a fresh sign-in.)";

export function makeGuardedFetch({ baseFetch, anonKey, hasAppSession, recover, onLost }) {
  let recovering = null;   // one recovery at a time — a burst of page loaders shares it
  const recoverOnce = () => { if (!recovering) recovering = Promise.resolve().then(recover).catch(() => null).finally(() => { setTimeout(() => { recovering = null; }, 2000); }); return recovering; };

  return async function guardedFetch(input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (!/\/(rest|storage)\/v1\//.test(url)) return baseFetch(input, init);
    if (!hasAppSession()) return baseFetch(input, init);            // worker app / logged-out pages: untouched
    const headers = new Headers((init && init.headers) || (typeof input !== "string" && input.headers) || undefined);
    const bearer = headers.get("Authorization") || "";
    const anonymous = !bearer || bearer === "Bearer " + anonKey;
    if (!anonymous) return baseFetch(input, init);
    const session = await recoverOnce();
    if (session && session.access_token) {
      headers.set("Authorization", "Bearer " + session.access_token);
      return baseFetch(input, { ...(init || {}), headers });
    }
    try { onLost && onLost(); } catch {}
    throw new Error(AUTH_LOST_MESSAGE);
  };
}
