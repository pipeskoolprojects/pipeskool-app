"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "@/lib/supabase";
import { findWorkerByMobile, setLocalWorker } from "@/lib/mobile";
import { isStaffMobile } from "@/lib/data";
import Logo from "@/components/Logo";

export default function MobileLogin() {
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function login(e) {
    e.preventDefault();
    setError(""); setIsStaff(false); setBusy(true);
    const w = await findWorkerByMobile(mobile.trim());
    if (!w) {
      const staff = await isStaffMobile(mobile.trim());
      setBusy(false);
      if (staff) { setIsStaff(true); return; }
      setError("Mobile number not found. Ask your supervisor to add you.");
      return;
    }
    setBusy(false);
    setLocalWorker(w);
    router.push("/m");
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={login}>
        <div style={{ marginBottom: 18 }}>
          <Logo height={30} color="#FF7A1A" wordColor="#0F1419" />
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>Worker attendance app</p>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — enter any number to continue as a sample worker.</div>}
        <label>Your mobile number</label>
        <input type="text" inputMode="numeric" value={mobile}
               onChange={e => setMobile(e.target.value)} placeholder="98250 00000" />
        {error && <div className="error">{error}</div>}
        {isStaff && (
          <div className="note amber" style={{ margin: "8px 0", fontSize: 12.5 }}>
            This is a <b>staff</b> number — this screen is only for workers punching attendance.
            <a href="/login" style={{ display: "block", marginTop: 6, color: "var(--copper)", fontWeight: 700, textDecoration: "underline" }}>→ Go to staff sign-in</a>
          </div>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
        <p style={{ marginTop: 14, fontSize: 11.5 }}>
          Staff member (supervisor / engineer / office)? <a href="/login" style={{ color: "var(--copper)", fontWeight: 600 }}>Staff sign-in</a>
        </p>
      </form>
    </div>
  );
}
