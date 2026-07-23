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
        '<b>👑 Admin</b> — সব দেখে ও নিয়ন্ত্রণ করে: user approve/block, cashier ঠিক করা, report permission, খরচের বিষয়, পাসওয়ার্ড রিসেট।',
        '<b>💰 Cashier</b> — collector-দের জমা দেওয়া টাকা "confirm" করে; পুজোর খরচ লেখে; "কার হাতে কত" report পায়।',
        '<b>Collector</b> — entry দেয় আর নিজের "আমার হিসাব" দেখে। admin আলাদা করে report permission দিলে তবেই কেন্দ্রীয় report দেখে।',
      ],
      en: [
        '<b>👑 Admin</b> — sees and controls everything: approve/block users, set cashiers, report permissions, expense subjects, password resets.',
        '<b>💰 Cashier</b> — confirms cash handed over by collectors; records puja expenses; gets the "cash in hand" report.',
        '<b>Collector</b> — makes entries and sees their own "My summary". Sees central reports only if the admin grants permission.',
      ],
    },
  },
  {
    icon: '🏠',
    title: { bn: 'হোম স্ক্রিন — কী কী করা যায়', en: 'Home screen — what you can do' },
    body: {
      bn: [
        '<b>🏪 দোকান / 🙍 ব্যক্তি / 🤝 সদস্য</b> — নতুন চাঁদাদাতা যোগ করা (কত টাকা কথা হলো + এখন কিছু দিলে সেটা)।',
        '<b>🏪🏪 পরপর দোকান</b> — একই রাস্তার অনেক দোকান দ্রুত পরপর তোলা।',
        '<b>🛣️ রোড / 🛺 টোটো / 🚌 বাস</b> — দিনের রাস্তার কালেকশন (বাসে নাম+নম্বর)।',
        '<b>💰 টাকা জমা / বাকি</b> — কারো বাকি টাকা পরে জমা নেওয়া (খাতা list-এ যায়)।',
        '<b>🤝 জমা দিলাম</b> — তোমার হাতের টাকা cashier-কে জমা দেওয়া।',
        '<b>🧾 খরচ</b> (শুধু cashier/admin) ও <b>✅ জমা নেওয়া confirm</b> (শুধু cashier)।',
      ],
      en: [
        '<b>🏪 Shop / 🙍 Person / 🤝 Member</b> — add a new donor (pledged amount + anything paid now).',
        '<b>🏪🏪 Bulk shops</b> — quickly add many shops on the same road one after another.',
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
        'শেষে একটা <b>summary</b> দেখাবে — যেকোনো লাইনে ✏️ চেপে ঠিক করা যায়। ঠিক থাকলে "সেভ করো"।',
        'Save হলে entry তোমার ফোনে জমা, আর নেট থাকলে তখনই sync হয়ে যায়।',
      ],
      en: [
        'It goes step by step — one question at a time; type, or tap 🎤 to speak.',
        'Amounts work as <b>digits or words</b> — "500" or "five hundred" both understood.',
        'At the end you get a <b>summary</b> — tap ✏️ on any line to fix it. If correct, tap "Save".',
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
        'তোমার হাতে টাকা জমে গেলে <b>🤝 জমা দিলাম</b> → কোন cashier + কত নগদ/UPI।',
        'Cashier <b>✅ জমা নেওয়া confirm</b>-এ গিয়ে "জমা নিলাম" চাপলে তবেই সেটা confirmed হয়।',
        'Confirm হওয়ার আগ পর্যন্ত টাকা <b>তোমার হাতেই</b> ধরা থাকে (report-এ "confirm বাকি" দেখায়)।',
        'এতে "কার হাতে কত টাকা" সবসময় ঠিক থাকে — কোনো বিবাদ নেই।',
      ],
      en: [
        'When cash builds up, tap <b>🤝 Hand over</b> → choose a cashier + cash/UPI amount.',
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
        'নিচে <b>কেন্দ্রীয় রিপোর্ট</b> — মোট হিসাব, বাকির তালিকা, কার হাতে কত, কে কত তুলল, খরচ, দৈনিক। admin যাকে যেটা permission দেবে সে সেটাই দেখবে।',
      ],
      en: [
        '<b>📒 Ledger</b> — list of all donors; search at top, filter by "Dues only", tap a name for details + add payment.',
        '<b>📊 Report</b> — everyone\'s own <b>"My summary"</b> at the top (collected / handed over / in hand).',
        'Below are the <b>central reports</b> — overview, dues list, cash in hand, by collector, expenses, daily. Each user sees only what the admin grants.',
      ],
    },
  },
  {
    icon: '👑',
    title: { bn: 'Admin panel (Settings → 👑)', en: 'Admin panel (Settings → 👑)' },
    body: {
      bn: [
        'নতুন user register করলে এখানে <b>"Approve-এর অপেক্ষায়"</b> সেকশনে আসে — <b>✅ Approve</b> চাপো। <b>নতুন কেউ যোগ হলে উপরে "🔄 Refresh" চাপতে হবে</b>, নিজে থেকে আপডেট হয় না।',
        'প্রতিটা approved user-এ: <b>💰 ক্যাশিয়ার করা</b>, <b>🔑 পাসওয়ার্ড রিসেট</b> (একটা সাময়িক পাসওয়ার্ড দেবে — মুখে বলে দাও), <b>🚫 Block</b>, আর <b>📊 report permission</b> (chip চেপে দেওয়া/নেওয়া)।',
        '<b>🧾 খরচের বিষয়</b> — প্যান্ডেল, লাইট ইত্যাদি যোগ করো; cashier খরচ লেখার সময় এখান থেকে বাছবে।',
        'কেউ পাসওয়ার্ড ভুলে গেলে → এখানে রিসেট করো → ও সাময়িক পাসওয়ার্ডে ঢুকে নিজের নতুনটা বসাবে।',
      ],
      en: [
        'A newly registered user appears here under <b>"Awaiting approval"</b> — tap <b>✅ Approve</b>. <b>Tap "🔄 Refresh" after someone new registers</b> — the panel does not auto-update.',
        'For each approved user: <b>💰 Make cashier</b>, <b>🔑 Reset password</b> (gives a temporary password — tell them verbally), <b>🚫 Block</b>, and <b>📊 report permissions</b> (tap chips to grant/revoke).',
        '<b>🧾 Expense subjects</b> — add Pandal, Light, etc.; cashiers pick from these when recording an expense.',
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
