// Pipeskool i18n — worker-facing mobile flow in English / Hindi / Gujarati.
// Language is per-device (localStorage), chosen at login or from More → Language.
export const LANGS = [["en", "English"], ["hi", "हिंदी"], ["gu", "ગુજરાતી"]];
export const getLang = () => { try { return localStorage.getItem("psk_lang") || "en"; } catch { return "en"; } };
export const setLang = l => {
  try { localStorage.setItem("psk_lang", l); } catch {}
  // update453: a logged-in staff member's choice is also written to their profile (preferred_lang), so the
  // office sends challan messages in the language they actually read. Best-effort; the worker app is anonymous.
  try { if (localStorage.getItem("psk_session")) import("./supabase").then(({ supabase, isDemo }) => { if (!isDemo) supabase.rpc("fn_set_my_lang", { p_lang: l }).then(() => {}, () => {}); }); } catch {}
};

const D = {
  en: {
    worker_app: "Worker attendance app", your_mobile: "Your mobile number", continue_btn: "Continue",
    checking: "Checking…", not_found: "Mobile number not found. Ask your supervisor to add you.",
    staff_q: "Staff member (supervisor / engineer / office)?", staff_link: "Staff sign-in",
    checking_loc: "Checking your location…", inside_site: "📍 You are inside the site",
    outside_site: "m from site — ask supervisor to mark you",
    punch_in: "Punch in", punch_out: "Punch out", done_today: "Done for today", saving: "Saving…",
    punched_in: "Punched in — selfie & GPS saved.", full_day: "Full day", half_day: "Half day",
    recorded: "Recorded", ot_sent: "sent for approval",
    nav_punch: "Punch", nav_muster: "Muster", nav_dpr: "DPR", nav_stock: "Stock", nav_more: "More", nav_report: "Report", nav_approvals: "Approvals", nav_home: "Home", nav_projects: "Projects", m_help: "Help",
    m_report: "Site report", m_indent: "Material indent", m_assets: "Tools & assets", m_rentals: "Machines & rooms (rent)", m_money: "Money / expenses",
    m_verify: "Verify attendance", m_add: "Add worker", m_logout: "Log out", m_lang: "Language / भाषा / ભાષા",
  },
  hi: {
    worker_app: "मज़दूर हाज़िरी ऐप", your_mobile: "आपका मोबाइल नंबर", continue_btn: "आगे बढ़ें",
    checking: "जाँच हो रही है…", not_found: "मोबाइल नंबर नहीं मिला। सुपरवाइज़र से अपना नाम जुड़वाएँ।",
    staff_q: "स्टाफ (सुपरवाइज़र / इंजीनियर / ऑफ़िस)?", staff_link: "स्टाफ लॉगिन",
    checking_loc: "आपकी लोकेशन देखी जा रही है…", inside_site: "📍 आप साइट के अंदर हैं",
    outside_site: "मीटर साइट से दूर — सुपरवाइज़र से हाज़िरी लगवाएँ",
    punch_in: "हाज़िरी लगाएँ (IN)", punch_out: "छुट्टी लगाएँ (OUT)", done_today: "आज का काम पूरा", saving: "सेव हो रहा है…",
    punched_in: "हाज़िरी लग गई — सेल्फ़ी और GPS सेव हो गए।", full_day: "पूरा दिन", half_day: "आधा दिन",
    recorded: "दर्ज हुआ", ot_sent: "मंज़ूरी के लिए भेजा गया",
    nav_punch: "हाज़िरी", nav_muster: "मस्टर", nav_dpr: "डीपीआर", nav_stock: "स्टॉक", nav_more: "और", nav_report: "रिपोर्ट", nav_approvals: "मंज़ूरी", nav_home: "होम", nav_projects: "प्रोजेक्ट", m_help: "सहायता",
    m_report: "साइट रिपोर्ट", m_indent: "मटेरियल इंडेंट", m_assets: "औज़ार व मशीनें", m_rentals: "किराये की मशीनें व कमरे", m_money: "पैसा / ख़र्च",
    m_verify: "हाज़िरी सत्यापन", m_add: "मज़दूर जोड़ें", m_logout: "लॉग आउट", m_lang: "भाषा / Language / ભાષા",
  },
  gu: {
    worker_app: "કામદાર હાજરી ઍપ", your_mobile: "તમારો મોબાઈલ નંબર", continue_btn: "આગળ વધો",
    checking: "તપાસ ચાલુ છે…", not_found: "મોબાઈલ નંબર મળ્યો નથી. સુપરવાઈઝરને તમારું નામ ઉમેરવા કહો.",
    staff_q: "સ્ટાફ (સુપરવાઈઝર / એન્જિનિયર / ઑફિસ)?", staff_link: "સ્ટાફ લૉગિન",
    checking_loc: "તમારું લોકેશન તપાસાય છે…", inside_site: "📍 તમે સાઈટની અંદર છો",
    outside_site: "મીટર સાઈટથી દૂર — સુપરવાઈઝર પાસે હાજરી લગાવડાવો",
    punch_in: "હાજરી લગાવો (IN)", punch_out: "છૂટ્ટી લગાવો (OUT)", done_today: "આજનું કામ પૂરું", saving: "સેવ થાય છે…",
    punched_in: "હાજરી લાગી ગઈ — સેલ્ફી અને GPS સેવ થયા.", full_day: "આખો દિવસ", half_day: "અડધો દિવસ",
    recorded: "નોંધાયું", ot_sent: "મંજૂરી માટે મોકલાયું",
    nav_punch: "હાજરી", nav_muster: "મસ્ટર", nav_dpr: "ડીપીઆર", nav_stock: "સ્ટૉક", nav_more: "વધુ", nav_report: "રિપોર્ટ", nav_approvals: "મંજૂરી", nav_home: "હોમ", nav_projects: "પ્રોજેક્ટ", m_help: "મદદ",
    m_report: "સાઈટ રિપોર્ટ", m_indent: "મટીરિયલ ઈન્ડેન્ટ", m_assets: "ઓજાર અને મશીનો", m_rentals: "ભાડાની મશીનો અને રૂમ", m_money: "પૈસા / ખર્ચ",
    m_verify: "હાજરી ચકાસણી", m_add: "કામદાર ઉમેરો", m_logout: "લૉગ આઉટ", m_lang: "ભાષા / Language / भाषा",
  },
};
export const t = (l, k) => (D[l] && D[l][k]) || D.en[k] || k;
