"use client";
// update186: verification now lives inside Daily Muster (per-row ✓ Verify, + OT, Verify all).
import { useEffect } from "react";
export default function VerifyRedirect() {
  useEffect(() => { window.location.replace("/m/muster"); }, []);
  return <div className="m-wrap"><div className="m-body muted">Opening Daily muster…</div></div>;
}
