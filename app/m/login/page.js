"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "@/lib/supabase";
import { findWorkerByMobile, setLocalWorker } from "@/lib/mobile";
import Logo from "@/components/Logo";

export default function MobileLogin() {
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function login(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    const w = await findWorkerByMobile(mobile.trim());
    setBusy(false);
    if (!w) { setError("Mobile number not found. Ask your supervisor to add you."); return; }
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
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </button>
        <p style={{ marginTop: 14, fontSize: 11.5 }}>
          OTP verification will be enabled once the SMS gateway is connected.
        </p>
      </form>
    </div>
  );
}
