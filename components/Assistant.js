"use client";
// Pipeskool Assistant — floating in-app help, update135.
// Answers ONLY from the grounded KB + the user's own live data; escalates to tickets.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSession } from "@/lib/auth";
import { detectLang, answerLang, matchKB, suggestionsFor, liveAnswer, createTicket } from "@/lib/assistant";

const T = {
  en: { title: "Pipeskool Assistant", hint: "Ask anything about the app…", helpful: "Did this help?", yes: "Yes 👍", no: "No — get human help",
    escalate: "Route this to:", routes: [["admin","Admin"],["hr","HR"],["accounts","Accounts"],["site_engineer","Site Engineer"]],
    subject: "Short subject", detail: "Describe the problem (optional)", shot: "Attach screenshot (optional)", send: "Create support ticket",
    sent: "Ticket created — the team has been notified on the bell.", nomatch: "I couldn't find that in the app. Try different words, tap a suggestion, or create a ticket:",
    open: "Open screen →", otherlang: l => `I detected ${l}. Full answers in this language arrive with the AI upgrade — here it is in English for now:` },
  hi: { title: "Pipeskool सहायक", hint: "ऐप के बारे में कुछ भी पूछें…", helpful: "क्या इससे मदद मिली?", yes: "हाँ 👍", no: "नहीं — इंसानी मदद चाहिए",
    escalate: "किसे भेजें:", routes: [["admin","एडमिन"],["hr","HR"],["accounts","अकाउंट्स"],["site_engineer","साइट इंजीनियर"]],
    subject: "छोटा विषय", detail: "समस्या लिखें (वैकल्पिक)", shot: "स्क्रीनशॉट जोड़ें (वैकल्पिक)", send: "सपोर्ट टिकट बनाएँ",
    sent: "टिकट बन गया — टीम को बेल पर सूचना चली गई।", nomatch: "यह ऐप में नहीं मिला। दूसरे शब्द आज़माएँ, सुझाव दबाएँ, या टिकट बनाएँ:",
    open: "स्क्रीन खोलें →", otherlang: l => `${l} पहचानी गई।` },
  gu: { title: "Pipeskool સહાયક", hint: "એપ વિશે કંઈ પણ પૂછો…", helpful: "મદદ મળી?", yes: "હા 👍", no: "ના — માનવ મદદ જોઈએ",
    escalate: "કોને મોકલવું:", routes: [["admin","એડમિન"],["hr","HR"],["accounts","એકાઉન્ટ્સ"],["site_engineer","સાઇટ એન્જિનિયર"]],
    subject: "ટૂંકો વિષય", detail: "સમસ્યા લખો (વૈકલ્પિક)", shot: "સ્ક્રીનશોટ જોડો (વૈકલ્પિક)", send: "સપોર્ટ ટિકિટ બનાવો",
    sent: "ટિકિટ બની ગઈ — ટીમને બેલ પર જાણ થઈ.", nomatch: "આ એપમાં મળ્યું નહીં. બીજા શબ્દો અજમાવો, સૂચન દબાવો, કે ટિકિટ બનાવો:",
    open: "સ્ક્રીન ખોલો →", otherlang: l => `${l} ઓળખાઈ.` },
};

export default function Assistant() {
  const path = usePathname();
  const [sess, setSess] = useState(null);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);       // {who:'u'|'a', text?, steps?, link?, note?, kbId?}
  const [input, setInput] = useState("");
  const [lang, setLang] = useState("en");
  const [ticket, setTicket] = useState(null); // {route, subject, body, file}
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { setSess(getSession()); }, [path]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, open, ticket]);
  if (!sess || path === "/login" || path.startsWith("/m/login")) return null;
  const t = T[lang];
  const sugg = suggestionsFor(sess, path);

  function renderEntry(e, L, note) {
    setMsgs(m => [...m, { who: "a", note, title: e[L].q, steps: e[L].a, link: e.link, kbId: e.id }]);
  }

  async function ask(text, forcedEntry) {
    const clean = String(text || "").trim(); if (!clean && !forcedEntry) return;
    if (clean) setMsgs(m => [...m, { who: "u", text: clean }]);
    setInput("");
    const det = detectLang(clean || "");
    const L = forcedEntry ? lang : answerLang(det.code);
    if (!forcedEntry) setLang(L);
    const note = det.code !== "en" && det.code !== "hi" && det.code !== "gu" ? T.en.otherlang(det.label) : null;
    if (forcedEntry) { renderEntry(forcedEntry, L, null); return; }
    const live = await liveAnswer(clean, sess, L);
    if (live) { setMsgs(m => [...m, { who: "a", note, title: live.title, steps: live.steps, link: live.link }]); return; }
    const hits = matchKB(clean, sess, path);
    if (hits.length) { renderEntry(hits[0], L, note); if (hits.length > 1) setMsgs(m => [...m, { who: "a", also: hits.slice(1), langUsed: L }]); }
    else setMsgs(m => [...m, { who: "a", nomatch: true, langUsed: L }]);
  }

  async function sendTicket() {
    if (!ticket?.subject?.trim()) return;
    setBusy(true);
    const r = await createTicket(sess, ticket.route, ticket.subject, ticket.body, ticket.file, path);
    setBusy(false);
    if (r.ok) { setTicket(null); setMsgs(m => [...m, { who: "a", title: `✅ #${r.id}`, steps: [t.sent] }]); }
    else setMsgs(m => [...m, { who: "a", title: "⚠", steps: [r.error] }]);
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} title="Pipeskool Assistant" className="no-print"
        style={{ position: "fixed", right: 14, bottom: (path || "").startsWith("/m") ? 76 : 18, zIndex: 150, width: 52, height: 52, borderRadius: "50%",
          background: "var(--copper, #FF7A1A)", color: "#fff", fontSize: 22, border: "none", boxShadow: "0 4px 14px rgba(0,0,0,.25)", cursor: "pointer" }}>
        {open ? "✕" : "💬"}
      </button>
      {open && (
        <div style={{ position: "fixed", right: 14, bottom: (path || "").startsWith("/m") ? 138 : 80, zIndex: 150, width: "min(94vw, 380px)", height: "min(70vh, 560px)",
          background: "#fff", borderRadius: 16, boxShadow: "0 10px 34px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ background: "var(--deep, #0F1419)", color: "#fff", padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>🛟</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{t.title}</div>
              <div style={{ fontSize: 10.5, opacity: .75 }}>{sess.name} · {sess.role}</div>
            </div>
            {["en", "hi", "gu"].map(l => <button key={l} onClick={() => setLang(l)}
              style={{ fontSize: 10.5, padding: "3px 7px", borderRadius: 7, border: "none", cursor: "pointer",
                background: lang === l ? "var(--copper,#FF7A1A)" : "rgba(255,255,255,.12)", color: "#fff" }}>{l.toUpperCase()}</button>)}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 12, background: "#F7F7F5" }}>
            {msgs.length === 0 && (
              <div>
                <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                  {lang === "hi" ? "नमस्ते! नीचे से चुनें या अपनी भाषा में लिखें:" :
                   lang === "gu" ? "નમસ્તે! નીચેથી પસંદ કરો કે તમારી ભાષામાં લખો:" :
                   "Hi! Pick a question below, or type in your own language:"}
                </div>
                {sugg.map(e => <button key={e.id} onClick={() => ask(null, e)}
                  style={{ display: "block", width: "100%", textAlign: "left", fontSize: 12.5, margin: "5px 0", padding: "8px 10px",
                    borderRadius: 10, border: "1px solid var(--border,#e3e3de)", background: "#fff", cursor: "pointer" }}>💡 {e[lang].q}</button>)}
              </div>
            )}
            {msgs.map((m, i) => m.who === "u" ? (
              <div key={i} style={{ textAlign: "right", margin: "8px 0" }}>
                <span style={{ display: "inline-block", background: "var(--copper,#FF7A1A)", color: "#fff", borderRadius: "12px 12px 2px 12px", padding: "8px 11px", fontSize: 13, maxWidth: "85%" }}>{m.text}</span>
              </div>
            ) : (
              <div key={i} style={{ margin: "8px 0" }}>
                <div style={{ background: "#fff", borderRadius: "12px 12px 12px 2px", padding: "10px 12px", fontSize: 13, maxWidth: "92%", border: "1px solid var(--border,#e3e3de)" }}>
                  {m.note && <div style={{ fontSize: 11, color: "#B26A00", marginBottom: 6 }}>{m.note}</div>}
                  {m.nomatch ? (
                    <>
                      <div>{T[m.langUsed || lang].nomatch}</div>
                      <button style={{ fontSize: 12, marginTop: 8 }} onClick={() => setTicket({ route: "admin", subject: "", body: "", file: null })}>🎫 {t.send}</button>
                    </>
                  ) : m.also ? (
                    <div>
                      <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>{lang === "hi" ? "यह भी मिले:" : lang === "gu" ? "આ પણ મળ્યાં:" : "Related:"}</div>
                      {m.also.map(e => <button key={e.id} style={{ display: "block", fontSize: 12, margin: "3px 0", cursor: "pointer", background: "none", border: "none", color: "var(--copper,#E65100)", textAlign: "left", padding: 0 }}
                        onClick={() => ask(null, e)}>→ {e[m.langUsed || lang].q}</button>)}
                    </div>
                  ) : (
                    <>
                      {m.title && <div style={{ fontWeight: 700, marginBottom: 6 }}>{m.title}</div>}
                      {(m.steps || []).map((s, j) => <div key={j} style={{ margin: "4px 0", lineHeight: 1.45 }}>{(m.steps.length > 1 ? `${j + 1}. ` : "") + s}</div>)}
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        {m.link && <a href={m.link} style={{ fontSize: 12, background: "var(--copper-soft,#FFF0E3)", padding: "5px 9px", borderRadius: 8, textDecoration: "none", color: "#B24A00", fontWeight: 600 }}>{t.open}</a>}
                        {m.kbId && <>
                          <span className="muted" style={{ fontSize: 11.5, alignSelf: "center" }}>{t.helpful}</span>
                          <button style={{ fontSize: 11.5 }} onClick={() => setMsgs(x => [...x, { who: "a", title: "👍", steps: [lang === "hi" ? "बहुत बढ़िया!" : lang === "gu" ? "સરસ!" : "Great!"] }])}>{t.yes}</button>
                          <button style={{ fontSize: 11.5 }} onClick={() => setTicket({ route: "admin", subject: m.title || "", body: "", file: null })}>{t.no}</button>
                        </>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}

            {ticket && (
              <div style={{ background: "#fff", border: "1px solid var(--border,#e3e3de)", borderRadius: 12, padding: 12, marginTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>🎫 {t.send}</div>
                <div style={{ fontSize: 11.5, marginBottom: 4 }}>{t.escalate}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  {t.routes.map(([code, label]) => <button key={code} onClick={() => setTicket(k => ({ ...k, route: code }))}
                    className={ticket.route === code ? "primary" : ""} style={{ fontSize: 11.5 }}>{label}</button>)}
                </div>
                <input placeholder={t.subject} value={ticket.subject} onChange={e => setTicket(k => ({ ...k, subject: e.target.value }))} style={{ width: "100%", marginBottom: 6 }} />
                <textarea placeholder={t.detail} rows={2} value={ticket.body} onChange={e => setTicket(k => ({ ...k, body: e.target.value }))} style={{ width: "100%", marginBottom: 6 }} />
                <input type="file" accept="image/*" onChange={e => setTicket(k => ({ ...k, file: e.target.files?.[0] || null }))} style={{ fontSize: 11.5, marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="primary" style={{ fontSize: 12 }} disabled={busy || !ticket.subject.trim()} onClick={sendTicket}>{busy ? "…" : t.send}</button>
                  <button style={{ fontSize: 12 }} onClick={() => setTicket(null)}>✕</button>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid var(--border,#e3e3de)", background: "#fff" }}>
            <input style={{ flex: 1 }} placeholder={t.hint} value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && ask(input)} />
            <button className="primary" onClick={() => ask(input)}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
