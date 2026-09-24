"use client";
// Pipeskool Assistant — floating in-app help, update135.
// Answers ONLY from the grounded KB + the user's own live data; escalates to tickets.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSession } from "@/lib/auth";
import { detectLang, answerLang, matchKB, suggestionsFor, liveAnswer, createTicket, askAI, aiStatus, isDataQuery, wantsExcel, wantsPdf, downloadDataset, openPdfReport, performAssistantAction, uploadBillForMatch, resetAiCtx, getAiCtx, setAiCtx } from "@/lib/assistant";   // update416-429
import { listChats, loadChat, saveChat, renameChat, archiveChat, autoTitle } from "@/lib/aiChats";   // update429

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
  const [full, setFull] = useState(false); const [attach, setAttach] = useState(null);   // update424: fullscreen + pending file
  // update429: chat history (server-side)
  const [chatId, setChatId] = useState(null); const [chatTitle, setChatTitle] = useState(""); const [hist, setHist] = useState(null); const [histQ, setHistQ] = useState(""); const [histErr, setHistErr] = useState("");
  const persist = async (nextMsgs, firstText) => { try { if (!sess?.id) return; const title = chatId ? null : autoTitle(firstText); const r = await saveChat(chatId, { userId: sess.id, title, messages: nextMsgs, ctx: getAiCtx(), lang }); if (r.ok && !chatId) { setChatId(r.id); setChatTitle(title); } } catch {} };
  const newChat = () => { setMsgs([]); setChatId(null); setChatTitle(""); resetAiCtx(); setHist(null); };
  const openChat = async id => { try { const c = await loadChat(id); if (!c) return; setMsgs(c.messages || []); setChatId(c.id); setChatTitle(c.title); setAiCtx(c.ctx || null); if (c.lang) setLang(c.lang); setHist(null); } catch (e) { setHistErr(e.message); } };
  const openHistory = async () => { setHistErr(""); try { setHist(await listChats(histQ)); } catch (e) { setHistErr(e.message); setHist([]); } };
  const [msgs, setMsgs] = useState([]);
  const [aiSt, setAiSt] = useState(null);   // update417: { on, model } from GET /api/ai/chat
  useEffect(() => { if (open && aiSt === null) aiStatus().then(setAiSt); }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const last = msgs[msgs.length - 1]; if (!last || last.thinking || last.who !== "a" || msgs.length < 2) return; const first = msgs.find(m => m.who === "u"); persist(msgs, first?.text || ""); }, [msgs]);   // eslint-disable-line react-hooks/exhaustive-deps       // {who:'u'|'a', text?, steps?, link?, note?, kbId?}
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

  // update424: single backend hook — text, file (bill/receipt) or both; language = the active pill
  async function sendMessage(text, file, L0) {
    const clean = String(text || "").trim(); if (!clean && !file) return;
    if (file) {
      const chip = { name: file.name, size: file.size, kind: file.type?.startsWith("image/") ? "image" : "file", url: file.type?.startsWith("image/") ? URL.createObjectURL(file) : null };
      setMsgs(m => [...m, { who: "u", text: clean, chip }, { who: "a", thinking: true }]); setInput(""); setAttach(null);
      const r = await uploadBillForMatch(file, sess, null, clean, L0 || lang);
      setMsgs(m => { const rest = m.filter(x => !x.thinking); return r.ok ? [...rest, { who: "a", aiText: r.text || `Bill read and matched against ${r.bill.po_no || "— no PO found"}.`, bill: { ...r.bill, _file: file }, dataset: r.dataset, tools: ["bill_match"], langUsed: L0 || lang }] : [...rest, { who: "a", aiText: "⚠ " + (r.error || "Could not read the bill."), soft: true }]; });
      return;
    }
    return ask(clean);
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
    // update421: "Excel/PDF bana do" with no new question → export the LAST result directly
    const lastDs = [...msgs].reverse().find(x => x.dataset?.rows?.length)?.dataset;
    if (lastDs && (wantsExcel(clean) || wantsPdf(clean)) && clean.split(/\s+/).length <= 8) {
      const meta = { by: sess?.name, at: new Date().toLocaleString("en-IN") };
      if (wantsPdf(clean)) openPdfReport(lastDs, meta); else downloadDataset(lastDs, meta);
      setMsgs(m => [...m, { who: "a", aiText: (wantsPdf(clean) ? "📄 PDF report opened in a new tab — use Print / Save as PDF there." : "📊 Excel file downloaded.") + ` (${lastDs.title}, ${lastDs.rows.length} rows)`, langUsed: L, soft: true }]);
      return;
    }
    setMsgs(m => [...m, { who: "a", thinking: true }]);
    // update431: ORDER = ERP engine (server) → Help Center KB → general LLM. The engine decides what is ERP; the KB never pre-empts it.
    const probe = await askAI([...msgs.filter(m => m.who === "u" || m.aiText).slice(-8).map(m => ({ role: m.who === "u" ? "user" : "assistant", content: m.who === "u" ? m.text : (m.aiText || "") })), { role: "user", content: clean }], L, sess, path, { engineOnly: true });
    if (probe && !probe.general) { setMsgs(m => [...m.filter(x => !x.thinking), { who: "a", aiText: probe.text, langUsed: L, dataset: probe.dataset, tools: probe.tools, confirm: probe.confirm, soft: probe.soft }]); if (probe.export && probe.dataset?.rows?.length) { probe.export === "pdf" ? openPdfReport(probe.dataset, sess) : downloadDataset(probe.dataset, { by: sess?.name }); } else if (probe.export) { const last = [...msgs].reverse().find(x => x.dataset?.rows?.length); if (last) probe.export === "pdf" ? openPdfReport(last.dataset, sess) : downloadDataset(last.dataset, { by: sess?.name }); } return; }
    const hits = matchKB(clean, sess, path);
    if (hits.length) { renderEntry(hits[0], L, note); if (hits.length > 1) setMsgs(m => [...m, { who: "a", also: hits.slice(1), langUsed: L }]); return; }
    // update416: no KB match → ask the Groq-backed assistant (server route, grounded in the Help Center)
    setMsgs(m => m.some(x => x.thinking) ? m : [...m, { who: "a", thinking: true }]);
    const history = [...msgs.filter(x => x.who === "u" || x.aiText).map(x => x.who === "u" ? { role: "user", content: x.text } : { role: "assistant", content: x.aiText }), { role: "user", content: clean }];
    const ai = await askAI(history, L, sess, path, { skipEngine: true });
    if (ai?.export && ai?.dataset?.rows?.length) { const okd = ai.export === "pdf" ? openPdfReport(ai.dataset, { by: sess?.name }) : await downloadDataset(ai.dataset, { by: sess?.name }); setMsgs(m => [...m.filter(x => !x.thinking), { who: "a", aiText: (ai.text || "") + (okd ? `\n📊 ${ai.export === "pdf" ? "PDF" : "Excel"} downloaded — ${ai.dataset.title} (${ai.dataset.rows.length} rows).` : ""), langUsed: L, dataset: ai.dataset, tools: ai.tools }]); return; }
    if (ai?.export) { const last = [...msgs].reverse().find(x => x.dataset?.rows?.length); if (last) { const okd = ai.export === "pdf" ? openPdfReport(last.dataset, { by: sess?.name }) : await downloadDataset(last.dataset, { by: sess?.name }); setMsgs(m => [...m.filter(x => !x.thinking), { who: "a", aiText: okd ? `${ai.export === "pdf" ? "PDF" : "Excel"} ready — ${last.dataset.title} (${last.dataset.rows.length} rows).` : "Export could not start.", langUsed: L, soft: true }]); } else setMsgs(m => [...m.filter(x => !x.thinking), { who: "a", aiText: L === "hi" ? "Pehle koi report poochhein (jaise: September ka expense batao), phir Excel/PDF banayein." : "Ask for a report first (e.g. September expenses), then export it.", langUsed: L, soft: true }]); return; }
    setMsgs(m => { const rest = m.filter(x => !x.thinking); return ai?.text ? [...rest, { who: "a", note, aiText: ai.text, langUsed: L, dataset: ai.dataset, tools: ai.tools, confirm: ai.confirm, soft: ai.soft }] : [...rest, { who: "a", aiText: ai?.error || (L === "hi" ? "Abhi jawab nahi de paya — phir se poochhein." : "Couldn't answer just now — please ask again."), langUsed: L, soft: true }]; });
    if (ai?.dataset && wantsPdf(clean)) openPdfReport(ai.dataset, { by: sess?.name, at: new Date().toLocaleString("en-IN") }); else if (ai?.dataset && wantsExcel(clean)) downloadDataset(ai.dataset, { by: sess?.name, at: new Date().toLocaleString("en-IN") });   // update418/421
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
      {!open && <button onClick={() => setOpen(true)} title="Pipeskool Assistant" className="no-print asst-fab"
        style={{ position: "fixed", right: 14, bottom: (path || "").startsWith("/m") ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 18, zIndex: 150, width: 52, height: 52, borderRadius: "50%",
          background: "linear-gradient(180deg,#FF7A45,#E8622B)", color: "#1a1207", fontSize: 24, border: "none", boxShadow: "0 4px 14px rgba(0,0,0,.25)", cursor: "pointer" }}>🤖</button>}
      {open && (
        <div className="asst-panel no-print" style={full
          ? { position: "fixed", inset: 16, zIndex: 200, width: "auto", height: "auto" }
          : { position: "fixed", right: 14, bottom: (path || "").startsWith("/m") ? "calc(74px + env(safe-area-inset-bottom, 0px))" : 18, zIndex: 150, width: "min(94vw, 380px)", height: "min(80vh, 540px)" }}>
          <style>{`.asst-dots span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#9096A0;animation:asstb 1.2s infinite}.asst-dots span:nth-child(2){animation-delay:.2s}.asst-dots span:nth-child(3){animation-delay:.4s}@keyframes asstb{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}`}</style>
          <div style={{ height: "100%", background: "linear-gradient(180deg,#1C2025,#15181C)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 20, boxShadow: "0 10px 34px rgba(0,0,0,.35)", display: "flex", flexDirection: "column", overflow: "hidden", color: "#F5F3EF" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.07)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(180deg,#FF7A45,#E8622B)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 17 }}>✦</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>{t.title}</div>
                <div style={{ fontSize: 10.5, color: "#9096A0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sess.name} · {sess.role}{aiSt && <span title={aiSt.on ? "AI active · " + aiSt.model : "AI not configured on server"} style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 8, background: aiSt.on ? "#1F3D2B" : "#4A2323", color: aiSt.on ? "#7DD3A0" : "#F5A3A3", fontSize: 9.5 }}>AI {aiSt.on ? "on" : "off"}</span>}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ display: "flex", background: "#23272D", borderRadius: 999, padding: 2 }}>
                {["en", "hi", "gu"].map(l => <button key={l} type="button" onClick={() => setLang(l)} style={{ fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 999, border: "none", cursor: "pointer", background: lang === l ? "#E8622B" : "transparent", color: lang === l ? "#1a1207" : "#9096A0" }}>{l.toUpperCase()}</button>)}
              </div>
              <button type="button" onClick={() => hist ? setHist(null) : openHistory()} title="Chat history" style={{ width: 28, height: 28, borderRadius: 8, background: hist ? "#E8622B" : "#23272D", border: "none", color: hist ? "#1a1207" : "#9096A0", cursor: "pointer", fontSize: 14 }}>🕘</button>
              <button type="button" onClick={newChat} title="New chat" style={{ width: 28, height: 28, borderRadius: 8, background: "#23272D", border: "none", color: "#9096A0", cursor: "pointer", fontSize: 14 }}>＋</button>
              <button type="button" onClick={() => setFull(f => !f)} title={full ? "Minimize" : "Fullscreen"} style={{ width: 28, height: 28, borderRadius: 8, background: "#23272D", border: "none", color: "#9096A0", cursor: "pointer", fontSize: 14 }}>{full ? "⤡" : "⤢"}</button>
              <button type="button" onClick={() => { setOpen(false); setFull(false); }} title="Close" style={{ width: 28, height: 28, borderRadius: 8, background: "#23272D", border: "none", color: "#9096A0", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          </div>

          {hist && (
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}><input placeholder="Search chats…" value={histQ} onChange={e => setHistQ(e.target.value)} onKeyDown={e => e.key === "Enter" && openHistory()} style={{ flex: 1, background: "#23272D", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, padding: "8px 10px", color: "#F5F3EF", fontSize: 12.5 }} /><button type="button" onClick={openHistory} style={{ borderRadius: 8, background: "#23272D", border: "none", color: "#9096A0", padding: "0 12px" }}>Search</button><button type="button" onClick={newChat} style={{ borderRadius: 8, background: "linear-gradient(180deg,#FF7A45,#E8622B)", border: "none", color: "#1a1207", padding: "0 12px", fontWeight: 600 }}>＋ New chat</button></div>
              {histErr && <div style={{ color: "#F5A3A3", fontSize: 12, marginBottom: 8 }}>{histErr}</div>}
              {hist.length === 0 && !histErr && <div style={{ color: "#9096A0", fontSize: 12.5 }}>No saved chats yet.</div>}
              {hist.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, background: c.id === chatId ? "#2C3139" : "#23272D", borderRadius: 10, padding: "9px 12px", marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => openChat(c.id)}><div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div><div style={{ fontSize: 10.5, color: "#9096A0" }}>{new Date(c.updated_at).toLocaleString("en-IN")}</div></div>
                  <button type="button" title="Rename" style={{ background: "transparent", border: "none", color: "#9096A0", cursor: "pointer" }} onClick={async () => { const t = window.prompt("Chat title:", c.title); if (t && t.trim()) { await renameChat(c.id, t.trim()); openHistory(); if (c.id === chatId) setChatTitle(t.trim()); } }}>✎</button>
                  <button type="button" title="Archive" style={{ background: "transparent", border: "none", color: "#F5A3A3", cursor: "pointer" }} onClick={async () => { if (window.confirm(`Archive "${c.title}"?`)) { await archiveChat(c.id); if (c.id === chatId) newChat(); openHistory(); } }}>🗑</button>
                </div>))}
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: full ? "16px 8%" : 14, display: hist ? "none" : "flex", flexDirection: "column", gap: 12 }}>
            {chatTitle && <div style={{ fontSize: 11, color: "#9096A0", textAlign: "center" }}>{chatTitle}</div>}
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
              <div key={i} style={{ alignSelf: "flex-end", maxWidth: full ? "70%" : "78%", background: "linear-gradient(180deg,#FF7A45,#E8622B)", color: "#1a1207", borderRadius: "14px 14px 3px 14px", padding: "10px 13px", fontSize: 12.5 }}>
                {m.chip && <div style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(0,0,0,.18)", borderRadius: 8, padding: "5px 8px", marginBottom: m.text ? 6 : 0, fontSize: 11.5 }}>{m.chip.url ? <img src={m.chip.url} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 5 }} /> : <span>📄</span>}<span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.chip.name}</span><span style={{ opacity: .7 }}>{(m.chip.size / 1024).toFixed(0)} KB</span></div>}
                {m.text}
              </div>
            ) : (
              <div key={i} style={{ alignSelf: "flex-start", maxWidth: full ? "80%" : "92%", display: "flex", gap: 9 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: "#23272D", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, color: "#FF7A45", fontSize: 13 }}>✦</div>
                <div style={{ background: "#23272D", borderRadius: "3px 14px 14px 14px", padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6, minWidth: 0, flex: 1 }}>
                  {m.note && <div style={{ fontSize: 11, color: "#B26A00", marginBottom: 6 }}>{m.note}</div>}
                  {m.thinking ? <div className="asst-dots" aria-label="typing"><span /><span /><span /></div>
                  : m.aiText ? (<><div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{m.aiText}</div>
                      {m.dataset?.rows?.length > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}><button type="button" style={{ fontSize: 11.5 }} onClick={() => downloadDataset(m.dataset, { by: sess?.name, at: new Date().toLocaleString("en-IN") })}>📊 Export Excel</button><button type="button" style={{ fontSize: 11.5 }} onClick={() => openPdfReport(m.dataset, { by: sess?.name, at: new Date().toLocaleString("en-IN") })}>📄 Download PDF</button><span className="muted" style={{ fontSize: 10.5, alignSelf: "center" }}>{m.dataset.title} · {m.dataset.rows.length} rows</span></div>}
                      {m.bill && (<div style={{ marginTop: 8, background: m.bill.status === "matched" ? "#1F3D2B" : "#4A2323", border: "1px solid " + (m.bill.status === "matched" ? "#2E6B47" : "#7A3A3A"), borderRadius: 8, padding: 8, fontSize: 12 }}>
                        <div style={{ fontWeight: 700 }}>{m.bill.verdict}</div>
                        {m.bill.expense_match?.candidates?.length > 0 && (<div style={{ marginTop: 6, fontSize: 11.5 }}>
                          <div style={{ fontWeight: 600 }}>Matching expense / petty-cash entries</div>
                          {m.bill.expense_match.candidates.map(c => <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                            <span style={{ flex: 1, minWidth: 0 }}>#{c.id} · {c.category} · ₹{c.amount.toLocaleString("en-IN")} · {c.date} · {c.site}{c.petty ? " · petty cash" : ""} · {c.status}{c.has_bill ? " · bill attached" : ""}</span>
                            {!m.bill.attachedTo && m.bill._file && <button type="button" style={{ fontSize: 11 }} onClick={async () => { const { addExpenseBills } = await import("@/lib/money"); const r = await addExpenseBills(c.id, [m.bill._file]); setMsgs(x => x.map(y => y === m ? { ...y, bill: { ...y.bill, attachedTo: r?.ok === false ? null : c.id, attachErr: r?.ok === false ? r.error : null } } : y)); }}>Attach to #{c.id}</button>}
                          </div>)}
                          {m.bill.attachedTo && <div style={{ color: "#7DD3A0", marginTop: 4 }}>✅ Bill attached to expense #{m.bill.attachedTo}</div>}
                          {m.bill.attachErr && <div style={{ color: "#F5A3A3", marginTop: 4 }}>⚠ {m.bill.attachErr}</div>}
                        </div>)}
                        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>📎 {m.bill.file_name} · uploaded by {m.bill.uploaded_by} · {String(m.bill.uploaded_at).slice(0, 16).replace("T", " ")}</div>
                        <div style={{ marginTop: 4 }}>Vendor: <b>{m.bill.vendor || "—"}</b>{m.bill.gstin ? ` · GSTIN ${m.bill.gstin}` : ""} · Invoice: <b>{m.bill.invoice_no || "—"}</b>{m.bill.invoice_date ? ` (${m.bill.invoice_date})` : ""} · PO: <b>{m.bill.po_no || "not found"}</b>{m.bill.site ? ` · ${m.bill.site}` : ""} · Bill total: <b>₹{Number(m.bill.total || 0).toLocaleString("en-IN")}</b></div>
                        {m.bill.lines?.map((l, i) => <div key={i} style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid rgba(0,0,0,.06)" }}>{l.ok ? "✅" : "⚠️"} {l.bill_item}{l.po_item && l.po_item !== l.bill_item ? ` → ${l.po_item}` : ""}<div className="muted" style={{ fontSize: 11 }}>PO {l.po_qty ?? "—"} · GRN {l.grn_qty ?? "—"} · Bill {l.bill_qty} @ ₹{l.bill_rate}{l.po_rate != null ? ` (PO ₹${l.po_rate})` : ""}{l.issues.length ? " — " + l.issues.join("; ") : ""}</div></div>)}
                        {!m.bill.saved && <div style={{ color: "#B91C1C", fontSize: 11, marginTop: 4 }}>Not saved: {m.bill.save_error}</div>}
                      </div>)}
                      {m.confirm && !m.confirmDone && (<div style={{ marginTop: 8, background: "#FFF7ED", border: "1px solid #FDBA74", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Confirm: {m.confirm.label}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="primary" style={{ fontSize: 11.5 }} onClick={async () => { const r = await performAssistantAction(m.confirm, sess); setMsgs(x => x.map(y => y === m ? { ...y, confirmDone: true } : y).concat([{ who: "a", aiText: r.ok ? r.text : "⚠ " + (r.error || "Not allowed — the app refused this change for your role."), langUsed: m.langUsed }])); }}>✓ Confirm</button>
                          <button type="button" style={{ fontSize: 11.5 }} onClick={() => setMsgs(x => x.map(y => y === m ? { ...y, confirmDone: true } : y).concat([{ who: "a", aiText: "Cancelled — nothing was changed.", langUsed: m.langUsed }]))}>Cancel</button>
                        </div>
                        <div className="muted" style={{ fontSize: 10.5, marginTop: 4 }}>Applied through the app with your permissions; logged under your name.</div>
                      </div>)}
                      {!m.soft && <div style={{ fontSize: 10, marginTop: 6, color: "#565B63" }}>{m.tools?.length ? "Live ERP data" : "AI answer — verify against the app."}</div>}</>)
                  : m.nomatch ? (
                    <>
                      <div>{T[m.langUsed || lang].nomatch}</div>
                      {m.aiError && <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>⚠ AI: {m.aiError}</div>}{/* update417 */}
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

          <div style={{ padding: "10px 14px 14px", borderTop: "1px solid rgba(255,255,255,.07)" }}>
            {attach && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#23272D", borderRadius: 10, padding: "6px 10px", marginBottom: 8, fontSize: 12 }}>
                {attach.type?.startsWith("image/") ? <img src={URL.createObjectURL(attach)} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6 }} /> : <span style={{ fontSize: 22 }}>📄</span>}
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{attach.name}</div><div style={{ color: "#9096A0", fontSize: 10.5 }}>{(attach.size / 1024).toFixed(0)} KB · will be read and matched to expenses / POs</div></div>
                <button type="button" onClick={() => setAttach(null)} style={{ background: "transparent", border: "none", color: "#F5A3A3", cursor: "pointer", fontSize: 12 }}>Remove</button>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#23272D", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "8px 10px" }}>
              <label title="Attach a bill / receipt (JPG, PNG, PDF)" style={{ cursor: "pointer", fontSize: 16, color: "#9096A0", flexShrink: 0 }}>📎<input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setAttach(f); }} /></label>
              <input placeholder={t.hint} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage(input, attach, lang)}
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#F5F3EF", fontSize: 12.5 }} />
              <button type="button" onClick={() => sendMessage(input, attach, lang)} style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(180deg,#FF7A45,#E8622B)", border: "none", color: "#1a1207", cursor: "pointer", flexShrink: 0 }}>➤</button>
            </div>
          </div>
          </div>
        </div>
      )}
    </>
  );
}
