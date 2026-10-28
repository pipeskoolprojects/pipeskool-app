# Punch selfie camera — diagnostics + fixes (update 481)

Branch `fix/punch-selfie-camera` (from `main`). Only the selfie step changed; punch / GPS / verification logic is untouched.

## Why some users saw a dark overlay with no preview
`CameraCapture` started the camera in a React effect after the overlay mounted, waited for `getUserMedia` with no timeout, and
showed nothing while waiting — so any phone where the request hung (permission previously blocked, camera held by another
app, an in-app browser without the camera API, a slow start) showed exactly the screenshot: dim overlay, Capture greyed, no
message. The diagnostics table now tells us which of these each affected user hits.

## 1. Diagnostics
- `lib/cameraDiag.js` — `startCamera()` records one row per attempt through `fn_camera_log` (fire-and-forget, never blocks
  the punch): kind (punch / proxy / muster), user id, worker id, app version, user agent, in-app browser (WhatsApp /
  Facebook / Instagram / Telegram …), Android WebView, Chrome version, OS version, device model, installed (standalone),
  `isSecureContext`, `navigator.permissions` camera state (granted / prompt / denied / unsupported), `mediaDevices`
  present, result (`started` / `error` + name + message / `timeout`), time to start in ms.
- `pipeskool_camera_log.sql` — table `punch_camera_log` (read: Director / IT Executive / HO Admin only; writes only through
  the function) + `fn_camera_log`. **Applied to the live database** (0 rows until the new build is deployed).
- `/it/camera-log` — "Punch camera diagnostics" (Admin group of the Director sidebar; IT Executive and HO Admin can open
  the URL directly): filter by period, user, result and error; a pattern block that counts the failures by error,
  permission state, in-app browser, WebView, Chrome version, OS, phone model, https and camera-API presence; the full list.

## 2. Fixes in the selfie step
- The camera is requested **in the tap handler** (`startCamera()` called from Punch in / Mark present / Mark here), the
  promise is handed to `CameraCapture` — the user-gesture rule is always met. Every request has a **5 s timeout**.
- States: "Starting camera…" spinner (with the seconds and "If the phone asks, tap Allow") → live
  `<video autoplay playsinline muted>` → or an error card with the exact steps and **Try again**. Capture enables when the
  stream is live. The dim backdrop never covers the preview.
- Errors: `NotAllowedError` / `PermissionDenied` / `SecurityError` → steps for Chrome (lock icon → Permissions → Camera →
  Allow / Reset permissions), iPhone (Settings → Safari/Chrome → Camera), or "open in Chrome" when inside WhatsApp's or
  another app's browser; **re-checks by itself when the app regains focus** (visibilitychange / focus).
  `NotFoundError` / `OverconstrainedError` → retried without `facingMode`, then with any camera (the fallback is logged).
  `NotReadableError` / `AbortError` → "camera busy" steps. `TimeoutError` → 5 s message. No `mediaDevices` (http page or
  in-app browser) → update Chrome / open in Chrome. A track that ends mid-way flips to the error card instead of a frozen frame.
- Build tag on the punch screen: `Pipeskool v481`.

## Tests (Playwright, Chromium with a fake camera; `audit/punch-camera/`)
Normal phone: starting → live (autoplay/playsinline/muted, Capture enabled), one `getUserMedia` call from the tap with
`facingMode: {ideal: user}`, logged as `started` with Chrome 118 / SM-A135F / permission / secure / API / start_ms; Cancel
stops the stream. Denied: steps + Try again (second attempt logged), regaining focus re-checks. No front camera: second
call without facingMode → live, logged as "fallback: no-facing". Hanging camera: spinner, then timeout at 5.0 s with
Try again, logged as `timeout`. WhatsApp in-app browser without the camera API: "open in Chrome" guidance, logged with
`in_app = WhatsApp`, `media_devices = false`, model RMX3261. IT screen: pattern counts, 4 rows, filters by error and user,
Storekeeper refused. `npm test` 24/24. Not tested: real phones (Android Chrome, iPhone Safari, WhatsApp's browser) — the
diagnostics screen will show the real pattern after deployment.
