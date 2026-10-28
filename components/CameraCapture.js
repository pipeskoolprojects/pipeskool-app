"use client";
// Live camera capture — update129. update481: never a blank overlay.
// The stream is started by the TAP (startCamera() in the caller's click handler, passed in as `start`) so the
// browser's user-gesture rule is always met; this component only shows a state: "Starting camera…" → live
// <video autoplay playsinline muted> → or a clear error with the steps to fix it and Try again. Retries use the
// same fallback chain (facing → no facing → any camera) and re-run by themselves when the app regains focus after
// a permission error. No file-picker fallback: punch / proxy photos must be taken live.
import { useEffect, useRef, useState } from "react";
import { startCamera, stopStream, cameraErrorHelp, cameraEnv, CAMERA_TIMEOUT_MS } from "@/lib/cameraDiag";

export default function CameraCapture({ facing = "user", title = "Take selfie", onCapture, onCancel, start, diag = {} }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [state, setState] = useState("starting");   // starting | live | error
  const [err, setErr] = useState(null); const [ready, setReady] = useState(false); const [tries, setTries] = useState(0); const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(start);

  useEffect(() => {
    let alive = true; setState("starting"); setErr(null); setReady(false); setElapsed(0);
    const tick = setInterval(() => setElapsed(x => x + 1), 1000);
    const p = startRef.current || startCamera(facing, diag); startRef.current = null;   // the tap-started promise first, then our own
    p.then(async ({ stream }) => {
      if (!alive) { stopStream(stream); return; }
      streamRef.current = stream; setState("live");
      const v = videoRef.current; if (v) { v.onloadedmetadata = () => { if (alive) setReady(true); }; v.srcObject = stream; try { await v.play(); } catch {} }
      const t = stream.getVideoTracks()[0]; if (t) t.onended = () => { if (alive) { setErr(Object.assign(new Error("Camera stopped"), { name: "NotReadableError" })); setState("error"); } };
      setReady(true);
    }).catch(e => { if (!alive) return; setErr(e); setState("error"); });
    return () => { alive = false; clearInterval(tick); stopStream(streamRef.current); streamRef.current = null; };
  }, [facing, tries]);   // eslint-disable-line react-hooks/exhaustive-deps

  // after a permission error the user leaves to fix the setting — re-check when they come back
  useEffect(() => {
    if (state !== "error" || !/NotAllowedError|PermissionDeniedError|SecurityError/.test(err?.name || "")) return;
    const h = () => { if (document.visibilityState === "visible") setTries(t => t + 1); };
    document.addEventListener("visibilitychange", h); window.addEventListener("focus", h);
    return () => { document.removeEventListener("visibilitychange", h); window.removeEventListener("focus", h); };
  }, [state, err]);

  function shoot() {
    const v = videoRef.current; if (!v || !ready) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth || 1280; c.height = v.videoHeight || 960;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(b => {
      if (!b) { setErr(Object.assign(new Error("Could not capture the photo"), { name: "CaptureError" })); setState("error"); return; }
      stopStream(streamRef.current); streamRef.current = null;
      onCapture(new File([b], `capture_${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.85);
  }
  const help = state === "error" ? cameraErrorHelp(err, cameraEnv()) : null;

  return (
    <div data-cam-state={state} style={{ position: "fixed", inset: 0, background: "rgba(10,12,16,.92)", zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ color: "#fff", fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {state === "error" ? (
        <div role="alert" style={{ background: "#fff", borderRadius: 12, padding: 16, maxWidth: 360, width: "100%", color: "#111" }}>
          <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{help.title}</div>
          <ol style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.5, textAlign: "left" }}>{help.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>Error: {err?.name || "unknown"} · this attempt was reported to IT</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button type="button" className="primary" style={{ fontSize: 15, padding: "10px 22px", minHeight: 44 }} onClick={() => setTries(t => t + 1)}>Try again</button>
            <button type="button" style={{ fontSize: 15, minHeight: 44 }} onClick={onCancel}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ position: "relative", width: "min(92vw, 420px)" }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", minHeight: state === "live" ? 0 : 280, display: "block", borderRadius: 14, background: "#000", transform: facing === "user" ? "scaleX(-1)" : "none" }} />
            {state === "starting" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", gap: 10 }}>
                <div aria-hidden="true" style={{ width: 34, height: 34, border: "3px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "camspin 1s linear infinite" }} />
                <div style={{ fontSize: 14 }}>Starting camera… {elapsed > 1 ? `(${elapsed} s)` : ""}</div>
                <div style={{ fontSize: 12, opacity: .8 }}>If the phone asks, tap Allow</div>
              </div>)}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button type="button" className="primary" style={{ fontSize: 15, padding: "10px 26px", minHeight: 44, opacity: ready ? 1 : .5 }} disabled={!ready} onClick={shoot}>📷 Capture</button>
            <button type="button" style={{ fontSize: 15, minHeight: 44 }} onClick={onCancel}>Cancel</button>
          </div>
          <style>{`@keyframes camspin { to { transform: rotate(360deg) } }`}</style>
        </>
      )}
    </div>
  );
}
