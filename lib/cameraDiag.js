"use client";
// update481: the selfie camera — one place that starts it (from the tap, with a 5 s timeout and fallbacks) and
// records what happened, so the IT screen can see WHY a phone shows no preview. Nothing here touches punch / GPS /
// verification logic; it only hands a MediaStream (or a typed error) to CameraCapture.
import { supabase, isDemo } from "./supabase";

export const CAMERA_TIMEOUT_MS = 5000;
export const APP_VERSION = "v483";

/** what we know about this phone / browser (no personal data) */
export function cameraEnv() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const inApp = /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Telegram|Line\/|Snapchat|TikTok|BytedanceWebview/i.test(ua) ? (ua.match(/WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Telegram|Line\/|Snapchat|TikTok/i) || [""])[0] : "";
  const webview = /; wv\)|WebView|Version\/[\d.]+ Chrome\/[\d.]+ Mobile/i.test(ua) && !/EdgA|SamsungBrowser/i.test(ua) ? (/; wv\)/.test(ua) ? "android-webview" : "") : "";
  const chrome = (ua.match(/(?:Chrome|CriOS)\/(\d+)/) || [])[1] || "";
  const os = (ua.match(/Android [\d.]+|iPhone OS [\d_]+|iPad; CPU OS [\d_]+|Windows NT [\d.]+|Mac OS X [\d_]+/) || [""])[0].replace(/_/g, ".");
  const model = (ua.match(/Android [\d.]+; ([^;)]+)/) || [])[1] || (/iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : "");
  const standalone = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true);
  return { ua, in_app: inApp, webview, chrome, os, model, standalone: !!standalone, secure: typeof window !== "undefined" ? !!window.isSecureContext : null, media_devices: typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function" };
}
export async function cameraPermissionState() {
  try { if (!navigator.permissions?.query) return "unsupported"; const p = await navigator.permissions.query({ name: "camera" }); return p.state || "unsupported"; } catch { return "unsupported"; }
}
const withTimeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(Object.assign(new Error("Camera did not start within " + ms / 1000 + " s"), { name: "TimeoutError" })), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });

/**
 * Start the camera. Call this DIRECTLY in the tap handler (user gesture) and pass the promise to CameraCapture.
 * update483: getUserMedia is the FIRST thing called, synchronously, inside the tap — no permission query or any
 * other await before it (the permission state is read afterwards, only for the IT log). Fallback chain on
 * "constraint" errors only: facingMode (ideal) → no facingMode → any camera. NotAllowed / NotFound reject at once
 * so the caller can open the phone's own camera while the tap is still a user gesture.
 * Resolves { stream, meta } · rejects an Error with .name (NotAllowedError, NotFoundError, NotReadableError,
 * OverconstrainedError, SecurityError, TimeoutError, NoCameraApi) — the attempt is logged either way.
 * opts.t0 = performance.now() at the tap, opts.attemptId ties the log rows of one punch together.
 */
const CONSTRAINTS = f => [["facing", { video: { facingMode: { ideal: f }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }], ["no-facing", { video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }], ["any", { video: true, audio: false }]];
export const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
export function startCamera(facing = "user", { kind = "punch", userId = null, workerId = null, timeoutMs = CAMERA_TIMEOUT_MS, t0 = null, attemptId = null } = {}) {
  const tap = t0 == null ? nowMs() : t0;
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
  const tries = CONSTRAINTS(facing);
  let first = null, firstErr = null;
  // the call itself — synchronous, first statement that touches the camera
  if (md && typeof md.getUserMedia === "function") { try { first = md.getUserMedia(tries[0][1]); } catch (e) { firstErr = e; } }
  const env = cameraEnv();
  const base = { kind, user_id: userId, worker_id: workerId, app_version: APP_VERSION, ...env, facing, path: "live", attempt_id: attemptId };
  const logErr = (e) => {
    const ms = Math.round(nowMs() - tap); const name = e?.name || "Error";
    // permission state only AFTER the failure, in the background, for the log — never before getUserMedia
    setTimeout(() => cameraPermissionState().then(perm => logCameraAttempt({ ...base, permission: perm, result: name === "TimeoutError" ? "timeout" : "error", error_name: name, error_message: String(e?.message || e).slice(0, 300), start_ms: ms })), 0);   // after the caller's fallback click
  };
  if (!first) {
    const e = firstErr || Object.assign(new Error("navigator.mediaDevices.getUserMedia is not available (http page or very old browser)"), { name: "NoCameraApi" });
    logErr(e); return Promise.reject(e);
  }
  const left = () => { const r = timeoutMs - (nowMs() - tap); return r > 1000 ? r : 1000; };
  return (async () => {
    let stream = null, lastErr = null, used = "";
    for (let i = 0; i < tries.length; i++) {
      try { stream = await withTimeout(i === 0 ? first : md.getUserMedia(tries[i][1]), left()); used = tries[i][0]; break; }
      catch (e) { lastErr = e; if (!/OverconstrainedError|ConstraintNotSatisfiedError/.test(e?.name || "")) break; }   // only constraint errors try the next set
    }
    if (!stream) { const e = lastErr || new Error("Camera did not start"); logErr(e); throw e; }
    const ms = Math.round(nowMs() - tap);
    logCameraAttempt({ ...base, permission: "granted", result: "started", error_name: null, error_message: used === "facing" ? null : "fallback: " + used, start_ms: ms, t_open_ms: ms });
    return { stream, meta: { ...base, start_ms: ms, fallback: used } };
  })();
}

/** update483: errors where the phone's own camera app is opened instead (hidden capture input) */
export const isBlockedCameraError = e => /^(NotAllowedError|PermissionDeniedError|NotFoundError|DevicesNotFoundError|SecurityError|NoCameraApi)$/.test(e?.name || "");
/** true when a programmatic input.click() would still be allowed (transient user activation). Unknown → true. */
export const hasUserActivation = () => { try { const ua = navigator.userActivation; return ua ? !!ua.isActive : true; } catch { return true; } };
/** update483: freshness of a photo from the phone's camera app — synchronous, no network, no file read */
export const FALLBACK_MAX_AGE_MS = 120000;
export function photoAgeMs(file, now = Date.now()) { const lm = Number(file?.lastModified); return lm > 0 ? now - lm : Infinity; }
export const newAttemptId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** fire-and-forget; never throws, never blocks the punch */
export function logCameraAttempt(rec) {
  if (isDemo) return;
  try {
    const row = { p: { kind: rec.kind, user_id: rec.user_id, worker_id: rec.worker_id, app_version: rec.app_version, user_agent: String(rec.ua || "").slice(0, 400), in_app: rec.in_app || null, webview: rec.webview || null, chrome_version: rec.chrome || null, os_version: rec.os || null, device_model: rec.model || null, standalone: !!rec.standalone, secure_context: rec.secure, permission_state: rec.permission, media_devices: !!rec.media_devices, facing: rec.facing, result: rec.result, error_name: rec.error_name, error_message: rec.error_message, start_ms: rec.start_ms,
      path: rec.path || null, attempt_id: rec.attempt_id || null, t_open_ms: rec.t_open_ms ?? null, t_confirm_ms: rec.t_confirm_ms ?? null } };
    supabase.rpc("fn_camera_log", row).then(() => {}, () => {});
  } catch {}
}
/** update483: one timing row (fallback_opened / fallback_stale / punch_confirmed) — fire-and-forget */
export function logCameraEvent({ kind = "punch", userId = null, workerId = null, facing = "user", path, attemptId, result, tOpen = null, tConfirm = null, note = null }) {
  logCameraAttempt({ kind, user_id: userId, worker_id: workerId, app_version: APP_VERSION, ...cameraEnv(), permission: null, facing, path, attempt_id: attemptId, result, error_name: null, error_message: note, start_ms: tOpen, t_open_ms: tOpen, t_confirm_ms: tConfirm });
}
export const stopStream = s => { try { s?.getTracks().forEach(t => t.stop()); } catch {} };

/** user-facing guidance per error (English; the punch screen's language strings are not touched) */
export function cameraErrorHelp(e, env = cameraEnv()) {
  const n = e?.name || "";
  if (n === "NotAllowedError" || n === "PermissionDeniedError" || n === "SecurityError") return {
    title: "Camera is blocked for this site",
    steps: env.in_app ? [`You are inside ${env.in_app}'s browser, which often blocks the camera.`, "Tap the ⋮ menu → Open in Chrome, then punch again."] :
      /iPhone|iPad/.test(env.os) ? ["Open iPhone Settings → Safari (or Chrome) → Camera → Allow.", "Or tap the AA / lock icon in the address bar → Website Settings → Camera → Allow.", "Come back here and tap Try again."] :
      ["Tap the lock icon (🔒) next to the address bar.", "Tap Permissions → Camera → Allow (if Camera is not listed, tap Reset permissions).", "Come back here and tap Try again."] };
  if (n === "NotFoundError" || n === "OverconstrainedError" || n === "DevicesNotFoundError") return { title: "No camera could be opened", steps: ["Close other apps using the camera (WhatsApp video, camera app) and tap Try again.", "If this phone has no working front camera, punch from another phone or ask the supervisor for a proxy punch."] };
  if (n === "NotReadableError" || n === "TrackStartError" || n === "AbortError") return { title: "The camera is busy or did not respond", steps: ["Another app is using the camera. Close it (or restart the phone) and tap Try again."] };
  if (n === "TimeoutError") return { title: "The camera did not start in 5 seconds", steps: ["Tap Try again.", "If it keeps happening: close other apps, free some memory, or update Chrome from the Play Store."] };
  if (n === "NoCameraApi") return { title: "This browser cannot open the camera", steps: [env.secure === false ? "The page is not on https — open the app from its proper link." : "Update Chrome from the Play Store, or open the app in Chrome instead of this browser."] };
  return { title: "Could not start the camera", steps: ["Tap Try again. If it keeps failing, screenshot this box and send it to IT.", String(e?.message || e).slice(0, 160)] };
}
