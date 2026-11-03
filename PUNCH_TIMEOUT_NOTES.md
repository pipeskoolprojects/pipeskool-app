# Update 488: punch selfie when the camera never starts ("The camera did not start in 5 seconds")

## What the IT camera log showed
- Abhinash Shastri (Android 10, Chrome 136, installed app) hit 6 timeouts between 28 and 30 Oct. The camera never started once.
- Every time, camera permission was still "prompt". The phone's "Allow camera?" question was never answered, most likely because it never appeared in the installed-app window.
- Update 483 opened the phone's camera app only when the camera was blocked or missing. A timeout showed just "Try again", which hit the same wall every time.
- A second bug: a camera stream that arrived after the 5 s limit was never switched off. That kept the camera busy, so Try again could time out too.

## What changed (`lib/cameraDiag.js`, `components/CameraCapture.js`)
- **Waiting while the phone asks.** While the phone is still asking for permission, the app waits up to 15 s instead of 5 s. The permission state is read *after* getUserMedia, never before it, which is the update 483 rule.
- **Early fallback.** After 3 s of "Starting camera…", the punch screen shows **Use phone camera instead**.
- **Error card.** The card now has **📷 Open phone camera** as its main button, with Try again and Cancel beside it.
  - When the permission was never given, the card says so and tells the user where to allow it: Chrome site settings, and Android → Apps → Chrome → Camera.
- **Same punch path.** A camera-app photo goes through the same punch, upload (byte-for-byte), 2-minute freshness check and IT log (`fallback_opened`) as in update 483.
- **No leaked stream.** A stream that arrives late is stopped at once. This also applies to the muster and proxy screens.
- **Unchanged:**
  - Normal phones get no extra button when the camera opens quickly.
  - Granted but slow cameras still show the error at 5 s.
  - Muster and proxy screens get no new buttons.

## Tests
- `tests/e2e-punch-timeout.playwright.js` passes 19/19 in Chromium. Phone behaviour is simulated; no real phone was used.
- `npm test`: 52 pass and 3 fail. The same 3 fail on main because their SQL files are missing from the repo.

## SQL
None.
