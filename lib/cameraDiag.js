"use client";
// update481: the selfie camera — one place that starts it (from the tap, with a 5 s timeout and fallbacks) and
// records what happened, so the IT screen can see WHY a phone shows no preview. Nothing here touches punch / GPS /
// verification logic; it only hands a MediaStream (or a typed error) to CameraCapture.
import { supabase, isDemo } from "./supabase";

export const CAMERA_TIMEOUT_MS = 5000;
export const APP_VERSION = "v481";

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
 * Fallback chain: facingMode (ideal) → no facingMode → any camera. Always resolves or rejects within the timeout.
 * Resolves { stream, meta } · rejects an Error with .name (NotAllowedError, NotFoundError, NotReadableError,
 * OverconstrainedError, SecurityError, TimeoutError, NoCameraApi) — the attempt is logged either way.
 */
export async function startCamera(facing = "user", { kind = "punch", userId = null, workerId = null, timeoutMs = CAMERA_TIMEOUT_MS } = {}) {
  const t0 = Date.now(); const env = cameraEnv(); const perm = await cameraPermissionState();
  const base = { kind, user_id: userId, worker_id: workerId, app_version: APP_VERSION, ...env, permission: perm, facing };
  let stream = null, lastErr = null, used = "";
  try {
    if (!env.media_devices) throw Object.assign(new Error("navigator.mediaDevices.getUserMedia is not available (http page or very old browser)"), { name: "NoCameraApi" });
    const tries = [["facing", { video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }], ["no-facing", { video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false }], ["any", { video: true, audio: false }]];
    for (const [label, c] of tries) {
      try { stream = await withTimeout(navigator.mediaDevices.getUserMedia(c), timeoutMs - (Date.now() - t0) > 1000 ? timeoutMs - (Date.now() - t0) : 1000); used = label; break; }
      catch (e) { lastErr = e; if (!/NotFoundError|OverconstrainedError|DevicesNotFoundError|ConstraintNotSatisfiedError/.test(e?.name || "")) break; }   // only "no such camera" errors fall through to the next try
    }
    if (!stream) throw lastErr || new Error("Camera did not start");
    const ms = Date.now() - t0;
    logCameraAttempt({ ...base, result: "started", error_name: null, error_message: used === "facing" ? null : "fallback: " + used, start_ms: ms });
    return { stream, meta: { ...base, start_ms: ms, fallback: used } };
  } catch (e) {
    const ms = Date.now() - t0; const name = e?.name || "Error";
    logCameraAttempt({ ...base, result: name === "TimeoutError" ? "timeout" : "error", error_name: name, error_message: String(e?.message || e).slice(0, 300), start_ms: ms });
    throw e;
  }
}

/** fire-and-forget; never throws, never blocks the punch */
export function logCameraAttempt(rec) {
  if (isDemo) return;
  try {
    const row = { p: { kind: rec.kind, user_id: rec.user_id, worker_id: rec.worker_id, app_version: rec.app_version, user_agent: String(rec.ua || "").slice(0, 400), in_app: rec.in_app || null, webview: rec.webview || null, chrome_version: rec.chrome || null, os_version: rec.os || null, device_model: rec.model || null, standalone: !!rec.standalone, secure_context: rec.secure, permission_state: rec.permission, media_devices: !!rec.media_devices, facing: rec.facing, result: rec.result, error_name: rec.error_name, error_message: rec.error_message, start_ms: rec.start_ms } };
    supabase.rpc("fn_camera_log", row).then(() => {}, () => {});
  } catch {}
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
