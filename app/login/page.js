"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "@/lib/supabase";
import { checkLoginState, loginByMobilePassword, createPasswordAndLogin } from "@/lib/auth";
import Logo from "@/components/Logo";

export default function Login() {
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState("start");   // start | password | set
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleNext(e) {
    e.preventDefault(); setError("");
    if (!mobile.trim()) { setError("Enter your mobile number."); return; }
    setBusy(true);
    const st = await checkLoginState(mobile);
    setBusy(false);
    if (!st.ok) { setError(st.error); return; }
    setMode(st.mode);   // 'password' (has one) or 'set' (first time)
  }

  async function handleLogin(e) {
    e.preventDefault(); setError("");
    setBusy(true);
    const res = await loginByMobilePassword(mobile, password);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push(window.innerWidth <= 820 ? "/m" : "/dashboard");
  }

  async function handleCreate(e) {
    e.preventDefault(); setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const res = await createPasswordAndLogin(mobile, password);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    router.push(window.innerWidth <= 820 ? "/m" : "/dashboard");
  }

  const back = () => { setMode("start"); setPassword(""); setConfirm(""); setError(""); };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={mode === "start" ? handleNext : mode === "set" ? handleCreate : handleLogin}>
        <div style={{ marginBottom: 18 }}>
          <Logo height={30} color="#FF7A1A" wordColor="#0F1419" />
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>Site Management — staff login</p>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — enter any number to sign in as Director (demo).</div>}

        <label>Mobile number</label>
        <input type="text" inputMode="numeric" value={mobile} disabled={mode !== "start"}
          onChange={e => setMobile(e.target.value)} placeholder="Registered staff mobile" />

        {mode === "password" && (
          <>
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" autoFocus />
          </>
        )}

        {mode === "set" && (
          <>
            <div className="note amber" style={{ margin: "8px 0", fontSize: 12.5 }}>First login for this number — create your password (min 6 characters). You'll use it every time from now on.</div>
            <label>New password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
            <label>Confirm password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </>
        )}

        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "start" ? "Next" : mode === "set" ? "Create password & sign in" : "Sign in"}
        </button>
        {mode !== "start" && <button type="button" onClick={back} style={{ marginTop: 8 }}>← Different number</button>}
        <p style={{ marginTop: 14, fontSize: 11.5, color: "var(--muted)" }}>
          Forgot your password? Ask the Director to reset it.
        </p>
      </form>
    </div>
  );
}
