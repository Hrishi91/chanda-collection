// In-app user guide, rendered by renderHelp() in app.js (Settings → App guide).
// Bilingual: each section has bn + en; body is an array of HTML strings
// (trusted static content — safe to inject without escaping). Keep this in
// sync with docs/user-guide/app-guide.md.
window.HELP = [
  {
    icon: '🙏',
    title: { bn: 'এটা কী', en: 'What this app is' },
    body: {
      bn: [
        'গণেশ পুজোর <b>চাঁদা তোলার খাতা</b> — প্রত্যেক collector নিজের মোবাইলে entry করে।',
        'Internet ছাড়াও কাজ করে (offline); নেট এলে সব entry একটা কেন্দ্রীয় <b>Google Sheet</b>-এ জমা হয় (sync)।',
        'সব হিসাব এক জায়গায় মেলে — কে কত তুলল, কার হাতে কত, কত বাকি।',
      ],
      en: [
        'A <b>Ganesh Puja donation (chanda) ledger</b> — each collector makes entries on their own phone.',
        'Works offline; when the internet is back, every entry syncs to one central <b>Google Sheet</b>.',
        'All accounts reconcile in one place — who collected what, who holds how much cash, what is still due.',
      ],
    },
  },
  {
    icon: '🔑',
    title: { bn: 'Login ও Register', en: 'Login & Register' },
    body: {
      bn: [
        '<b>প্রথমবার:</b> "নতুন? নাম লেখাও" → পুরো নাম, username (ইংরেজি ছোট হাতের), ফোন, পাসওয়ার্ড দাও।',
        'Register করার পর <b>admin approve না করা পর্যন্ত ঢুকতে পারবে না</b> — admin-কে (হৃষিকেশ) জানিয়ো।',
        'Approve হলে username + পাসওয়ার্ড দিয়ে "ঢুকি"। একবার online login করলে তারপর offline-ও কাজ করবে।',
        '<b>মনে রেখো:</b> এক account একসাথে একটাই ফোনে চলে — নতুন ফোনে login করলে আগের ফোন logout হয়ে যায়।',
      ],
      en: [
        '<b>First time:</b> "New? Register" → full name, username (lowercase English), phone, password.',
        'After registering you <b>cannot log in until an admin approves you</b> — tell the admin (Hrishikesh).',
        'Once approved, log in with username + password. After one online login the app also works offline.',
        '<b>Note:</b> one account = one active phone — logging in on a new phone logs the old one out.',
      ],
    },
  },
  {
    icon: '👥',
    title: { bn: 'কে কী পারে (roles)', en: 'Roles — who can do what' },
    body: {
      bn: [
        '<b>👑 Admin</b> — সব দেখে ও নিয়ন্ত্রণ করে: user approve/block, <b>অন্যকে admin করা/সরানো</b>, cashier ঠিক করা, report permission, <b>এলাকার দায়িত্ব দেওয়া</b>, খরচের বিষয় ও এলাকা/location তালিকা, পাসওয়ার্ড রিসেট, <b>📜 কার্যকলাপের হিসাব</b>।',
        '<b>💰 Cashier</b> — collector-দের জমা দেওয়া টাকা "confirm" করে; পুজোর খরচ লেখে; "কার হাতে কত" report পায়; সংশোধনের আবেদন দেখে সিদ্ধান্ত নেয়।',
        '<b>Collector</b> — entry দেয় আর নিজের "আমার হিসাব" দেখে। admin আলাদা করে report permission দিলে তবেই কেন্দ্রীয় report দেখে।',
        '<b>📗 জমা-খাতা</b> — যে কেউ দেখতে পায়: কার কাছ থেকে কত পেয়েছি আর কাকে কত পাঠিয়েছি, একসঙ্গে। row-এ চাপলে ভেতরের ভাঙা হিসাব খোলে।',
        '<b>✏️ ঠিক করি</b> — নিজের entry-তে ⚠️ flag দেওয়ার পর নিজেই সংশোধন করতে পারো। পুরনোটা বাতিল হয়ে নতুন সঠিক entry বসে, তাই আগে কী লেখা ছিল সেটাও খাতায় থেকে যায়।',
        'সংশোধনের পর <b>receipt নম্বর একই থাকে</b> — দাতার ফোনে তো ওই নম্বরটাই আছে। শুধরে নিয়ে আবার পাঠিয়ে দাও, একই নম্বরে নতুনটা পুরনোটার জায়গা নেবে।',
        'সংশোধিত রসিদে <b>♻️ সংশোধিত</b> ছাপ পড়ে — ছবির ভেতরেই, তাই দাতা বুঝবে এটা আগেরটার বদলে, দ্বিতীয় দান নয়।',
        '<b>ভুল entry কে ঠিক করতে পারে:</b> admin যেকোনোটা; cashier শুধু সাধারণ collector-এর entry (নিজেরটা বা অন্য cashier/admin-এরটা নয়); collector নিজে বাতিল করতে পারে না — <b>আবেদন</b> পাঠায়, cashier/admin মঞ্জুর করলে তবেই বাতিল হয়।',
        '<b>অন্যের ভুল রোড/টোটো/বাস বা খরচ?</b> ✏️ আমার entry → উপরে <b>"সবার দৈনিক/খরচ"</b> চাপো — সবার entry কে করল সহ দেখাবে, সেখান থেকেই ✖️ বাতিল বা ⚠️ flag। (payment দাতার পাতায় সবার দেখা যায়)',
      ],
      en: [
        '<b>👑 Admin</b> — sees and controls everything: approve/block users, <b>grant/remove admin</b>, set cashiers, report permissions, <b>area duties</b>, expense subjects and area/location lists, password resets, <b>📜 activity log</b>.',
        '<b>💰 Cashier</b> — confirms cash handed over by collectors; records puja expenses; gets the "cash in hand" report; decides on correction requests.',
        '<b>Collector</b> — makes entries and sees their own "My summary". Sees central reports only if the admin grants permission.',
        '<b>Who can undo a wrong entry:</b> admin — any; cashier — only a regular collector\'s entry (not their own, not another cashier\'s/admin\'s); a collector cannot void at all — they <b>request</b> a correction and a cashier/admin approves it.',
        '<b>Someone else\'s wrong road/toto/bus or expense?</b> ✏️ My entries → tap <b>"Everyone\'s daily/expense"</b> at the top — it lists everyone\'s entries with who made each, and you ✖️ void or ⚠️ flag from there. (payments are on the donor\'s page for every collector)',
      ],
    },
  },
  {
    icon: '🏠',
    title: { bn: 'হোম স্ক্রিন — কী কী করা যায়', en: 'Home screen — what you can do' },
    body: {
      bn: [
        '<b>🏪 দোকান / 🙍 ব্যক্তি / 🤝 সদস্য</b> — নতুন চাঁদাদাতা যোগ করা (কত টাকা কথা হলো + এখন কিছু দিলে সেটা)। সেভের পর "➕ আরেকটা" বোতাম দিয়ে একই রাস্তায় পরের দোকান দ্রুত তোলা যায় (এলাকা মনে রাখে)।',
        '<b>🛣️ রোড / 🛺 টোটো / 🚌 বাস</b> — দিনের রাস্তার কালেকশন (বাসে নাম+নম্বর)।',
        '<b>💰 টাকা জমা / বাকি</b> — কারো বাকি টাকা পরে জমা নেওয়া (খাতা list-এ যায়)।',
        '<b>🤝 জমা দিলাম</b> — তোমার হাতের টাকা cashier-কে জমা দেওয়া।',
        '<b>🧾 খরচ</b> (শুধু cashier/admin) ও <b>✅ জমা নেওয়া confirm</b> (শুধু cashier)।',
      ],
      en: [
        '<b>🏪 Shop / 🙍 Person / 🤝 Member</b> — add a new donor (pledged amount + anything paid now). After saving, an "➕ One more" button lets you quickly add the next shop on the same road (area remembered).',
        '<b>🛣️ Road / 🛺 Toto / 🚌 Bus</b> — daily road collections (bus asks name + number).',
        '<b>💰 Add payment / dues</b> — take a later installment against someone\'s balance (opens the ledger).',
        '<b>🤝 Hand over</b> — give the cash in your hand to a cashier.',
        '<b>🧾 Expense</b> (cashier/admin only) and <b>✅ Confirm receipts</b> (cashier only).',
      ],
    },
  },
  {
    icon: '✍️',
    title: { bn: 'এন্ট্রি কীভাবে দেয়', en: 'How to make an entry' },
    body: {
      bn: [
        'প্রশ্ন-উত্তর ধাপে ধাপে এগোয় — একটা করে প্রশ্ন, তুমি টাইপ করো বা 🎤 চেপে বলো।',
        'টাকা <b>সংখ্যায় বা কথায়</b> দুভাবেই চলে — "৫০০" বা "পাঁচশো" দুটোই বোঝে।',
        'শেষ প্রশ্নের উত্তর দিলেই সাথে সাথে <b>সেভ হয়ে যায়</b> — আলাদা confirm screen নেই, উপরে চ্যাটেই সব উত্তর দেখা যায়।',
        'ভুল করে ফেললে সেভের পরের toast-এ ৫ সেকেন্ড <b>"ফিরিয়ে নাও"</b> বোতাম থাকে — চাপলে entry মুছে যায়।',
        'Save হলে entry তোমার ফোনে জমা, আর নেট থাকলে তখনই sync হয়ে যায়।',
      ],
      en: [
        'It goes step by step — one question at a time; type, or tap 🎤 to speak.',
        'Amounts work as <b>digits or words</b> — "500" or "five hundred" both understood.',
        'Answering the last question <b>saves it instantly</b> — no separate confirm screen; every answer is visible above in the chat.',
        'Made a mistake? The save toast shows an <b>"Undo"</b> button for 5 seconds — tap it to remove the entry.',
        'On save the entry is stored on your phone, and syncs immediately if you are online.',
      ],
    },
  },
  {
    icon: '💵',
    title: { bn: 'নগদ / UPI, pledge ও বাকি', en: 'Cash / UPI, pledge & dues' },
    body: {
      bn: [
        'প্রত্যেক টাকা জমায় জিজ্ঞেস করে — <b>নগদ / UPI / দুটোই</b>। "দুটোই" হলে নগদ ও UPI আলাদা করে লেখো।',
        '<b>কথা (pledge)</b> = মোট যত টাকা দেবে বলেছে। <b>জমা</b> = যত দিয়েছে। <b>বাকি = কথা − জমা।</b>',
        'একজন part-by-part দিতে পারে — যতবার দেবে ততবার "টাকা জমা" করো, বাকি নিজে থেকে কমবে।',
        'UPI তোমাদের নিজেদের নম্বরে আসে, তাই সেটাও নগদের মতোই "তোমার হাতে" গণ্য হয় — cashier-কে জমা না দেওয়া পর্যন্ত।',
      ],
      en: [
        'Every payment asks the mode — <b>Cash / UPI / Both</b>. For "Both", enter cash and UPI separately.',
        '<b>Pledged</b> = total promised. <b>Paid</b> = amount given so far. <b>Due = Pledged − Paid.</b>',
        'A donor can pay in parts — add a payment each time; the due updates automatically.',
        'UPI comes to your own number, so it counts as "in your hand" like cash — until you hand it to a cashier.',
      ],
    },
  },
  {
    icon: '🤝',
    title: { bn: 'জমা দেওয়া ও confirm', en: 'Handover & confirmation' },
    body: {
      bn: [
        'তোমার হাতে টাকা জমে গেলে <b>🤝 জমা দিলাম</b> → কোন cashier → তারপর একটাই পর্দায় প্রতিটা খাতের (দোকান/ব্যক্তি/সদস্য/বাস — নতুন এন্ট্রি; রোড/টোটো — দৈনিক) <b>💵 নগদ</b> আর <b>📱 UPI</b> আলাদা বোতামে অঙ্কসহ থাকে — <b>শুরুতে সবই বাছা</b>। যেটা দিচ্ছ না সেটায় চাপ দিয়ে বাদ দাও; নিচে <b>মোট</b> সাথে সাথে বদলায়। টাইপ করার কিছু নেই — হিসাব আগেই করা আছে।',
        'Cashier <b>✅ জমা নেওয়া confirm</b>-এ গিয়ে "জমা নিলাম" চাপলে তবেই সেটা confirmed হয় — আর সে <b>ঠিক একই ভাঙা দেখতে পায়</b> (কোন খাতের কত, নগদ/UPI আলাদা), তাই না দেখে অনুমোদন করতে হয় না।',
        'Confirm হওয়ার আগ পর্যন্ত টাকা <b>তোমার হাতেই</b> ধরা থাকে (report-এ "confirm বাকি" দেখায়)।',
        'এতে "কার হাতে কত টাকা" সবসময় ঠিক থাকে — কোনো বিবাদ নেই।',
      ],
      en: [
        'When cash builds up, tap <b>🤝 Hand over</b> → choose a cashier → then one screen lists every source (shop/person/member/bus — new entries; road/toto — daily) with its <b>💵 cash</b> and <b>📱 UPI</b> as separate buttons carrying the real figures, <b>all selected to begin with</b>. Tap off whatever you are not handing over; the <b>total</b> updates instantly. Nothing to type — the amounts are already worked out.',
        'It becomes confirmed only when the cashier opens <b>✅ Confirm receipts</b> and taps "Received".',
        'Until confirmed, the money stays counted <b>in your hand</b> (shown as "awaiting confirm").',
        'This keeps "cash in hand by collector" always correct — no disputes.',
      ],
    },
  },
  {
    icon: '📒',
    title: { bn: 'খাতা ও রিপোর্ট', en: 'Ledger & reports' },
    body: {
      bn: [
        '<b>📒 খাতা</b> — সব চাঁদাদাতার list; উপরে খুঁজতে পারো, "বাকি আছে" দিয়ে filter করো, নাম চেপে বিস্তারিত + টাকা জমা।',
        '<b>📊 রিপোর্ট</b> — উপরে সবার নিজের <b>"আমার হিসাব"</b> (তুলেছি/জমা দিয়েছি/হাতে আছে)।',
        'নিচে <b>কেন্দ্রীয় রিপোর্ট</b> — মোট হিসাব, বাকির তালিকা, কার হাতে কত, কে কত তুলল, <b>📍 এলাকা-ভিত্তিক</b>, খরচ, আর <b>দিনের রোড/টোটো</b>। admin যাকে যেটা permission দেবে সে সেটাই দেখবে। <b>বাস কালেকশন দৈনিক রিপোর্টে নেই</b> — বাস নাম-নম্বর নিয়ে receipt কাটে, তাই ওটা 📒 খাতার <b>বাস</b> tab-এ, দোকান/ব্যক্তির পাশে।',
        '<b>📍 এলাকা-ভিত্তিক</b> — কোন রাস্তায় কত উঠল, কত বাকি; সবচেয়ে বেশি তোলা এলাকা উপরে (🥇🥈🥉)।',
        '<b>দ্রুত খোলে:</b> রিপোর্ট আর খাতা ফোনে জমানো তথ্য থেকে সঙ্গে সঙ্গে দেখায়, নেট থাকলে পিছনে নিজে থেকে আপডেট হয় — তাই অপেক্ষা করতে হয় না, offline-ও খোলে।',
        '<b>📄 PDF:</b> যেকোনো কেন্দ্রীয় রিপোর্ট খুলে নিচের "PDF বানাও / প্রিন্ট" চাপো — ফোনের print থেকে <b>Save as PDF</b> বেছে নিলেই কমিটিকে দেওয়ার মতো ফাইল তৈরি।',
      ],
      en: [
        '<b>📒 Ledger</b> — list of all donors; search at top, filter by "Dues only", tap a name for details + add payment.',
        '<b>📊 Report</b> — everyone\'s own <b>"My summary"</b> at the top (collected / handed over / in hand).',
        'Below are the <b>central reports</b> — overview, dues list, cash in hand, by collector, <b>📍 by area</b>, expenses, daily. Each user sees only what the admin grants.',
        '<b>📍 By area</b> — how much each road collected and what is still due, ranked by collection (🥇🥈🥉).',
        '<b>Opens instantly:</b> ledger and reports render from data already stored on the phone and refresh in the background — no waiting, and they work offline.',
        '<b>📄 PDF:</b> open any central report and tap "Save as PDF / print" at the bottom — pick <b>Save as PDF</b> in the phone\'s print dialog for a committee-ready file.',
      ],
    },
  },
  {
    icon: '💰',
    title: { bn: 'হিসাব কীভাবে হয় (সূত্র)', en: 'How the maths works' },
    body: {
      bn: [
        '<b>দাতার বাকি</b> = কথা (pledge) − সব জমা। জমা <b>সব collector মিলিয়ে</b> ধরা হয় — সলিল ৪০০ আর রাম ৬০০ তুললে দাতার পুরো ১০০০-ই জমা।',
        '<b>আমার হাতে</b> = আমি তুললাম (চাঁদা + রোড/টোটো/বাস) + আমার কাছে জমা (confirm হওয়া) − আমি জমা দিলাম (confirm হওয়া) − আমার খরচ। যদিও দাতার হিসাব সবাই মিলে, <b>টাকা কার হাতে তা কখনো মেশে না</b>।',
        '<b>বাতিল (void) entry</b> সব হিসাব থেকে বাদ যায় — মোট, বাকি, হাতে, রিপোর্ট সব জায়গা থেকে; শুধু খাতায় কাটা অবস্থায় দেখা যায় (প্রমাণ থাকে)।',
        '<b>মিলিয়ে দেখা:</b> সবার হাতের টাকার যোগফল = মোট আদায় − মোট খরচ — সবসময়। না মিললে বুঝবে কোথাও entry ভুল আছে।',
      ],
      en: [
        "<b>A donor's due</b> = pledged − all payments, counted <b>across every collector</b> — if Salil takes 400 and Ram takes 600, the donor's full 1000 is paid.",
        '<b>My in-hand</b> = what I collected (payments + road/toto/bus) + handovers received (confirmed) − handovers given (confirmed) − my expenses. Donor totals combine, but <b>whose hand the money is in never mixes</b>.',
        '<b>Voided entries</b> drop out of every total — sums, dues, in-hand, reports — but stay visible struck-through in the ledger (audit trail).',
        "<b>Reconciliation:</b> everyone's in-hand added up = total collected − total expenses, always. If it doesn't match, an entry is wrong somewhere.",
      ],
    },
  },
  {
    icon: '🧾',
    title: { bn: 'রসিদ ও বাকির তাগাদা', en: 'Receipts & dues reminders' },
    body: {
      bn: [
        '<b>🧾 রসিদ</b> — টাকা জমা নিলে (নতুন দাতার প্রথম জমা হোক বা কিস্তি) সেভের সাথে সাথে রসিদ পাতা <b>নিজে থেকেই খোলে</b> (দাতা, তারিখ, এই কিস্তি, মোট জমা/কথা, বাকি, <b>রসিদ নং</b>)। দুটো বোতাম: <b>📷 WhatsApp/ছবি</b> (ছবি রসিদ) আর <b>💬 SMS/message</b> (দাতার WhatsApp না থাকলে — সংক্ষিপ্ত লেখা)। বাস কালেকশনেও একই — নাম+নম্বর দিয়ে সাথে সাথে রসিদ।',
        'রসিদ পাঠানোর পর নিচে দুটো বোতাম: তালিকা/খোঁজা থেকে এসেছ তো "🔍 তালিকায় ফিরি" (পরের দাতা ধরতে), নতুন দোকান/ব্যক্তি/সদস্য/বাস হলে "➕ আরেকটা" (একই টাইপের পরের এন্ট্রি) — আর সবসময় "শেষ, হোমে ফিরি"।',
        'রসিদ নম্বর (যেমন 2026-0007) প্রতিটা জমায় আলাদা, sync হলে বসে — কখনো ডবল হয় না।',
        '<b>রিপোর্টেও একই ভাঙা</b> — "আমার হিসাব"-এ <b>কোন খাতে কত আছে</b> অংশে খাতভিত্তিক নগদ/UPI/মোট দেখা যায়, তাই "আমার হাতে বাসের কত টাকা?" জানতে জমার স্ক্রিনে যেতে হয় না।',
        '<b>ডিজাইন admin ঠিক করে</b> — Admin → 🧾 রসিদ ডিজাইন-এ layout, কমিটির নাম, লোগো, রঙ, নিচের বার্তা বসানো যায়; live preview দেখায়।',
        '<b>📞 মনে করাও</b> — যে দাতার <b>বাকি আছে আর ফোন নম্বর দেওয়া আছে</b>, তার পাতায় এই বোতাম। চাপলে WhatsApp খুলে বার্তা আগে থেকেই লেখা থাকে (নাম + কত বাকি) — <b>তুমি নিজে send করবে</b>।',
        'রসিদের ছবি তোমার ফোনেই তৈরি — কোথাও আপলোড হয় না।',
      ],
      en: [
        '<b>🧾 Receipt</b> — taking a payment (a new donor\'s first payment or an installment) <b>opens the receipt page automatically</b> on save (donor, date, this payment, paid vs pledged, due, <b>receipt no.</b>). Two buttons: <b>📷 WhatsApp/image</b> and <b>💬 SMS/message</b>. Bus collections work the same way.',
        'Below the share buttons: if you came from the list/search, "🔍 Back to list" (to catch the next donor); for a new shop/person/member/bus, "➕ One more" (same type again); and always "Done, go home".',
        'The receipt number (e.g. 2026-0007) is unique per payment and appears once synced — never duplicated.',
        '<b>The design is set by the admin</b> — Admin → 🧾 Receipt design lets you choose a layout, committee name, logo, colour and footer message, with a live preview.',
        '<b>📞 Remind</b> — appears on donors who <b>still owe money and have a phone number</b>; opens WhatsApp with the message pre-written (name + amount due) — <b>you tap send yourself</b>.',
        'The receipt image is drawn on your own phone — nothing is uploaded.',
      ],
    },
  },
  {
    icon: '🔔',
    title: { bn: 'নোটিফিকেশন — সরাসরি কাজ সারো', en: 'Notifications — act right there' },
    body: {
      bn: [
        'হোম স্ক্রিনের উপরে যা যা তোমার অপেক্ষায় আছে তা <b>বিস্তারিত সহ</b> দেখায় — শুধু সংখ্যা নয়।',
        '<b>🙋 নতুন user</b> (admin) — নাম + username দেখে সেখান থেকেই <b>✅ Approve</b> বা <b>🚫 নাকচ</b>।',
        '<b>💰 জমা</b> (cashier) — কে কত টাকা কবে জমা দিল দেখে <b>✅ জমা নিলাম</b>।',
        '<b>⚠️ সংশোধনের আবেদন</b> — কারণ দেখে <b>👁 দেখো / সিদ্ধান্ত</b> চেপে review পাতায় গিয়ে মঞ্জুর বা নাকচ করো।',
        'প্রতি মিনিটে আর app-এ ফিরলেই নিজে থেকে আপডেট হয়।',
      ],
      en: [
        'The top of the home screen shows everything waiting for you <b>with details</b>, not just a count.',
        '<b>🙋 New user</b> (admin) — see the name + username and <b>✅ Approve</b> or <b>🚫 Decline</b> right there.',
        '<b>💰 Handover</b> (cashier) — see who handed over how much and when, then <b>✅ Received</b>.',
        '<b>⚠️ Correction request</b> — see the reason, then <b>👁 Review</b> to approve or reject on the review screen.',
        'Refreshes every minute and whenever you come back to the app.',
      ],
    },
  },
  {
    icon: '👑',
    title: { bn: 'Admin panel (Settings → 👑)', en: 'Admin panel (Settings → 👑)' },
    body: {
      bn: [
        'নতুন user register করলে এখানে <b>"Approve-এর অপেক্ষায়"</b> সেকশনে আসে — <b>✅ Approve</b> চাপো। <b>নতুন কেউ যোগ হলে উপরে "🔄 Refresh" চাপতে হবে</b>, নিজে থেকে আপডেট হয় না।',
        'প্রতিটা approved user-এ: <b>💰 ক্যাশিয়ার করা</b>, <b>👑 admin করা/সরানো</b>, <b>🔑 পাসওয়ার্ড রিসেট</b> (একটা সাময়িক পাসওয়ার্ড দেবে — মুখে বলে দাও), <b>🚫 Block</b>, <b>✏️ কী কী তুলতে পারবে</b> (দোকান · ব্যক্তি · সদস্য · বাস · রোড · টোটো, আর 🛠️ সংশোধন-ডেস্ক — chip চেপে দাও/নাও; কিচ্ছু না দিলে সব খোলা), <b>📊 report permission</b>, আর <b>📍 এলাকার দায়িত্ব</b>।',
        '<b>যা দেবে সেটুকুই পাবে।</b> নতুন user approve করলেই সে কিছু তুলতে পারে না — তুমি chip চেপে দেওয়ার পরেই পারবে। (রিপোর্টও চিরকাল এভাবেই চলে।) কার্ডে <b>⚠️ কিছুই দেওয়া হয়নি</b> লেখা থাকলে বুঝবে ওকে এখনো কিছু দাওনি।',
        '<b>সবার জন্য সবসময় খোলা</b> (permission লাগে না): নিজের তোলা দাতার চাঁদা, জমা দেওয়া, আমার entry/সংশোধন, আর বাকির তালিকা। <b>অন্য কারো দাতার</b> কাছে পৌঁছনো আলাদা permission।',
        '<b>💬 বার্তা</b> — সবাই এক জানালায়। <b>@</b> চেপে কাউকে বা দলকে (সবাই / ক্যাশিয়ার / admin) ডাকো — তার ফোনে খবর যাবে। বার্তা আসে অ্যাপের নিয়মিত sync-এর সঙ্গে, তাই এক মিনিটের মধ্যে পৌঁছয়।',
        '<b>বার্তা বন্ধ করা যায়</b> — admin panel → 🗂️ ডেটা-তে দেখবে কত বার্তা, কত KB, গত ২৪ঘণ্টায় কত। দ্রুত বাড়লে admin-এর ফোনে খবর যাবে আর হোমে <b>⏹️ বার্তা বন্ধ করো</b> বোতাম আসবে। বন্ধ করলে 💬 ট্যাব সবার কাছ থেকে চলে যায়, পুরনো বার্তা মোছে না, পরে আবার চালু করা যায়।',
        '<b>কিছু permission না থাকলে</b> হোমে entry-র বোতাম আসবে না — বদলে admin-এর নাম, ফোন আর WhatsApp লিংক দেখাবে। কিন্তু <b>দেখা বন্ধ নয়</b>: 📒 খাতা, 📊 রিপোর্ট, 📗 জমা-খাতা আর 💬 বার্তা সবই খোলা থাকে।',
        '<b>🧹 প্র্যাকটিসের ডেটা মুছে ফেলো</b> (training-এ, admin) — সব entry/চাঁদা/খরচ/জমা মুছে যায়, কিন্তু user, permission, এলাকা, খরচের বিষয়, receipt সেটিং থাকে। আগে backup নেওয়া হয়। Go Live হয় না — আবার প্র্যাকটিস করা যায়।',
        '<b>👑 admin:</b> নিজেকে admin থেকে সরানো যায় না, আর <b>শেষ admin-কেও সরানো যায় না</b> — যাতে কমিটি কখনো admin ছাড়া আটকে না যায়।',
        '<b>🧾 খরচের বিষয়</b> ও <b>📍 এলাকা / location তালিকা</b> — এখান থেকেই যোগ/বদল/মুছে ফেলা যায় (বাংলা + English দুটো নামই দিতে হয়)। বদলালে সবার ফোনে দ্রুত পৌঁছে যায়।',
        '<b>📜 কার্যকলাপ</b> — কে কখন কী করল তার হিসাব: বাতিল (void), সংশোধন মঞ্জুর/নাকচ, জমা confirm, admin/ক্যাশিয়ার বদল, পাসওয়ার্ড রিসেট, তালিকা বদল। মুছে ফেলা যায় না — জবাবদিহির জন্য।',
        '<b>🔄 নতুন বছরে দাতা আনো</b> — গত বছরের সব দাতা নতুন বছরে কপি করে (কোনো জমা কপি হয় না, pledge শুরুর হিসেবে থাকে)। ঐ বছরে আগে থেকে দাতা থাকলে চলবে না, তাই দুবার চাপলেও ডবল হবে না।',
        '<b>🟡 প্রশিক্ষণ → 🚀 Live</b> — শুরুতে সব practice mode-এ থাকে (রসিদে "নমুনা" লেখা, home-এ প্রশিক্ষণ চিহ্ন)। সবাই শিখে নিলে admin <b>Live শুরু করো</b> চাপবে — তিন ধাপ নিশ্চিত করে (LIVE টাইপ সহ) তবেই। তখন <b>সব training entry মুছে যায়</b> (user ও setting থাকে), রসিদ নং ০০০০০১ থেকে শুরু হয়। এটা ফেরানো যায় না।',
        'কেউ পাসওয়ার্ড ভুলে গেলে → এখানে রিসেট করো → ও সাময়িক পাসওয়ার্ডে ঢুকে নিজের নতুনটা বসাবে।',
      ],
      en: [
        'A newly registered user appears here under <b>"Awaiting approval"</b> — tap <b>✅ Approve</b>. <b>Tap "🔄 Refresh" after someone new registers</b> — the panel does not auto-update.',
        'For each approved user: <b>💰 Make cashier</b>, <b>👑 Make/remove admin</b>, <b>🔑 Reset password</b> (gives a temporary password — tell them verbally), <b>🚫 Block</b>, <b>✏️ Can collect</b> (shop · person · member · bus · road · toto, plus the 🛠️ correction desk — tap chips; grant nothing and everything stays open), <b>📊 report permissions</b>, and <b>📍 Area duties</b>.',
        '<b>Always open to everyone</b> (no permission needed): taking a later instalment from any donor, handing money over, my entries/fix, and the dues list.',
        '<b>👑 Admin:</b> you cannot remove your own admin role, and <b>the last admin cannot be removed</b> — so the committee can never be locked out.',
        '<b>🧾 Expense subjects</b> and <b>📍 Area / location lists</b> are edited here too (each needs a Bengali and an English name). Changes reach everyone\'s phone quickly.',
        '<b>📜 Activity log</b> — who did what and when: voids, correction approve/reject, handover confirms, admin/cashier changes, password resets, list edits. Append-only, for accountability.',
        '<b>🔄 Carry donors to new year</b> — copies last year\'s donor list into the new year (no payments carried; pledges kept as the starting ask). It refuses if that year already has donors, so it can never double-run.',
        'If someone forgets their password → reset it here → they log in with the temporary one and set their own.',
      ],
    },
  },
  {
    icon: '☁️',
    title: { bn: 'Sync, backup ও ভাষা', en: 'Sync, backup & language' },
    body: {
      bn: [
        'উপরে ডানদিকের ব্যাজ: <b>✅</b> = সব sync হয়ে গেছে, <b>⏳ সংখ্যা</b> = তত entry এখনো জমা হয়নি (নেট এলে নিজে যাবে, বা ব্যাজ/Settings থেকে "এখনই Sync")।',
        '<b>⚠️ Entry sync হওয়ার আগে app মুছো না</b> — না হলে ওই entry হারাবে।',
        '<b>💾 Backup</b> — Settings থেকে JSON ফাইল নামিয়ে রাখতে পারো, দরকারে আবার ফেরত আনা যায়।',
        '<b>🌐 ভাষা</b> — উপরে বা Settings-এ বাংলা/English toggle। <b>🎤 Voice</b>-এর জন্য সাধারণত internet লাগে; টাইপ সবসময় চলে।',
      ],
      en: [
        'Top-right badge: <b>✅</b> = all synced, <b>⏳ number</b> = that many entries not yet uploaded (auto-syncs when online, or tap the badge / "Sync now" in Settings).',
        '<b>⚠️ Do not delete the app before entries sync</b> — unsynced entries would be lost.',
        '<b>💾 Backup</b> — export a JSON file from Settings; you can import it back if needed.',
        '<b>🌐 Language</b> — Bengali/English toggle at the top or in Settings. <b>🎤 Voice</b> usually needs internet; typing always works.',
      ],
    },
  },
];
