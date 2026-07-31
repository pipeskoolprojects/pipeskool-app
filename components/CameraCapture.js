"use client";
// Live camera capture — update129.
// Opens the device camera INSIDE the page and returns a photo taken from the
// live stream. There is deliberately no file-picker fallback: this exists to
// guarantee punch/proxy photos are taken right now, not chosen from a gallery.
import { useEffect, useRef, useState } from "react";

export default function CameraCapture({ facing = "user", title = "Take selfie", onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no-camera-api");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
        });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setReady(true);
      } catch (e) {
        setErr(e.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in the browser and try again."
          : "No camera available on this device. Punching needs a live camera.");
      }
    })();
    return () => { alive = false; streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [facing]);

  function shoot() {
    const v = videoRef.current; if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth || 1280; c.height = v.videoHeight || 960;
    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
    c.toBlob(b => {
      if (!b) { setErr("Could not capture the photo. Try again."); return; }
      streamRef.current?.getTracks().forEach(t => t.stop());
      onCapture(new File([b], `capture_${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.85);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,12,16,.92)", zIndex: 200,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ color: "#fff", fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {err ? (
        <div style={{ background: "#fff", borderRadius: 12, padding: 16, maxWidth: 340, textAlign: "center" }}>
          <div style={{ color: "var(--red)", fontSize: 13.5, marginBottom: 10 }}>{err}</div>
          <button onClick={onCancel}>Close</button>
        </div>
      ) : (
        <>
          <video ref={videoRef} playsInline muted
            style={{ width: "min(92vw, 420px)", borderRadius: 14, transform: facing === "user" ? "scaleX(-1)" : "none" }} />
          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button className="primary" style={{ fontSize: 15, padding: "10px 26px" }} disabled={!ready} onClick={shoot}>📷 Capture</button>
            <button style={{ fontSize: 15 }} onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  );
}
