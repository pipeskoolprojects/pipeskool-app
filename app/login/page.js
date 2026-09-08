"use client";
import { getTodayQuote } from "@/lib/notices";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "@/lib/supabase";
import { checkLoginState, loginByMobilePassword, createPasswordAndLogin } from "@/lib/auth";
import Logo from "@/components/Logo";

export default function Login() {
  const [mobile, setMobile] = useState("");
  const [lQuote, setLQuote] = useState(null);
  useEffect(() => { getTodayQuote().then(setLQuote); }, []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mode, setMode] = useState("start");   // start | password | set
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [loginAs, setLoginAs] = useState("staff");   // update225: staff | director tab (same secure login; role comes from the account)

  // update263: a failed or hung request must surface as an ERROR the user can read and retry —
  // never a forever-disabled "Please wait…" button (that is exactly what stranded the Director
  // at midnight on 30 Aug). Every handler: try/catch/finally + a 15s network timeout.
  const withTimeout = (pr, ms = 15000) => Promise.race([
    pr, new Promise((_, rej) => setTimeout(() => rej(new Error("Could not reach the server. Check your internet connection and try again.")), ms)),
  ]);

  async function handleNext(e) {
    e.preventDefault(); setError("");
    if (!mobile.trim()) { setError("Enter your mobile number."); return; }
    setBusy(true);
    try {
      const st = await withTimeout(checkLoginState(mobile));
      if (!st.ok) { setError(st.error); return; }
      setMode(st.mode);   // 'password' (has one) or 'set' (first time)
    } catch (err) { setError(err.message || "Something went wrong — please try again."); }
    finally { setBusy(false); }
  }

  function lockState() {
    try { const j = JSON.parse(localStorage.getItem("psk_login_lock") || "{}");
      return { fails: j.fails || 0, until: j.until || 0 }; } catch { return { fails: 0, until: 0 }; }
  }
  function noteFail() {
    const s = lockState(); const fails = s.fails + 1;
    const until = fails >= 5 ? Date.now() + 5 * 60 * 1000 : 0;
    localStorage.setItem("psk_login_lock", JSON.stringify({ fails: fails >= 5 ? 0 : fails, until }));
  }
  function clearFails() { localStorage.removeItem("psk_login_lock"); }
  async function handleLogin(e) {
    e.preventDefault(); setError("");
    const ls = lockState();   // update263: lockout check BEFORE busy — it used to strand the button disabled
    if (ls.until > Date.now()) { setError("Too many wrong attempts. Try again in " + Math.ceil((ls.until - Date.now()) / 60000) + " min."); return; }
    setBusy(true);
    try {
      const res = await withTimeout(loginByMobilePassword(mobile, password));
      if (!res.ok) { noteFail(); setError(res.error); return; }
      clearFails();
      // update225: route by the account's REAL role — Director -> Director Dashboard
      const isDir = res.session?.role === "director";
      router.push(window.innerWidth <= 820 ? (isDir ? "/m/dashboard" : "/m/muster") : (isDir ? "/home" : "/dashboard"));
    } catch (err) { setError(err.message || "Something went wrong — please try again."); }
    finally { setBusy(false); }
  }

  async function handleCreate(e) {
    e.preventDefault(); setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await withTimeout(createPasswordAndLogin(mobile, password), 25000);   // signUp + link can be slower
      if (!res.ok) { setError(res.error); return; }
      // update225: route by the account's REAL role — Director -> Director Dashboard
      const isDir = res.session?.role === "director";
      router.push(window.innerWidth <= 820 ? (isDir ? "/m/dashboard" : "/m/muster") : (isDir ? "/home" : "/dashboard"));
    } catch (err) { setError(err.message || "Something went wrong — please try again."); }
    finally { setBusy(false); }
  }

  const back = () => { setMode("start"); setPassword(""); setConfirm(""); setError(""); };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={mode === "start" ? handleNext : mode === "set" ? handleCreate : handleLogin}>
        <div style={{ marginBottom: 18 }}>
          <Logo height={30} />
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>Site Management</p>
        <div style={{ display: "flex", gap: 8, margin: "10px 0 2px" }}>
          {[["staff", "👷 Staff Login"], ["director", "🎩 Director Login"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setLoginAs(k)}
              style={{ flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 13, fontWeight: loginAs === k ? 800 : 600, cursor: "pointer",
                border: loginAs === k ? "2px solid var(--copper)" : "1px solid var(--border)",
                background: loginAs === k ? "#fff8f2" : "#fff", color: loginAs === k ? "var(--copper)" : "var(--text)" }}>{l}</button>
          ))}
        </div>
        {loginAs === "director" && <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Sign in with your Director mobile number &amp; password — you&apos;ll land on the Director Dashboard.</div>}
          {lQuote && <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 12, fontStyle: "italic" }}>💡 {lQuote}</p>}
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
