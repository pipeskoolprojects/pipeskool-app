// Assistant Knowledge Base — update135.
// RULE: every entry describes ONLY what the app actually does today (update134).
// Never add an entry for a feature that doesn't exist. Steps are numbered strings.
// Languages: en/hi/gu fully written. Other Indian languages are handled by the
// engine (script detection + graceful note) until the live-AI layer is enabled.
export const KB = [
{ id:"punch", k:["punch","attendance mark","selfie","camera","हाज़िरी","पंच","હાજરી","પંચ","punch in","punch out"],
  link:"/m", roles:null,
  en:{ q:"How do I mark my attendance (punch)?", a:[
    "Open the app on your phone and log in — the Punch screen opens first.",
    "Stand inside the site boundary. If you see 'outside site', walk closer — GPS must place you inside the green fence.",
    "For multi-site staff: pick the site from the dropdown on the punch screen first.",
    "Tap PUNCH IN. The live camera opens — only a live selfie works; gallery photos are not accepted.",
    "Tap 📷 Capture. Your punch saves with time, GPS and selfie.",
    "At day end, tap PUNCH OUT the same way. Your supervisor verifies it in the evening." ]},
  hi:{ q:"हाज़िरी (पंच) कैसे लगाएँ?", a:[
    "फ़ोन पर ऐप खोलें और लॉगिन करें — पंच स्क्रीन सबसे पहले खुलती है।",
    "साइट की सीमा के अंदर खड़े हों। 'outside site' दिखे तो पास जाएँ — GPS से अंदर होना ज़रूरी है।",
    "कई साइट वाले स्टाफ़: पहले ड्रॉपडाउन से साइट चुनें।",
    "PUNCH IN दबाएँ। लाइव कैमरा खुलेगा — सिर्फ़ लाइव सेल्फ़ी चलेगी, गैलरी की फोटो नहीं।",
    "📷 Capture दबाएँ। समय, GPS और सेल्फ़ी के साथ पंच सेव हो जाएगा।",
    "दिन ख़त्म होने पर उसी तरह PUNCH OUT करें। शाम को सुपरवाइज़र वेरिफ़ाई करेंगे।" ]},
  gu:{ q:"હાજરી (પંચ) કેવી રીતે કરવી?", a:[
    "ફોનમાં એપ ખોલી લૉગિન કરો — પંચ સ્ક્રીન પહેલી ખુલે છે.",
    "સાઇટની હદમાં ઊભા રહો. 'outside site' દેખાય તો નજીક જાઓ — GPS થી અંદર હોવું જરૂરી.",
    "એકથી વધુ સાઇટવાળા સ્ટાફ: પહેલા ડ્રોપડાઉનમાંથી સાઇટ પસંદ કરો.",
    "PUNCH IN દબાવો. લાઇવ કેમેરો ખુલશે — માત્ર લાઇવ સેલ્ફી ચાલશે, ગેલેરીની ફોટો નહીં.",
    "📷 Capture દબાવો. સમય, GPS અને સેલ્ફી સાથે પંચ સેવ થશે.",
    "દિવસ પૂરો થાય ત્યારે એ જ રીતે PUNCH OUT કરો. સાંજે સુપરવાઇઝર વેરિફાય કરશે." ]} },

{ id:"gps", k:["gps not working","location","outside site","fence","गप्स","लोकेशन","લોકેશન","gps"],
  link:"/m", roles:null,
  en:{ q:"Why is GPS not working / it says outside site?", a:[
    "Check phone Location is ON (high accuracy) and the browser has location permission for the app.",
    "Stand in the open for 30 seconds — metal sheds and basements block GPS.",
    "Multi-site staff: make sure the RIGHT site is selected on the punch screen — the fence is checked against the selected site.",
    "If the site fence itself looks wrong, tell the Director — fence centre and radius are set in Site Master.",
    "Still stuck? Tap 'Create support ticket' below and attach a screenshot." ]},
  hi:{ q:"GPS काम नहीं कर रहा / 'outside site' आ रहा है?", a:[
    "फ़ोन की Location ON रखें (High accuracy) और ब्राउज़र को लोकेशन की अनुमति दें।",
    "30 सेकंड खुले में खड़े रहें — शेड/बेसमेंट में GPS रुक जाता है।",
    "पंच स्क्रीन पर सही साइट चुनी है या नहीं देखें — फेंस उसी साइट से मिलाया जाता है।",
    "फेंस ही ग़लत लगे तो डायरेक्टर को बताएँ — Site Master में सेट होता है।",
    "फिर भी दिक्कत हो तो नीचे 'Create support ticket' दबाएँ और स्क्रीनशॉट लगाएँ।" ]},
  gu:{ q:"GPS કામ નથી કરતું / 'outside site' બતાવે છે?", a:[
    "ફોનનું Location ON રાખો (High accuracy) અને બ્રાઉઝરને લોકેશન પરવાનગી આપો.",
    "30 સેકન્ડ ખુલ્લામાં ઊભા રહો — શેડ/ભોંયરામાં GPS અટકે છે.",
    "પંચ સ્ક્રીન પર સાચી સાઇટ પસંદ છે કે નહીં જુઓ — ફેન્સ એ સાઇટ સામે ચકાસાય છે.",
    "ફેન્સ જ ખોટી લાગે તો ડિરેક્ટરને કહો — Site Master માં સેટ થાય છે.",
    "તો પણ ન થાય તો નીચે 'Create support ticket' દબાવી સ્ક્રીનશોટ જોડો." ]} },

{ id:"att_rejected", k:["attendance rejected","punch rejected","verification","pending","हाज़िरी रिजेक्ट","વેરિફિકેશન"],
  link:"/attendance", roles:null,
  en:{ q:"Why was my attendance rejected / still pending?", a:[
    "Every punch is verified in the evening by the supervisor/incharge on the Attendance register.",
    "Common rejection reasons: selfie doesn't show your face clearly, punch from outside the fence, or duplicate/mistaken punch.",
    "Pending simply means the verifier hasn't done end-of-day verification yet.",
    "If you believe it's wrongly rejected, speak to your site incharge — they can correct it the same day.",
    "Rejected days count as absent in payroll, so raise it before month-end." ]},
  hi:{ q:"मेरी हाज़िरी रिजेक्ट/पेंडिंग क्यों है?", a:[
    "हर पंच शाम को सुपरवाइज़र Attendance रजिस्टर में वेरिफ़ाई करते हैं।",
    "रिजेक्ट के आम कारण: सेल्फ़ी में चेहरा साफ़ नहीं, फेंस के बाहर से पंच, या डबल पंच।",
    "Pending का मतलब — वेरिफ़ाई अभी हुआ नहीं है।",
    "ग़लत रिजेक्ट लगे तो साइट इंचार्ज से उसी दिन बात करें — वे सुधार सकते हैं।",
    "रिजेक्ट दिन पेरोल में गैरहाज़िर गिने जाते हैं, महीना ख़त्म होने से पहले उठाएँ।" ]},
  gu:{ q:"મારી હાજરી કેમ રિજેક્ટ/પેન્ડિંગ છે?", a:[
    "દરેક પંચ સાંજે સુપરવાઇઝર Attendance રજિસ્ટરમાં વેરિફાય કરે છે.",
    "રિજેક્ટના સામાન્ય કારણ: સેલ્ફીમાં ચહેરો સ્પષ્ટ નહીં, ફેન્સ બહારથી પંચ, કે ડબલ પંચ.",
    "Pending એટલે વેરિફિકેશન હજી થયું નથી.",
    "ખોટું રિજેક્ટ લાગે તો સાઇટ ઇન્ચાર્જ સાથે એ જ દિવસે વાત કરો.",
    "રિજેક્ટ દિવસ પગારમાં ગેરહાજર ગણાય છે — મહિનો પૂરો થતાં પહેલાં ઉઠાવો." ]} },

{ id:"leave_apply", k:["apply leave","leave request","chutti","छुट्टी","રજા","leave"],
  link:"/leave", roles:null,
  en:{ q:"How do I apply for leave?", a:[
    "Open Labour & Attendance → Leave Requests.",
    "Your balance cards show: annual entitlement, used, Available now (50% cap till September), and what unlocks in October.",
    "Tap ＋ Apply leave. Pick the type (Paid/Sick/Casual/Emergency/Half Day/LWP), dates, reason, emergency contact; attach a medical certificate if needed.",
    "The form checks everything live — Sundays and company holidays are not counted; if you exceed your balance it shows the exact ₹ salary impact.",
    "Submit. It goes through the approval chain and you get a bell notification on approve/reject.",
    "You can Cancel a request while it is still pending." ]},
  hi:{ q:"छुट्टी के लिए अप्लाई कैसे करें?", a:[
    "Labour & Attendance → Leave Requests खोलें।",
    "बैलेंस कार्ड दिखते हैं: सालाना छुट्टी, इस्तेमाल, अभी उपलब्ध (सितंबर तक 50% सीमा), अक्टूबर में खुलने वाली।",
    "＋ Apply leave दबाएँ। टाइप, तारीख़ें, कारण, इमरजेंसी संपर्क भरें; ज़रूरत हो तो मेडिकल सर्टिफ़िकेट लगाएँ।",
    "फ़ॉर्म तुरंत जाँच करता है — रविवार और कंपनी छुट्टियाँ नहीं गिनतीं; बैलेंस से ज़्यादा माँगें तो ₹ असर दिखता है।",
    "Submit करें। अप्रूवल चेन से गुज़रकर बेल पर सूचना आएगी।",
    "Pending रहते Cancel भी कर सकते हैं।" ]},
  gu:{ q:"રજા માટે અરજી કેવી રીતે કરવી?", a:[
    "Labour & Attendance → Leave Requests ખોલો.",
    "બેલેન્સ કાર્ડ બતાવે છે: વાર્ષિક રજા, વપરાયેલ, અત્યારે ઉપલબ્ધ (સપ્ટે. સુધી 50% મર્યાદા), ઑક્ટોબરમાં ખુલનારી.",
    "＋ Apply leave દબાવો. પ્રકાર, તારીખો, કારણ, ઇમરજન્સી સંપર્ક ભરો; જરૂર હોય તો મેડિકલ સર્ટિફિકેટ જોડો.",
    "ફોર્મ તરત ચકાસે છે — રવિવાર અને કંપની રજાઓ ગણાતી નથી; બેલેન્સથી વધુ માંગો તો ₹ અસર બતાવે.",
    "Submit કરો. અપ્રૂવલ ચેઇનમાંથી પસાર થઈ બેલ પર જાણ થશે.",
    "Pending હોય ત્યાં સુધી Cancel કરી શકો." ]} },

{ id:"salary_view", k:["salary","payslip","salary slip","वेतन","सैलरी","પગાર","payout","my salary"],
  link:"/wages", roles:null,
  en:{ q:"Where can I see my salary?", a:[
    "Staff salary is generated month-wise by Accounts on Muster Roll & Wages → Staff salary.",
    "You can see your OWN payout rows there once the month is generated (others' payouts are hidden by security).",
    "The calculation is fixed company policy: monthly salary ÷ 30 per day, Sundays paid, approved advances auto-deducted, paid-leave balance used before any deduction.",
    "For a formal slip or a doubt in the figure, contact Accounts — or create a ticket routed to Accounts below." ]},
  hi:{ q:"मेरी सैलरी कहाँ दिखेगी?", a:[
    "स्टाफ़ सैलरी हर महीने Accounts द्वारा Muster Roll & Wages → Staff salary में बनती है।",
    "महीना बनते ही आप अपनी पंक्तियाँ देख सकते हैं (दूसरों की सुरक्षा से छिपी रहती हैं)।",
    "गणना कंपनी नीति से: मासिक वेतन ÷ 30 प्रतिदिन, रविवार सवेतन, स्वीकृत एडवांस अपने आप कटते हैं, पहले पेड-लीव बैलेंस लगता है।",
    "स्लिप या आँकड़े पर शंका हो तो Accounts से संपर्क करें — नीचे से टिकट भी बना सकते हैं।" ]},
  gu:{ q:"મારો પગાર ક્યાં જોવા મળશે?", a:[
    "સ્ટાફ પગાર દર મહિને Accounts દ્વારા Muster Roll & Wages → Staff salary માં બને છે.",
    "મહિનો બન્યા પછી તમે તમારી પોતાની પંક્તિઓ જોઈ શકો (બીજાની સુરક્ષાથી છુપાયેલી).",
    "ગણતરી કંપની નીતિ મુજબ: માસિક પગાર ÷ 30 પ્રતિ દિવસ, રવિવાર પગારી, મંજૂર એડવાન્સ આપોઆપ કપાય, પહેલા પેઇડ-લીવ બેલેન્સ વપરાય.",
    "સ્લિપ કે આંકડામાં શંકા હોય તો Accounts નો સંપર્ક કરો — નીચેથી ટિકિટ પણ બનાવી શકો." ]} },

{ id:"expense", k:["expense","upload expense","claim","खर्च","expense submit","ખર્ચ","petty cash","bill upload"],
  link:"/expenses", roles:null,
  en:{ q:"How do I submit a site expense?", a:[
    "Open Site Execution → Expenses & Petty Cash (on mobile: More → Expenses).",
    "Tap add expense, pick the site and category, enter amount and note, and attach the bill photo (gallery photos are fine here).",
    "Submit — it goes to the approver. If they raise a query you'll see it and can reply on the same entry.",
    "Approved expenses flow to Accounts and Tally; the status column shows exactly where it stands." ]},
  hi:{ q:"साइट ख़र्च कैसे जमा करें?", a:[
    "Site Execution → Expenses & Petty Cash खोलें (मोबाइल: More → Expenses)।",
    "ख़र्च जोड़ें: साइट, श्रेणी, राशि, नोट और बिल की फोटो लगाएँ (यहाँ गैलरी फोटो चलती है)।",
    "Submit करें — अप्रूवर के पास जाएगा। सवाल आए तो उसी एंट्री पर जवाब दें।",
    "स्वीकृत ख़र्च Accounts और Tally तक जाता है; स्टेटस कॉलम में स्थिति दिखती है।" ]},
  gu:{ q:"સાઇટ ખર્ચ કેવી રીતે મૂકવો?", a:[
    "Site Execution → Expenses & Petty Cash ખોલો (મોબાઇલ: More → Expenses).",
    "ખર્ચ ઉમેરો: સાઇટ, કેટેગરી, રકમ, નોંધ અને બિલનો ફોટો જોડો (અહીં ગેલેરી ફોટો ચાલે).",
    "Submit કરો — અપ્રૂવર પાસે જશે. પ્રશ્ન આવે તો એ જ એન્ટ્રી પર જવાબ આપો.",
    "મંજૂર ખર્ચ Accounts અને Tally સુધી જાય છે; સ્ટેટસ કૉલમમાં સ્થિતિ દેખાય." ]} },

{ id:"indent", k:["material request","indent","raise indent","order material","सामान","इंडेंट","ઇન્ડેન્ટ","material indent","request material"],
  link:"/order", roles:null,   // update473: material is ordered only from the catalogue
  en:{ q:"How do I order material?", a:[
    "Web: Material & Procurement → Order Materials (Catalogue). Mobile: Order Material on Home, or Menu → Order materials.",
    "Pick the site, find the material (category, search or filters) and tap ADD — choose the size and quantity.",
    "Open the cart, set the need-by date (Urgent only when truly urgent) and tap Place Order.",
    "The order goes through the usual approval → PO → challan → receipt. Track it in My orders (Deliveries & receiving)." ]},
  hi:{ q:"सामान कैसे ऑर्डर करें?", a:[
    "वेब: Material & Procurement → Order Materials (Catalogue)। मोबाइल: Home पर Order Material, या Menu → माल ऑर्डर।",
    "साइट चुनें, सामान खोजें और ADD दबाएँ — साइज़ और मात्रा चुनें।",
    "कार्ट खोलें, need-by तारीख़ भरें (Urgent सिर्फ़ ज़रूरी हो तब) और Place Order दबाएँ।",
    "ऑर्डर हमेशा की तरह approval → PO → challan → receipt से जाता है। My orders (डिलीवरी व माल प्राप्ति) में देखें।" ]},
  gu:{ q:"સામાન કેવી રીતે ઓર્ડર કરવો?", a:[
    "વેબ: Material & Procurement → Order Materials (Catalogue). મોબાઇલ: Home પર Order Material, અથવા Menu → માલ ઓર્ડર.",
    "સાઇટ પસંદ કરો, સામાન શોધો અને ADD દબાવો — સાઇઝ અને જથ્થો પસંદ કરો.",
    "કાર્ટ ખોલો, need-by તારીખ ભરો (Urgent ખરેખર જરૂરી હોય ત્યારે જ) અને Place Order દબાવો.",
    "ઓર્ડર હંમેશની જેમ approval → PO → challan → receipt થી જાય છે. My orders (ડિલિવરી અને માલ સ્વીકાર) માં જુઓ." ]} },

{ id:"grn", k:["grn","material received","goods receipt","gate entry","माल आया","GRN कैसे","જીઆરએન"],
  link:"/stock", roles:["storekeeper","supervisor","site_engineer","it_executive","director","ho_admin"],
  en:{ q:"How do I enter received material (GRN)?", a:[
    "Open Material & Procurement → Material Stock & Inventory, pick the site.",
    "Choose GRN entry, select the vendor (always from the master) and the item from search, enter quantity, rate and challan details.",
    "Save — stock balance updates instantly: balance = Received + Returned-to-store − Issued − Returned-to-vendor.",
    "Issue-to-worker, Settle (records consumption) and Return-to-vendor are on the same screen.",
    "If an item is missing from the master, use ＋ Add to Item Master (needs stock rights) — no free-typed names." ]},
  hi:{ q:"आया हुआ माल (GRN) कैसे चढ़ाएँ?", a:[
    "Material & Procurement → Material Stock & Inventory खोलें, साइट चुनें।",
    "GRN चुनें, वेंडर (हमेशा मास्टर से) और आइटम सर्च से लें; मात्रा, रेट, चालान भरें।",
    "Save करें — बैलेंस तुरंत बदलता है: आया + स्टोर-वापसी − इश्यू − वेंडर-वापसी।",
    "Issue, Settle (खपत) और वेंडर-वापसी इसी स्क्रीन पर हैं।",
    "आइटम मास्टर में न हो तो ＋ Add to Item Master (stock अधिकार चाहिए) — हाथ से नाम न लिखें।" ]},
  gu:{ q:"આવેલો માલ (GRN) કેવી રીતે ચઢાવવો?", a:[
    "Material & Procurement → Material Stock & Inventory ખોલો, સાઇટ પસંદ કરો.",
    "GRN પસંદ કરો, વેન્ડર (હંમેશા માસ્ટરમાંથી) અને આઇટમ સર્ચથી લો; જથ્થો, ભાવ, ચલણ ભરો.",
    "Save કરો — બેલેન્સ તરત બદલાય: આવેલ + સ્ટોર-પરત − ઇશ્યૂ − વેન્ડર-પરત.",
    "Issue, Settle (વપરાશ) અને વેન્ડર-પરત આ જ સ્ક્રીન પર છે.",
    "આઇટમ માસ્ટરમાં ન હોય તો ＋ Add to Item Master (stock હક જોઈએ) — હાથે નામ ન લખો." ]} },

{ id:"password", k:["password","change password","forgot","reset","पासवर्ड","પાસવર્ડ","login problem","can't login"],
  link:"/login", roles:null,
  en:{ q:"Login problem / how do I reset my password?", a:[
    "Login is your mobile number + password. First-time users set their password on first login.",
    "Wrong password 5 times locks that browser for 5 minutes — wait and retry carefully.",
    "Forgot the password? Only the Director can reset it: they open Workers & Staff Master → your row → Edit → Reset password. Then you set a new one at login.",
    "'Violates row-level security' after an update means a stale session — just log out and log in again.",
    "Number not registered? Ask the Director to add you as staff first." ]},
  hi:{ q:"लॉगिन दिक्कत / पासवर्ड रीसेट कैसे?", a:[
    "लॉगिन = मोबाइल नंबर + पासवर्ड। पहली बार वाले पहले लॉगिन पर पासवर्ड बनाते हैं।",
    "5 बार ग़लत पासवर्ड पर वह ब्राउज़र 5 मिनट लॉक — रुककर ध्यान से दोबारा करें।",
    "भूल गए? सिर्फ़ डायरेक्टर रीसेट कर सकते हैं: Workers & Staff Master → आपकी पंक्ति → Edit → Reset password। फिर लॉगिन पर नया बनाएँ।",
    "अपडेट के बाद 'row-level security' दिखे तो बस लॉगआउट कर दोबारा लॉगिन करें।",
    "नंबर रजिस्टर्ड नहीं? पहले डायरेक्टर से स्टाफ़ में जुड़वाएँ।" ]},
  gu:{ q:"લૉગિન સમસ્યા / પાસવર્ડ રીસેટ કેવી રીતે?", a:[
    "લૉગિન = મોબાઇલ નંબર + પાસવર્ડ. પહેલી વારના યુઝર પહેલા લૉગિન વખતે પાસવર્ડ બનાવે.",
    "5 વાર ખોટો પાસવર્ડ = એ બ્રાઉઝર 5 મિનિટ લૉક — રાહ જોઈ ધ્યાનથી ફરી કરો.",
    "ભૂલી ગયા? માત્ર ડિરેક્ટર રીસેટ કરી શકે: Workers & Staff Master → તમારી પંક્તિ → Edit → Reset password. પછી લૉગિન પર નવો બનાવો.",
    "અપડેટ પછી 'row-level security' દેખાય તો લૉગઆઉટ કરી ફરી લૉગિન કરો.",
    "નંબર રજિસ્ટર્ડ નથી? પહેલા ડિરેક્ટર પાસે સ્ટાફમાં ઉમેરાવો." ]} },

{ id:"dpr", k:["dpr","daily progress","progress report","डीपीआर","ડીપીઆર","daily report"],
  link:"/dpr", roles:["site_engineer","supervisor","director","it_executive"],
  en:{ q:"How do I file the Daily Progress Report (DPR)?", a:[
    "Open Site Execution → Daily Progress Report (mobile: DPR tab).",
    "Pick the site and date. Manpower fills automatically from the day's verified attendance.",
    "Add work items — search the BOQ short names and enter today's quantity per line.",
    "Attach geo-tagged site photos and note any hindrances (rain, client hold, material wait).",
    "Save. Management sees it in Site Reports the same evening. One DPR per site per day." ]},
  hi:{ q:"डीपीआर कैसे भरें?", a:[
    "Site Execution → Daily Progress Report खोलें (मोबाइल: DPR टैब)।",
    "साइट और तारीख़ चुनें। मैनपावर उस दिन की वेरिफ़ाइड हाज़िरी से अपने आप भरता है।",
    "काम जोड़ें — BOQ शॉर्ट नाम सर्च कर आज की मात्रा भरें।",
    "साइट की जियो-टैग फोटो लगाएँ और रुकावटें (बारिश, क्लाइंट होल्ड, माल) नोट करें।",
    "Save करें। मैनेजमेंट उसी शाम Site Reports में देखता है। एक साइट = एक DPR प्रतिदिन।" ]},
  gu:{ q:"ડીપીઆર કેવી રીતે ભરવો?", a:[
    "Site Execution → Daily Progress Report ખોલો (મોબાઇલ: DPR ટેબ).",
    "સાઇટ અને તારીખ પસંદ કરો. મેનપાવર એ દિવસની વેરિફાઇડ હાજરીથી આપોઆપ ભરાય.",
    "કામ ઉમેરો — BOQ શોર્ટ નામ સર્ચ કરી આજનો જથ્થો ભરો.",
    "જિયો-ટેગ ફોટા જોડો અને અડચણો (વરસાદ, ક્લાયન્ટ હોલ્ડ, માલ) નોંધો.",
    "Save કરો. મેનેજમેન્ટ એ જ સાંજે Site Reports માં જુએ. એક સાઇટ = એક DPR રોજ." ]} },

{ id:"notice", k:["notice","notice board","acknowledge","सूचना","નોટિસ","announcement","circular"],
  link:"/notices", roles:null,
  en:{ q:"How does the Notice Board work?", a:[
    "Open Communication → Notice Board. The number badge in the menu shows unread notices.",
    "Pinned 📌 and urgent notices sit on top; opening the board marks notices as seen automatically.",
    "If a notice says Acknowledge, tap ✋ Acknowledge — the office tracks who has confirmed reading.",
    "Comment on a notice if comments are enabled; download any attached PDF/photo/Excel from the 📎 chips.",
    "Today's motivational quote sits at the top and also on your login page and dashboard." ]},
  hi:{ q:"नोटिस बोर्ड कैसे काम करता है?", a:[
    "Communication → Notice Board खोलें। मेन्यू का नंबर बैज बिना पढ़ी सूचनाएँ दिखाता है।",
    "पिन 📌 और अर्जेंट ऊपर रहते हैं; बोर्ड खोलते ही 'देखा' अपने आप दर्ज होता है।",
    "Acknowledge माँगे तो ✋ दबाएँ — ऑफ़िस देखता है किसने पढ़कर पुष्टि की।",
    "कमेंट खुले हों तो कमेंट करें; 📎 से PDF/फोटो/Excel डाउनलोड करें।",
    "आज का प्रेरक वाक्य ऊपर, लॉगिन पेज और डैशबोर्ड पर भी दिखता है।" ]},
  gu:{ q:"નોટિસ બોર્ડ કેવી રીતે કામ કરે?", a:[
    "Communication → Notice Board ખોલો. મેનૂનો નંબર બેજ ન વાંચેલી નોટિસ બતાવે.",
    "પિન 📌 અને અર્જન્ટ ઉપર રહે; બોર્ડ ખોલતાં 'જોયું' આપોઆપ નોંધાય.",
    "Acknowledge માંગે તો ✋ દબાવો — ઑફિસ જુએ કોણે વાંચી પુષ્ટિ કરી.",
    "કૉમેન્ટ ખુલ્લી હોય તો કરો; 📎 થી PDF/ફોટો/Excel ડાઉનલોડ કરો.",
    "આજનું પ્રેરક વાક્ય ઉપર, લૉગિન પેજ અને ડેશબોર્ડ પર પણ દેખાય." ]} },

{ id:"rental", k:["rental","machine rent","room rent","jcb","किराया","ભાડું","rent due"],
  link:"/rentals", roles:null,
  en:{ q:"How do rentals (machines & rooms) work?", a:[
    "Site Execution → Machines & Rooms (Rent). Two tabs: Machines and Rooms.",
    "Add with site, owner/supplier, monthly rent, deposit, start date and rent-due day — the Next rent due column turns red when due within 3 days.",
    "Machine names come from the type master dropdown (add a new type inline if needed); rooms are free text.",
    "Upload the machine and operator documents on the 📄 button; Edit fixes any wrong rent; End closes the rental (deposit return is handled outside the app)." ]},
  hi:{ q:"किराये (मशीन/रूम) कैसे चलते हैं?", a:[
    "Site Execution → Machines & Rooms (Rent)। दो टैब: Machines और Rooms।",
    "साइट, मालिक, मासिक किराया, डिपॉज़िट, शुरुआत और किराया-तारीख़ भरें — 3 दिन में देय होते ही Next rent due लाल हो जाता है।",
    "मशीन का नाम टाइप-मास्टर ड्रॉपडाउन से (नया टाइप वहीं जोड़ें); रूम फ्री टेक्स्ट।",
    "📄 से मशीन/ऑपरेटर काग़ज़ अपलोड करें; Edit से ग़लत किराया सुधारें; End से बंद करें।" ]},
  gu:{ q:"ભાડાં (મશીન/રૂમ) કેવી રીતે ચાલે?", a:[
    "Site Execution → Machines & Rooms (Rent). બે ટેબ: Machines અને Rooms.",
    "સાઇટ, માલિક, માસિક ભાડું, ડિપોઝિટ, શરૂઆત અને ભાડા-તારીખ ભરો — 3 દિવસમાં ડ્યૂ થતાં Next rent due લાલ થાય.",
    "મશીનનું નામ ટાઇપ-માસ્ટર ડ્રોપડાઉનમાંથી (નવો ટાઇપ ત્યાં જ ઉમેરો); રૂમ ફ્રી ટેક્સ્ટ.",
    "📄 થી દસ્તાવેજ અપલોડ કરો; Edit થી ખોટું ભાડું સુધારો; End થી બંધ કરો." ]} },

{ id:"leave_approve", k:["approve leave","leave approval","team leave","छुट्टी मंज़ूर","રજા મંજૂર"],
  link:"/leave", roles:["director","supervisor","ho_admin","hr_admin"],
  en:{ q:"How do I approve team leave requests?", a:[
    "You need the Leave → Approve tick in Access Rights (Director always can).",
    "Open Leave Requests → Approvals tab — it lists only requests waiting at YOUR level of the chain.",
    "✓ Approve moves it to the next level (or finalises), ✗ Reject asks for a reason sent to the employee, ？ Need info pauses it.",
    "The employee gets a bell notification instantly; every action is audit-logged.",
    "The Director configures the 1–3 level chain and company holidays in the Settings tab." ]},
  hi:{ q:"टीम की छुट्टियाँ कैसे मंज़ूर करें?", a:[
    "Access Rights में Leave → Approve टिक चाहिए (डायरेक्टर हमेशा कर सकते हैं)।",
    "Leave Requests → Approvals टैब — सिर्फ़ आपके स्तर पर रुकी अर्ज़ियाँ दिखती हैं।",
    "✓ Approve अगले स्तर/अंतिम मंज़ूरी; ✗ Reject कारण के साथ; ？ Need info रोक देता है।",
    "कर्मचारी को तुरंत बेल सूचना; हर कार्रवाई ऑडिट में दर्ज।",
    "डायरेक्टर Settings टैब में 1–3 स्तर की चेन और छुट्टियाँ सेट करते हैं।" ]},
  gu:{ q:"ટીમની રજા કેવી રીતે મંજૂર કરવી?", a:[
    "Access Rights માં Leave → Approve ટિક જોઈએ (ડિરેક્ટર હંમેશા કરી શકે).",
    "Leave Requests → Approvals ટેબ — માત્ર તમારા સ્તરે અટકેલી અરજીઓ દેખાય.",
    "✓ Approve આગલા સ્તરે/અંતિમ; ✗ Reject કારણ સાથે; ？ Need info અટકાવે.",
    "કર્મચારીને તરત બેલ જાણ; દરેક ક્રિયા ઑડિટમાં નોંધાય.",
    "ડિરેક્ટર Settings ટેબમાં 1–3 સ્તરની ચેઇન અને રજાઓ સેટ કરે." ]} },

{ id:"backup", k:["backup","restore","download data","बैकअप","બેકઅપ","recover"],
  link:"/backup", roles:["director"],
  en:{ q:"How do backup and restore work? (Director)", a:[
    "Admin → Backup & Restore. ⬇ Download backup exports EVERY table and record into one file on your computer.",
    "Do it every Monday, and ALWAYS before running any SQL.",
    "Restore: upload a backup file, review its summary, type RESTORE and confirm — it puts back MISSING records only; it never overwrites or deletes anything current.",
    "Photos/documents live in Supabase Storage and are not inside this file (media backup is a separate routine)." ]},
  hi:{ q:"बैकअप और रिस्टोर कैसे? (डायरेक्टर)", a:[
    "Admin → Backup & Restore। ⬇ Download backup हर टेबल-रिकॉर्ड एक फ़ाइल में उतारता है।",
    "हर सोमवार करें, और किसी भी SQL से पहले हमेशा।",
    "Restore: फ़ाइल अपलोड करें, सार देखें, RESTORE टाइप कर पुष्टि करें — सिर्फ़ ग़ायब रिकॉर्ड वापस आते हैं; मौजूदा कुछ नहीं बदलता।",
    "फोटो/दस्तावेज़ Storage में हैं, इस फ़ाइल में नहीं।" ]},
  gu:{ q:"બેકઅપ અને રિસ્ટોર કેવી રીતે? (ડિરેક્ટર)", a:[
    "Admin → Backup & Restore. ⬇ Download backup દરેક ટેબલ-રેકોર્ડ એક ફાઇલમાં ઉતારે.",
    "દર સોમવારે કરો, અને કોઈપણ SQL પહેલાં હંમેશા.",
    "Restore: ફાઇલ અપલોડ કરો, સાર જુઓ, RESTORE ટાઇપ કરી પુષ્ટિ કરો — માત્ર ગુમ રેકોર્ડ પાછા આવે; હાલનું કંઈ બદલાય નહીં.",
    "ફોટા/દસ્તાવેજ Storage માં છે, આ ફાઇલમાં નહીં." ]} },

{ id:"rights", k:["access rights","permission","tick","अधिकार","परमिशन","હક","access denied","cannot save","not allowed"],
  link:"/access", roles:null,
  en:{ q:"I can't save / it says not allowed — permissions explained", a:[
    "Every action needs a tick in Admin → Access Rights, per site: View to see, Create to add, Approve/Verify to check, Manage to edit/delete.",
    "The database itself enforces these — even outside the screens — so a missing tick means a refused save.",
    "Rule of thumb: doers get View+Create, checkers get Approve/Verify, only office admins get Manage.",
    "Ask the Director to open Access Rights → your name → the site tab, and tick the module (there are ready role templates).",
    "After rights change, log out and back in once." ]},
  hi:{ q:"सेव नहीं हो रहा / 'not allowed' — अधिकार समझें", a:[
    "हर काम को Admin → Access Rights में साइट-वार टिक चाहिए: View देखना, Create जोड़ना, Approve/Verify जाँच, Manage सुधार/हटाना।",
    "यह डेटाबेस स्तर पर लागू है — टिक न हो तो सेव मना हो जाता है।",
    "नियम: करने वाले View+Create, जाँचने वाले Approve/Verify, सिर्फ़ ऑफ़िस एडमिन Manage।",
    "डायरेक्टर से कहें: Access Rights → आपका नाम → साइट टैब → मॉड्यूल टिक (तैयार टेम्पलेट भी हैं)।",
    "अधिकार बदलने के बाद एक बार लॉगआउट-लॉगिन करें।" ]},
  gu:{ q:"સેવ નથી થતું / 'not allowed' — હક સમજો", a:[
    "દરેક કામ માટે Admin → Access Rights માં સાઇટ-વાર ટિક જોઈએ: View જોવા, Create ઉમેરવા, Approve/Verify ચકાસવા, Manage સુધારવા/કાઢવા.",
    "આ ડેટાબેઝ સ્તરે લાગુ છે — ટિક ન હોય તો સેવ નકારાય.",
    "નિયમ: કરનારા View+Create, ચકાસનારા Approve/Verify, માત્ર ઑફિસ એડમિન Manage.",
    "ડિરેક્ટરને કહો: Access Rights → તમારું નામ → સાઇટ ટેબ → મોડ્યુલ ટિક (તૈયાર ટેમ્પલેટ છે).",
    "હક બદલાયા પછી એક વાર લૉગઆઉટ-લૉગિન કરો." ]} },

{ id:"billing", k:["ra bill","boq","billing","running account","बिल","બિલ","measurement","abstract","tally"],
  link:"/billing", roles:["billing_engineer","director","ho_admin","it_executive"],
  en:{ q:"How does BOQ & RA billing work?", a:[
    "BOQ Master holds the client's bill of quantities (CSV upload, short names for easy search). Progress on BOQ lines comes ONLY from RA bills.",
    "RA bills are made in Staged mode: enter cumulative measured quantities per BOQ line; staged payment-group lines (e.g. 60/30/10) split automatically.",
    "The printable abstract always shows the full client description; the app shows short names.",
    "Tally export sits under Commercial for the accountant. Writes here need the Billing ticks in Access Rights." ]},
  hi:{ q:"BOQ और RA बिलिंग कैसे चलती है?", a:[
    "BOQ Master में क्लाइंट की मात्राएँ हैं (CSV अपलोड, शॉर्ट नाम)। BOQ प्रगति सिर्फ़ RA बिल से बदलती है।",
    "RA बिल Staged मोड में बनते हैं: लाइन-वार संचयी मापी मात्रा भरें; स्टेज्ड ग्रुप (जैसे 60/30/10) अपने आप बँटते हैं।",
    "प्रिंट एब्सट्रैक्ट में हमेशा पूरा विवरण; ऐप में शॉर्ट नाम।",
    "Tally एक्सपोर्ट Commercial में है। यहाँ लिखने के लिए Billing टिक चाहिए।" ]},
  gu:{ q:"BOQ અને RA બિલિંગ કેવી રીતે ચાલે?", a:[
    "BOQ Master માં ક્લાયન્ટની માત્રા છે (CSV અપલોડ, શોર્ટ નામ). BOQ પ્રગતિ માત્ર RA બિલથી બદલાય.",
    "RA બિલ Staged મોડમાં બને: લાઇન-વાર સંચિત માપેલ માત્રા ભરો; સ્ટેજ્ડ ગ્રુપ (60/30/10) આપોઆપ વહેંચાય.",
    "પ્રિન્ટ એબ્સ્ટ્રેક્ટમાં હંમેશા પૂરું વર્ણન; એપમાં શોર્ટ નામ.",
    "Tally એક્સપોર્ટ Commercial માં છે. અહીં લખવા Billing ટિક જોઈએ." ]} },

{ id:"bank", k:["bank details","update bank","ifsc","बैंक","બેંક","account number","kyc"],
  link:"/workers", roles:null,
  en:{ q:"How do I update my bank details?", a:[
    "Bank details (account no., IFSC, PAN) are edited only by the Director in Workers & Staff Master → your row → Edit — this protects payroll from tampering.",
    "Send your correct details to the Director/HR; the staff list shows a Bank ✓ once filled.",
    "Bank fields flow into the payroll Excel automatically for salary transfer." ]},
  hi:{ q:"बैंक विवरण कैसे बदलवाएँ?", a:[
    "बैंक विवरण (खाता, IFSC, PAN) सिर्फ़ डायरेक्टर Workers & Staff Master → आपकी पंक्ति → Edit से बदलते हैं — पेरोल की सुरक्षा के लिए।",
    "सही विवरण डायरेक्टर/HR को भेजें; भरते ही सूची में Bank ✓ दिखता है।",
    "बैंक फ़ील्ड सैलरी ट्रांसफ़र के पेरोल Excel में अपने आप जाते हैं।" ]},
  gu:{ q:"બેંક વિગત કેવી રીતે બદલાવવી?", a:[
    "બેંક વિગત (ખાતું, IFSC, PAN) માત્ર ડિરેક્ટર Workers & Staff Master → તમારી પંક્તિ → Edit થી બદલે — પગારની સુરક્ષા માટે.",
    "સાચી વિગત ડિરેક્ટર/HR ને મોકલો; ભરાતાં યાદીમાં Bank ✓ દેખાય.",
    "બેંક ફીલ્ડ પગાર ટ્રાન્સફરના Excel માં આપોઆપ જાય." ]} },

{ id:"muster", k:["muster","proxy","mark on behalf","मस्टर","મસ્ટર","proxy punch"],
  link:"/m/muster", roles:["supervisor","site_engineer","director"],
  en:{ q:"How do I mark attendance on behalf of a worker (muster)?", a:[
    "Only the site supervisor/incharge (with attendance rights) can proxy-punch, from mobile → Muster.",
    "Find the worker in the site roster and tap Mark in (or Mark out).",
    "The live camera opens — take a live photo of the worker at site (gallery photos are blocked).",
    "The punch saves flagged as proxy with your name attached, and goes through normal evening verification." ]},
  hi:{ q:"वर्कर की ओर से हाज़िरी (मस्टर) कैसे लगाएँ?", a:[
    "सिर्फ़ साइट सुपरवाइज़र/इंचार्ज (attendance अधिकार वाले) मोबाइल → Muster से लगा सकते हैं।",
    "रोस्टर में वर्कर ढूँढें, Mark in (या Mark out) दबाएँ।",
    "लाइव कैमरा खुलेगा — साइट पर वर्कर की लाइव फोटो लें (गैलरी बंद है)।",
    "पंच proxy मार्क होकर आपके नाम के साथ सेव होता है और शाम को वेरिफ़ाई होता है।" ]},
  gu:{ q:"વર્કર વતી હાજરી (મસ્ટર) કેવી રીતે કરવી?", a:[
    "માત્ર સાઇટ સુપરવાઇઝર/ઇન્ચાર્જ (attendance હકવાળા) મોબાઇલ → Muster થી કરી શકે.",
    "રોસ્ટરમાં વર્કર શોધી Mark in (કે Mark out) દબાવો.",
    "લાઇવ કેમેરો ખુલશે — સાઇટ પર વર્કરનો લાઇવ ફોટો લો (ગેલેરી બંધ છે).",
    "પંચ proxy તરીકે તમારા નામ સાથે સેવ થાય અને સાંજે વેરિફાય થાય." ]} },
];

// role → suggested starter questions (KB ids)
export const ROLE_SUGGEST = {
  director: ["backup","rights","leave_approve","billing","notice"],
  ho_admin: ["salary_view","leave_approve","rights","expense","billing"],
  hr_admin: ["leave_approve","notice","rights","salary_view"],
  billing_engineer: ["billing","dpr","indent","leave_apply"],
  site_engineer: ["dpr","indent","grn","punch","leave_apply"],
  supervisor: ["muster","att_rejected","punch","leave_approve","dpr"],
  storekeeper: ["grn","indent","punch","leave_apply"],
  it_executive: ["rights","password","backup","notice"],
  default: ["punch","leave_apply","salary_view","expense","password"],
};

// page path → boosted KB ids (context-aware help)
export const PAGE_CONTEXT = {
  "/attendance": ["att_rejected","punch","muster"], "/leave": ["leave_apply","leave_approve"],
  "/stock": ["grn","indent"], "/procure": ["indent","grn"], "/purchase": ["indent"],
  "/expenses": ["expense"], "/dpr": ["dpr"], "/notices": ["notice"], "/rentals": ["rental"],
  "/billing": ["billing"], "/boq": ["billing"], "/backup": ["backup"], "/access": ["rights"],
  "/wages": ["salary_view","leave_apply"], "/items": ["grn"], "/m": ["punch","gps"],
  "/m/muster": ["muster"], "/workers": ["bank","rights"],
};
