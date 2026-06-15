"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "@/lib/supabase";
import { loginByMobile } from "@/lib/auth";
import Logo from "@/components/Logo";

export default function Login() {
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    const res = await loginByMobile(mobile);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push("/dashboard");
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleLogin}>
        <div style={{ marginBottom: 18 }}>
          <Logo height={30} color="#FF7A1A" wordColor="#0F1419" />
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>Site Management — staff login</p>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — enter any number to sign in as Director (demo).</div>}
        <label>Mobile number</label>
        <input type="text" inputMode="numeric" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="Registered staff mobile" />
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p style={{ marginTop: 14, fontSize: 11.5, color: "var(--muted)" }}>
          Director: 9000000001 · Accountant: 9000000002 · KEI Incharge: 9000000003 (during testing)
        </p>
      </form>
    </div>
  );
}
