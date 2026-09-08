"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isDemo } from "@/lib/supabase";
import { findWorkerByMobile, setLocalWorker } from "@/lib/mobile";
import { isStaffMobile } from "@/lib/data";
import Logo from "@/components/Logo";
import { LANGS, getLang, setLang, t } from "@/lib/i18n";

export default function MobileLogin() {
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState("");
  const [isStaff, setIsStaff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lang, setLangState] = useState("en");
  useEffect(() => { setLangState(getLang()); }, []);
  const pick = l => { setLang(l); setLangState(l); };
  const router = useRouter();

  // update263: same hardening as /login — a hung or failed lookup must show an error and
  // re-enable the button, never hang on the spinner (hang-proof rule for every submit handler).
  const withTimeout = (pr, ms = 15000) => Promise.race([
    pr, new Promise((_, rej) => setTimeout(() => rej(new Error("Could not reach the server. Check your internet connection and try again.")), ms)),
  ]);
  async function login(e) {
    e.preventDefault();
    setError(""); setIsStaff(false); setBusy(true);
    try {
      const w = await withTimeout(findWorkerByMobile(mobile.trim()));
      if (!w) {
        const staff = await withTimeout(isStaffMobile(mobile.trim()));
        if (staff) { setIsStaff(true); return; }
        setError(t(lang, "not_found"));
        return;
      }
      setLocalWorker(w);
      router.push("/m");
    } catch (err) { setError(err.message || "Something went wrong — please try again."); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={login}>
        <div style={{ marginBottom: 18 }}>
          <Logo height={30} />
          <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 13 }}>{t(lang, "worker_app")}</p>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {LANGS.map(([code, label]) => (
              <button key={code} type="button" onClick={() => pick(code)}
                style={{ fontSize: 12, padding: "4px 10px", borderRadius: 14, border: "1px solid var(--border)",
                  background: lang === code ? "var(--copper)" : "#fff", color: lang === code ? "#fff" : "var(--text)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {isDemo && <div className="demo-banner">Demo mode — enter any number to continue as a sample worker.</div>}
        <label>{t(lang, "your_mobile")}</label>
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
          {busy ? t(lang, "checking") : t(lang, "continue_btn")}
        </button>
        <p style={{ marginTop: 14, fontSize: 11.5 }}>
          {t(lang, "staff_q")} <a href="/login" style={{ color: "var(--copper)", fontWeight: 600 }}>{t(lang, "staff_link")}</a>
        </p>
      </form>
    </div>
  );
}
