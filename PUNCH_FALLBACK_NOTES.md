# Update 483: punch selfie fallback when the camera is denied or missing

Only the failure path changed. The live-selfie screen, its text, its steps and the punch, GPS and verification logic are the same as before.

## What happens now

| Situation | Before (v481) | Now (v483) |
|---|---|---|
| Camera allowed | Live selfie screen, then Capture, then punch | Same. Unchanged. |
| Camera denied or blocked (`NotAllowedError` / `PermissionDeniedError`) | "Camera is blocked" card. The worker was stuck there. | The phone's own camera app opens straight from the Punch tap. There is no extra screen. The photo is taken, then the punch goes through. |
| No camera found (`NotFoundError`) | "No camera could be opened" card | The phone's camera app opens. |
| No camera API (old browser, http page, some in-app browsers) | "This browser cannot open the camera" card | The phone's camera app opens. |
| Denial arrives more than about 5 s after the tap (the browser no longer allows an automatic open) | Card | The same card as before. Its **Try again** tap opens the phone's camera app. |
| Camera busy or timed out | Card with Try again | Unchanged |

## How it works (`app/m/page.js`, `lib/cameraDiag.js`, `components/CameraCapture.js`)

- `startCamera()` calls `getUserMedia` as its first statement, synchronously, inside the tap. Nothing is awaited before it.
- The browser's permission query is no longer read before `getUserMedia`. It is read only after a failure, in the background, for the IT log. Later punches have no pre-check either.
- The rejection handler is attached in the same tap. It calls `.click()` on a hidden `<input type="file" accept="image/*" capture="user">`. There is no `setTimeout`, no await and no spinner screen in between.
  - Measured from tap to the camera app being requested: about 9 ms normally, about 40 ms with the CPU slowed 4×, and about 56 ms with it slowed 6×.
- The photo goes through the same `punch()` call, the same upload to `attendance-photos/selfies/…jpg` and the same `fn_worker_punch`. It is uploaded byte-for-byte, with no resizing or compression.
- **Freshness:** the photo is rejected if `file.lastModified` is older than 2 minutes. The message reads "This photo is older than 2 minutes. Tap the punch button again and take a new selfie." It is a synchronous read with no network call and no file read.
- Proxy and muster screens are not changed. They keep the live camera only.

## Timing (IT / Director: `/it/camera-log`)

- New log rows:
  - `started`: path `live`, tap to stream ready.
  - `fallback_opened`: tap to camera app requested.
  - `fallback_stale`: photo too old.
  - `punch_confirmed`: tap to the server confirming the punch, for both paths.
- One `attempt_id` ties the rows of a tap together.
- A new "Punch timing" panel shows the average, median and count for each measure, live and fallback.
- Nothing is added to the worker screen.

## SQL

- `pipeskool_punch_selfie_fallback.sql` adds 4 columns to `punch_camera_log`: `path`, `attempt_id`, `t_open_ms` and `t_confirm_ms`. It also updates `fn_camera_log`.
- It is additive and safe to re-run. It has already been applied live, so there is nothing to run.

## Limits to know

- **Browser reach:** a web page cannot open the camera app without a tap. If the browser's tap window has passed, the worker taps Try again once.
- **Gallery photos:** on some phones, `capture` still shows a chooser with camera and gallery options. A gallery photo is rejected by the 2-minute check on Android. An iPhone gallery pick can carry the current time, so a recent gallery photo there could pass.
- **Photo size:** a camera-app photo is the phone's full size, often 2 to 6 MB, compared with about 200 KB from the live camera. This is because nothing is compressed, as asked. On a weak network the upload takes longer.
- **Testing:** tested in Chromium with the camera denied, missing or absent, and with the CPU slowed to stand in for a mid-range phone. It has not been tested on a real Android phone.

## Tests

- `tests/e2e-punch-fallback.playwright.js`: 43 checks. The update 481 camera suite passes 22/22, and `npm test` passes.
- `tests/perf-punch-fallback.playwright.js`: timing under CPU slowdown.
