"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, isDemo } from "@/lib/supabase";
import Logo from "@/components/Logo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    if (isDemo) { router.push("/dashboard"); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setError("Login failed: " + error.message); return; }
    router.push("/dashboard");
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleLogin}>
        <div style={{ marginBottom: 18 }}>
          <Logo height={30} color="#FF7A1A" wordColor="#0F1419" />
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>Site Management Software — staff login</p>
        </div>
        {isDemo && (
          <div className="demo-banner">
            Demo mode — database not connected yet. Click login to explore with sample data.
          </div>
        )}
        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
               placeholder="you@pipeskool.com" disabled={isDemo} />
        <label>Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
               placeholder="••••••••" disabled={isDemo} />
        {error && <div className="error">{error}</div>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : isDemo ? "Enter demo dashboard" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
