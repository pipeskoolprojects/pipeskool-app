"use client";
// update451: shown the moment the device's sign-in is lost while the app still holds a login record
// (see lib/authGuard.js). Mounted by Sidebar (web) and MobileNav (phone), so every page has it.
import { useEffect, useState } from "react";
import { AUTH_LOST_EVENT, AUTH_LOST_MESSAGE } from "@/lib/authGuard";
import { logoutAuth } from "@/lib/auth";

export default function AuthLostBanner({ loginHref = "/login" }) {
  const [lost, setLost] = useState(false);
  useEffect(() => {
    const on = () => setLost(true);
    window.addEventListener(AUTH_LOST_EVENT, on);
    return () => window.removeEventListener(AUTH_LOST_EVENT, on);
  }, []);
  if (!lost) return null;
  return (
    <div role="alert" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 10000, background: "#b91c1c", color: "#fff", padding: "10px 14px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", boxShadow: "0 4px 14px rgba(0,0,0,0.25)", fontSize: 13.5 }}>
      <span style={{ flex: 1, minWidth: 240 }}>⚠ {AUTH_LOST_MESSAGE}</span>
      <button onClick={async () => { await logoutAuth(); window.location.assign(loginHref); }}
        style={{ background: "#fff", color: "#b91c1c", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 800, cursor: "pointer" }}>Log in again</button>
    </div>
  );
}
