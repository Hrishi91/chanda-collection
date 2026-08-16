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
        '<b>👑 Admin</b> — সব দেখে ও নিয়ন্ত্রণ করে: user approve/block, <b>অন্যকে admin করা/সরানো</b>, <b>কমিটির পদ আর কোন পদে কী করা যাবে</b>, cashier ঠিক করা, report permission, <b>এলাকার দায়িত্ব দেওয়া</b>, খরচের বিষয় ও এলাকা/location তালিকা, পাসওয়ার্ড রিসেট, <b>📜 কার্যকলাপের হিসাব</b>।',
        '<b>💰 Cashier</b> — collector-দের জমা দেওয়া টাকা "confirm" করে; পুজোর খরচ লেখে; "কার হাতে কত" report পায়; সংশোধনের আবেদন দেখে সিদ্ধান্ত নেয়।',
        '<b>Collector</b> — entry দেয় আর নিজের "আমার হিসাব" দেখে। admin আলাদা করে report permission দিলে তবেই কেন্দ্রীয় report দেখে।',
        '<b>📗 জমা-খাতা</b> — যে কেউ দেখতে পায়: কার কাছ থেকে কত পেয়েছি আর কাকে কত পাঠিয়েছি, একসঙ্গে। row-এ চাপলে ভেতরের ভাঙা হিসাব খোলে।',
        '<b>✏️ ঠিক করি</b> — নিজের entry-তে ⚠️ flag দেওয়ার পর নিজেই সংশোধন করতে পারো। পুরনোটা বাতিল হয়ে নতুন সঠিক entry বসে, তাই আগে কী লেখা ছিল সেটাও খাতায় থেকে যায়।',
        'সংশোধনের পর <b>receipt নম্বর একই থাকে</b> — দাতার ফোনে তো ওই নম্বরটাই আছে। শুধরে নিয়ে আবার পাঠিয়ে দাও, একই নম্বরে নতুনটা পুরনোটার জায়গা নেবে।',
        'সংশোধিত রসিদে <b>♻️ সংশোধিত</b> ছাপ পড়ে — ছবির ভেতরেই, তাই দাতা বুঝবে এটা আগেরটার বদলে, দ্বিতীয় দান নয়।',
        '<b>ভুল entry কে ঠিক করতে পারে:</b> admin যেকোনোটা; cashier শুধু সাধারণ collector-এর entry (নিজেরটা বা অন্য cashier/admin-এরটা নয়); collector নিজে বাতিল করতে পারে না — <b>আবেদন</b> পাঠায়, cashier/admin মঞ্জুর করলে তবেই বাতিল হয়।',
        '<b>অন্যের ভুল রোড/টোটো/বাস বা খরচ?</b> ✏️ আমার লেখা entry → উপরে <b>"সবার দৈনিক/খরচ"</b> চাপো — সবার entry কে করল সহ দেখাবে, সেখান থেকেই ✖️ বাতিল বা ⚠️ flag। (payment দাতার পাতায় সবার দেখা যায়)',
      ],
      en: [
        '<b>👑 Admin</b> — sees and controls everything: approve/block users, <b>grant/remove admin</b>, <b>committee posts and what each post may do</b>, set cashiers, report permissions, <b>area duties</b>, expense subjects and area/location lists, password resets, <b>📜 activity log</b>.',
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
        '<b>🤝 সদস্য</b> — কমিটির সদস্যের <b>চাঁদা তোলা</b>। তালিকা থেকে নাম বাছো → নগদ/UPI → <b>কীসের চাঁদা, লিখতেই হবে</b>। একই সদস্যের যতবার খুশি entry করা যায়; নামের পাশে দেখায় তিনি এ পর্যন্ত মোট কত দিয়েছেন।',
        '<b>🎖️ কমিটির সদস্য</b> — <b>আলাদা স্ক্রিন, আলাদা permission</b>। কে কে সদস্য সেটা এখানে ঠিক হয়: নাম, পদ, email, ফোন, আর কার app-অ্যাকাউন্ট কোনটা। একজন রেজিস্টার রাখেন, অনেকে চাঁদা তোলেন — তাই দুটো আলাদা।',
        '<b>🔴 লাল বিন্দু</b> — কোনো বোতামে লাল বিন্দু মানে <b>ওখানে তোমার কাজ বাকি</b>। কাজটা সেরে ফেললে বিন্দু নিজেই নিভে যায়, তাই যেটা জ্বলে আছে সেটা সত্যিই বাকি।',
        '<b>নতুন কিছু যোগ হয়েছে অথচ দেখতে পাচ্ছ না?</b> ⚙️ সেটিংসের একদম নিচে লেখা থাকে তোমার ফোনে <b>কোন version</b> চলছে। পাশের <b>🔄 আপডেট খুঁজি</b> চাপলেই নতুনটা নেমে এসে নিজে থেকে খুলে যাবে।',
        '<b>💰 টাকা জমা / বাকি</b> — কারো বাকি টাকা পরে জমা নেওয়া (খাতা list-এ যায়)।',
        '<b>🤝 জমা দিলাম</b> — তোমার হাতের টাকা cashier-কে জমা দেওয়া।',
        '<b>🧾 খরচ</b> (শুধু cashier/admin) ও <b>✅ জমা নেওয়া confirm</b> (শুধু cashier)।',
      ],
      en: [
        '<b>🏪 Shop / 🙍 Person / 🤝 Member</b> — add a new donor (pledged amount + anything paid now). After saving, an "➕ One more" button lets you quickly add the next shop on the same road (area remembered).',
        '<b>🛣️ Road / 🛺 Toto / 🚌 Bus</b> — daily road collections (bus asks name + number).',
        '<b>🤝 Member</b> — <b>collect</b> a committee member\'s contribution. Pick the name from the list → cash/UPI → <b>what it is for, required</b>. A member can have as many entries as the season needs; the figure beside each name is their total so far.',
        '<b>🎖️ Committee members</b> — a <b>separate screen with its own permission</b>. This is where who-is-a-member is decided: name, position, email, phone, and which app account is theirs. One person keeps the register; many people collect.',
        '<b>🔴 Red dot</b> — a dot on a button means <b>there is something there for you to finish</b>. It goes out by itself once the work is done, so a dot that is lit is genuinely outstanding.',
        '<b>Something was added but you cannot see it?</b> The bottom of ⚙️ Settings shows which <b>version</b> your phone is running. Tap <b>🔄 Check for update</b> next to it and the new one downloads and reloads itself.',
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
    icon: '✏️', id: 'fix',
    title: { bn: 'ভুল entry শোধরানো — আমার লেখা entry ও নালিশের রায়', en: 'Fixing a wrong entry — My entries & Rule on flags' },
    body: {
      bn: [
        'টাকার খাতায় <b>নিজের লেখা নিজে মোছা যায় না</b> — এই নিয়মেই সবাই হিসাবে ভরসা রাখে। মোছা মানেও delete নয়: পুরনো সারি "বাতিল" ছাপ খেয়ে খাতায় থেকে যায়, হিসাব সবসময় মেলে।',
        '<b>ধাপ ১:</b> ✏️ <b>আমার লেখা entry</b>-তে নিজের ভুল সারিটায় <b>⚠️ ভুল বলে জানাও</b> চাপো, কারণ লেখো। সারিতে ট্যাগ বসবে: <i>"⚠️ জানানো হয়েছে — অপেক্ষায়"</i>।',
        '<b>ধাপ ২ (দুটোর যেটা আগে):</b> হয় তুমি নিজেই নতুন-ফোটা <b>✏️ ঠিক করি</b> বোতামে অঙ্ক শুধরে দাও — পুরনোটা বাতিল হয়ে নতুনটা বসবে, আর নালিশটা নিজে-নিজেই মিটে যাবে; নয়তো ক্যাশিয়ার 🛠️ <b>নালিশের রায়</b> পর্দায় দেখে <b>✅ বাতিল</b> (টাকা খাতা থেকে সরবে) বা <b>🚫 ঠিক আছে</b> (entry যেমন ছিল থাকবে) করবে।',
        'সংশোধনের পরও <b>রসিদের নম্বর একই থাকে</b> — দাতার হাতে/ফোনে ওই নম্বরটাই আছে; শুধরে আবার পাঠালে একই নম্বরে নতুনটা পুরনোটার জায়গা নেয়।',
        '<b>অন্যের ভুল</b> চোখে পড়লে: ক্যাশিয়ার/admin হলে "সবার দৈনিক/খরচ" ট্যাব বা দাতার পাতা থেকে সরাসরি ✖️ বাতিল; সাধারণ collector হলে ⚠️ জানাও — রায় ক্যাশিয়ারের। <b>নিজের সারিতে ক্যাশিয়ারও ✖️ পায় না</b> — সবাই নালিশের পথেই।',
        '<b>দাতার নাম/ফোন/কথার অঙ্ক</b> ভুল হলে এ পর্দা নয় — খাতা → দাতার পাতা → ✏️ ডোনরের তথ্য সংশোধন। আর <b>জমা-দেওয়া (handover)</b> শোধরানো হয় না — পাঠানোর ৫ সেকেন্ডে "ফিরিয়ে নাও", নয়তো ক্যাশিয়ার ❌ ফেরত দেয়।',
      ],
      en: [
        'In a money book <b>you never delete your own entry</b> — that rule is why everyone trusts the totals. "Removing" is not deletion either: the old row stays, stamped void, and the books always reconcile.',
        '<b>Step 1:</b> in ✏️ <b>My entries</b>, tap <b>⚠️ flag</b> on your own wrong row and give the reason. The row is tagged <i>"⚠️ flagged — waiting"</i>.',
        '<b>Step 2 (whichever comes first):</b> either you fix it yourself with the newly-appeared <b>✏️ fix</b> button — the old row is voided, the new one stands, and the flag clears on its own; or the cashier rules on the 🛠️ <b>Rule on flags</b> desk: <b>✅ void</b> (money leaves the book) or <b>🚫 keep</b> (the entry stands).',
        'After a fix the <b>receipt number stays the same</b> — the donor already holds that number; resend and the new one replaces the old under the same serial.',
        '<b>Someone else\'s mistake:</b> a cashier/admin voids it directly (the "Everyone\'s daily/expense" tab, or the donor\'s page); an ordinary collector flags it — the ruling is the cashier\'s. <b>Even a cashier gets no ✖️ on their own rows</b> — everyone goes through the flag.',
        'A donor\'s <b>name/phone/pledge</b> is fixed on the donor\'s own page (Ledger → donor → ✏️), not here. A <b>handover</b> is never edited — Undo within 5 seconds of sending, or the cashier ❌ returns it.',
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
    icon: '🤝', id: 'confirm',
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
    icon: '📒', id: 'ledger',
    title: { bn: 'খাতা ও রিপোর্ট', en: 'Ledger & reports' },
    body: {
      bn: [
        '<b>📒 খাতা</b> — সব চাঁদাদাতার list; উপরে খুঁজতে পারো, "বাকি আছে" দিয়ে filter করো, নাম চেপে বিস্তারিত + টাকা জমা।',
        '<b>📊 রিপোর্ট</b> — উপরে সবার নিজের <b>"আমার হিসাব"</b>। প্রথমে শুধু একটা সংখ্যা: <b>এখন আমার হিসাবে আছে</b> (নগদ + UPI)। জানতে চাইলে <b>"হিসাব দেখি"</b> চাপো — তখন ভাগ ধরে (📥 নতুন এন্ট্রি, 🛣️ রোড/টোটো) কত আছে দেখাবে, আর কোনো ভাগে চাপলে তার ভেতরের দোকান/ব্যক্তি/বাস… খুলে যাবে। উপরের সংখ্যার চেয়ে বড় কিছু নিচে কোথাও থাকে না।',
        '<b>⏳ জমা দিয়েছ কিন্তু অনুমোদন হয়নি</b> — সেই টাকা <b>এখনও তোমার হিসাবেই ধরা থাকে</b>, কারণ যিনি নেবেন তিনি এখনও "পেয়েছি" বলেননি। অনুমোদন হলে কত দাঁড়াবে, সেটা আগেই লেখা থাকে। <b>✅ অনুমোদিত</b> টাকা ধূসর — ওটা হিসাবে আর নেই, শুধু প্রমাণ হিসেবে রাখা।',
        '<b>❌ ফেরত এসেছে</b> — ক্যাশিয়ার "পাইনি" বললে (কারণ লিখে) টাকাটা <b>তোমার হিসাব থেকে কখনও বাদ যায় না</b>, শুধু আবার জমা দেওয়ার মতো হয়ে যায়। ওপরে খবর আসে, কারণ সহ; <b>বুঝেছি</b> চেপে খবরটা সরানো যায় — হিসাবের রেকর্ড 📗 জমা-খাতায় থেকেই যায়।',
        '<b>জমা দেওয়ার সময় কম দেখাচ্ছে?</b> আগে পাঠানো টাকার অনুমোদন না এলে সেটা আর দেওয়া যাবে না (হাতে তো নেই), আর কোনো ভাগে ঋণ থাকলে ততটাও কম। দুটো কারণই ওই স্ক্রিনের ওপরে লেখা থাকে — হলুদ আর লাল।',
        '<b>🎨 রঙের মানে</b> — এক রং, এক মানে: সবুজ = হিসাবে আছে, হলুদ = আছে কিন্তু বেরিয়ে যাবে, নীল = তোমার কাজ বাকি, ধূসর = শেষ ও বন্ধ, লাল = ঘাটতি/ঋণ। "আমার হিসাব"-এর নিচে <b>রঙের মানে</b> চেপে যেকোনো সময় দেখে নিতে পারো। রং না বুঝলেও ক্ষতি নেই — প্রতি লাইনে চিহ্ন আর লেখাও থাকে।',
        'নিচে <b>কেন্দ্রীয় রিপোর্ট</b> — মোট হিসাব, বাকির তালিকা, কার হাতে কত, কে কত তুলল, <b>📍 এলাকা-ভিত্তিক</b>, খরচ, আর <b>দিনের রোড/টোটো</b>। admin যাকে যেটা permission দেবে সে সেটাই দেখবে। <b>বাস কালেকশন দৈনিক রিপোর্টে নেই</b> — বাস নাম-নম্বর নিয়ে receipt কাটে, তাই ওটা 📒 খাতার <b>বাস</b> tab-এ, দোকান/ব্যক্তির পাশে।',
        '<b>📍 এলাকা-ভিত্তিক</b> — কোন রাস্তায় কত উঠল, কত বাকি; সবচেয়ে বেশি তোলা এলাকা উপরে (🥇🥈🥉)।',
        '<b>দ্রুত খোলে:</b> রিপোর্ট আর খাতা ফোনে জমানো তথ্য থেকে সঙ্গে সঙ্গে দেখায়, নেট থাকলে পিছনে নিজে থেকে আপডেট হয় — তাই অপেক্ষা করতে হয় না, offline-ও খোলে।',
        '<b>📄 PDF:</b> যেকোনো কেন্দ্রীয় রিপোর্ট খুলে নিচের "PDF বানাও / প্রিন্ট" চাপো — ফোনের print থেকে <b>Save as PDF</b> বেছে নিলেই কমিটিকে দেওয়ার মতো ফাইল তৈরি।',
      ],
      en: [
        '<b>📒 Ledger</b> — list of all donors; search at top, filter by "Dues only", tap a name for details + add payment.',
        '<b>📊 Report</b> — everyone\'s own <b>"My summary"</b> at the top. It opens with one figure: <b>what is in your account right now</b> (cash + UPI). Tap <b>"Show the working"</b> for the group totals (📥 new entries, 🛣️ road/toto), and tap a group to open the pots inside it. Nothing below is ever larger than the figure on top.',
        '<b>⏳ Handed over but not approved</b> — that money is <b>still counted as yours</b>, because the receiver has not said "received" yet. The screen tells you in advance what your figure becomes once they do. <b>✅ Approved</b> parcels are greyed out: no longer counted, kept only as proof.',
        '<b>❌ Came back</b> — if the cashier says "not received" (with a reason), the money <b>never comes off your account</b>; it simply becomes available to hand over again. You get a notice with the reason; <b>Got it</b> clears the notice, while the record stays in 📗 the handover book.',
        '<b>Handover screen showing less than you hold?</b> Money already sent and not yet approved cannot be sent again (it is not in your pocket), and an overspent pot lowers it further. Both reasons are stated at the top of that screen — in yellow and red.',
        '<b>🎨 Colours</b> — one colour, one meaning: green = in your account, yellow = counted but leaving, blue = your move, grey = done and closed, red = shortfall. Tap <b>What the colours mean</b> under "My summary" any time. Nothing depends on colour alone — every line also has an icon and words.',
        'Below are the <b>central reports</b> — overview, dues list, cash in hand, by collector, <b>📍 by area</b>, expenses, daily. Each user sees only what the admin grants.',
        '<b>📍 By area</b> — how much each road collected and what is still due, ranked by collection (🥇🥈🥉).',
        '<b>Opens instantly:</b> ledger and reports render from data already stored on the phone and refresh in the background — no waiting, and they work offline.',
        '<b>📄 PDF:</b> open any central report and tap "Save as PDF / print" at the bottom — pick <b>Save as PDF</b> in the phone\'s print dialog for a committee-ready file.',
      ],
    },
  },
  {
    icon: '💰', id: 'maths',
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
    icon: '🧾', id: 'receipts',
    title: { bn: 'রসিদ ও বাকির তাগাদা', en: 'Receipts & dues reminders' },
    body: {
      bn: [
        '<b>🧾 রসিদ</b> — টাকা জমা নিলে (নতুন দাতার প্রথম জমা হোক বা কিস্তি) সেভের সাথে সাথে রসিদ পাতা <b>নিজে থেকেই খোলে</b> (দাতা, তারিখ, এই কিস্তি, মোট জমা/কথা, বাকি, <b>রসিদ নং</b>)। দুটো বোতাম: <b>📷 WhatsApp/ছবি</b> (ছবি রসিদ) আর <b>💬 SMS/message</b> (দাতার WhatsApp না থাকলে — সংক্ষিপ্ত লেখা)। বাস কালেকশনেও একই — নাম+নম্বর দিয়ে সাথে সাথে রসিদ।',
        'রসিদ পাঠানোর পর নিচে দুটো বোতাম: তালিকা/খোঁজা থেকে এসেছ তো "🔍 তালিকায় ফিরি" (পরের দাতা ধরতে), নতুন দোকান/ব্যক্তি/সদস্য/বাস হলে "➕ আরেকটা" (একই টাইপের পরের এন্ট্রি) — আর সবসময় "শেষ, হোমে ফিরি"।',
        'রসিদ নম্বর (যেমন 2026-0007) প্রতিটা জমায় আলাদা, sync হলে বসে — কখনো ডবল হয় না।',
        '<b>রিপোর্টেও একই ভাঙা</b> — "আমার হিসাব"-এ <b>হিসাব দেখি → 📥 নতুন এন্ট্রি</b> খুললে দোকান/ব্যক্তি/সদস্য/বাস ধরে কত আছে দেখা যায়, তাই "আমার হাতে বাসের কত টাকা?" জানতে জমার স্ক্রিনে যেতে হয় না।',
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
    // A85: four things shipped this week and none of them was explained
    // anywhere — not here, not in the collector guide. A feature a user meets
    // without warning is a feature they phone the admin about.
    icon: '🚪',
    title: { bn: 'বিদায়ী — কমিটি কাউকে বসিয়ে দিলে', en: 'Standing down' },
    body: {
      bn: [
        'কমিটি কাউকে কাজ থেকে সরালে তাঁর অ্যাকাউন্ট <b>বিদায়ী</b> হয় — পদ আর সব permission চলে যায়।',
        '<b>লগ-ইন কিন্তু খোলা থাকে</b>, আর সেটা ইচ্ছাকৃত: যিনি ঢুকতেই পারেন না, তিনি হাতের টাকা ফেরতও দিতে পারেন না।',
        'তিনি তখন <b>দুটো</b> জিনিস পারেন — হাতে যা আছে <b>জমা দেওয়া</b>, আর <b>নিজের তোলা</b> চাঁদাদাতাদের বাকি নেওয়া। নতুন দোকান, রোড/টোটো, রিপোর্ট, চ্যাট — সব বন্ধ।',
        'নিজের এন্ট্রিতে ভুল দেখলে <b>⚠️ ভুল বলে জানাতে</b> পারেন — ঠিক করবেন cashier।',
        'সব টাকা জমা হয়ে গেলে তবেই অ্যাকাউন্ট <b>চূড়ান্ত বন্ধ</b> করা যায়। হাতে টাকা থাকলে অ্যাপ আটকে দেয় আর অঙ্কটা বলে দেয়।',
        'ফেরাতে হলে admin একটা <b>পদ</b> দিয়ে ফেরাবেন — পদ ছাড়া ফেরানো যায় না।',
      ],
      en: [
        'When the committee stands somebody down, their account becomes <b>বিদায়ী</b> — post and every permission go.',
        '<b>The login stays open on purpose</b>: a person who cannot log in cannot hand the money back.',
        'They can do exactly <b>two</b> things — hand in what they hold, and collect the balance of donors <b>they themselves brought in</b>. New donors, daily rounds, reports and chat are closed.',
        'They can still flag a mistake in their own entry with <b>⚠️</b> — a cashier decides.',
        'The account can only be <b>closed for good</b> once the money is in; while they still hold cash the app refuses and names the amount.',
        'Bringing them back requires giving them a <b>post</b>.',
      ],
    },
  },
  {
    icon: '🎯',
    title: { bn: 'এ বছরের লক্ষ্য', en: 'This year’s target' },
    body: {
      bn: [
        'Admin একটা লক্ষ্য বসালে হোমে একটা দাগ দেখায় — <b>কত উঠেছে, কত বাকি</b>।',
        'সবাই দেখতে পান না — যাঁদের <b>সারসংক্ষেপ (overview) রিপোর্ট</b> দেখার অনুমতি আছে, শুধু তাঁরাই। মোট টাকার অঙ্ক ওই অনুমতির পিছনেই থাকে।',
        'লক্ষ্য বসানো না থাকলে দাগটা দেখায়ই না।',
      ],
      en: [
        'If the admin sets a target, the home screen shows a bar — <b>how much is in, how much to go</b>.',
        'Only people who may see the <b>overview report</b> get it; the season total sits behind that grant.',
        'No target set, no bar.',
      ],
    },
  },
  {
    icon: '🎖️', id: 'register',
    title: { bn: 'কমিটির সদস্য — রেজিস্টার ও পদ', en: 'Committee members — register & posts' },
    body: {
      bn: [
        'সদস্য তোলা/বদলানো <b>🎖️ কমিটির সদস্য</b> পর্দায় (memberadmin অনুমতি লাগে) — আর এতে <b>internet লাগে</b>, কারণ পদ মানেই অ্যাপের অনুমতি।',
        'প্রত্যেক সদস্যের একটা <b>app-অ্যাকাউন্ট বাধ্যতামূলক</b>; পদটা থাকে অ্যাকাউন্টের গায়ে — তাই 👥 ইউজার-পর্দা আর রেজিস্টার সবসময় একই পদ দেখায়।',
        '<b>পদের স্তর (level):</b> নিজের চেয়ে <b>নিচু</b> স্তরের পদই দেওয়া/সরানো যায় — সমান বা উঁচু নয়; 💰-ওয়ালা পদ শুধু admin। <b>নিজের সদস্য-তথ্য নিজে বদলানো যায় না</b> — অন্য কেউ করবে।',
        'সদস্য সরাতে হলে আগে তাঁর পদ সরাও; চাঁদা-দেওয়া সদস্য সরানো যায় না (হিসাব রক্ষা)। টাকা তোলা বরাবরের মতোই 🤝 <b>সদস্যের চাঁদা</b>-য়, offline-ও।',
      ],
      en: [
        'Members are added/edited on the <b>🎖️ Committee members</b> screen (needs the memberadmin grant) — and it <b>needs internet</b>, because a post IS app permission.',
        'Every member must have an <b>app account</b>; the post lives on the account — so the 👥 Users screen and the register always show the same post.',
        '<b>Post levels:</b> you may give/remove only posts <b>below</b> your own level — never equal or above; posts carrying 💰 are admin-only. <b>Nobody edits their own member record.</b>',
        'To remove a member, take their post off first; a member with payments cannot be removed (protects the books). Collecting stays on 🤝 <b>Member contribution</b>, offline too.',
      ],
    },
  },
  {
    icon: '🩺', id: 'anom',
    title: { bn: 'অসঙ্গতি পরীক্ষা — কার্ডগুলোর মানে', en: 'Anomaly desk — what each card means' },
    body: {
      bn: [
        'এই পর্দা (cashier/admin) খাতা <b>নিজেই নিজেকে মিলিয়ে</b> যা যা বেমানান পায়, তা সাজিয়ে দেখায়। লাল মানেই বিপদ নয় — বেশিরভাগই একটা প্রশ্ন, যার উত্তর দিলে কার্ড সরে যায়।',
        '<b>🔁 একই জমা/কালেকশন দুবার?</b> — সত্যিই আলাদা কিস্তি হলে ✓ চাপো (আর কোনো ফোনে জিজ্ঞেস করবে না); ভুলে দুবার উঠলে ✖️ বাড়তিটা বাতিল।',
        '<b>⚠️ কথার চেয়ে বেশি জমা</b> — দাতা সত্যিই বেশি দিলে ✓; কথার অঙ্কটাই ভুল লেখা হলে ✏️-তে শুধরে দাও।',
        '<b>দাতাহীন জমা</b> — টাকা আছে, দাতার সারি নেই (সাধারণত দাতা বাতিলের পরে)। <b>নগদ+UPI মিলছে না / ভাঙা হিসাব</b> — Sheet-এ হাতে বদলের চিহ্ন; admin-কে দেখাও।',
        '<b>💰 হাতে অনেক টাকা</b> — কারো কাছে ১০,০০০-এর বেশি জমে গেছে: জমা করিয়ে নাও। <b>বাতিলের তালিকা</b> — মোছা নয়, স্বচ্ছতার খাতা।',
        'উত্তর দেওয়া কার্ড <b>জায়গাতেই মিলিয়ে যায়</b> ও সব ফোন থেকে সরে; উত্তরগুলোর জন্য internet লাগে।',
      ],
      en: [
        'This desk (cashier/admin) shows what the book finds when it <b>reconciles itself</b>. Red is not danger — most cards are a question, and an answered card leaves.',
        '<b>🔁 Same payment/round twice?</b> — genuinely separate: ✓ (no phone asks again); doubled by mistake: ✖️ void the extra.',
        '<b>⚠️ Paid more than pledged</b> — the donor really gave more: ✓; the pledge was typed wrong: fix it with ✏️.',
        '<b>Orphan payment</b> — money without a donor row (usually after a donor was voided). <b>Cash+UPI mismatch / breakdown mismatch</b> — signs of hand-editing in the Sheet; show the admin.',
        '<b>💰 Heavy in-hand</b> — someone holds over 10,000: get it handed over. <b>The void list</b> — not deletion, a transparency ledger.',
        'Answered cards settle <b>in place</b> and clear on every phone; the answers need internet.',
      ],
    },
  },
  {
    icon: '👥', id: 'dup',
    title: { bn: 'একই চাঁদাদাতা দুবার উঠে গেলে', en: 'The same donor entered twice' },
    body: {
      bn: [
        'নতুন দোকান তোলার সময় <b>ফোন নম্বর</b> মিলে গেলে অ্যাপ সঙ্গে সঙ্গে বলে দেয় — কোন দোকান, কার তোলা, কত প্রতিশ্রুতি। আটকায় না, জিজ্ঞেস করে।',
        'কিন্তু দুজন <b>অফলাইনে</b> একই রাস্তায় থাকলে কেউ কারওটা দেখতে পান না। তাই sync হয়ে যাওয়ার পর <b>🩺 অসঙ্গতি</b> পর্দায় লাইনটা ওঠে — একই ফোন নম্বরে দুটো নাম, দুজন সংগ্রাহকের নাম সমেত।',
        'একজনের সত্যিই দুটো দোকান থাকতে পারে — তখন <b>"আলাদা দোকান, ঠিক আছে"</b> চেপে লাইনটা বন্ধ করে দিন।',
        '<b>তাই ফোন নম্বরটা নেওয়া জরুরি</b> — নাম দিয়ে মেলানো যায় না, একই নামের তিনটে দোকান থাকতেই পারে।',
      ],
      en: [
        'While adding a shop, a matching <b>phone number</b> raises a warning naming the existing donor, who wrote it and what was pledged. It asks; it does not block.',
        'But two people working <b>offline</b> on one street cannot see each other. So after everything syncs, the <b>🩺 anomalies</b> screen raises it — two names on one number, with both collectors named.',
        'One owner can genuinely have two shops — clear it with <b>“different shops, fine”</b>.',
        '<b>This is why the phone number matters</b>: names cannot be matched, three shops can share one.',
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
        'প্রতিটা approved user-এ: <b>🎖️ কমিটিতে পদ</b>, <b>💰 ক্যাশিয়ার করা</b>, <b>👑 admin করা/সরানো</b>, <b>🔑 পাসওয়ার্ড রিসেট</b> (একটা সাময়িক পাসওয়ার্ড দেবে — মুখে বলে দাও), <b>🚫 Block</b>, <b>✏️ কী কী তুলতে পারবে</b>, <b>📊 report permission</b>, আর <b>📍 এলাকার দায়িত্ব</b>।',
        '<b>অনুমতি এখন দুই জায়গা থেকে আসে।</b> এক, <b>পদ</b> — Admin প্যানেল → 🧾 তালিকা → 🎖️ কমিটির পদ ও অনুমতি-তে ঠিক করো ওই পদে কে কী পারবে; তারপর প্রতি লোকে শুধু পদটা বেছে দিলেই হয়। দুই, ওই লোকের জন্য <b>আলাদা করে দেওয়া</b> chip। যেগুলো পদ থেকে আসছে সেগুলোয় 🎖️ চিহ্ন আর সেগুলো এখানে বদলানো যায় না — বদলাতে হলে পদের অনুমতি বদলাও, তাতে ওই পদের সবাই একসাথে বদলাবে।',
        'প্রতিটা কার্ডের নিচে তিন লাইনে পরিষ্কার লেখা থাকে — <b>পদ থেকে</b> কী পাচ্ছে, <b>আলাদা</b> কী দেওয়া হয়েছে, আর <b>শেষমেশ</b> কী পারবে। “ও এটা করছে কেন?” — উত্তরটা ওখানেই।',
        '<b>Admin কোনো পদের সঙ্গে আসে না</b>, ইচ্ছে করেই। কাউকে সম্পাদক করা মানে তার হাতে গোটা সিস্টেম তুলে দেওয়া নয় — admin বোর্ডের সিদ্ধান্তে, একজন করে দেওয়া হয়।',
        '<b>🧹 সবার আলাদা permission মুছে দাও</b> — সবাইকে শুধু পদের উপর দাঁড় করাতে চাইলে। চাপার আগে নাম ধরে দেখাবে কার কী মুছবে, আর কারো পদে entry-র অনুমতি না থাকলে <b>নাম ধরে সতর্ক করবে</b> — নইলে collection-এর দিন দশজন আটকে যাবে। Admin-দের কিছু হয় না।',
        '<b>যা দেবে সেটুকুই পাবে।</b> নতুন user approve করলেই সে কিছু তুলতে পারে না — তুমি chip চেপে দেওয়ার পরেই পারবে। (রিপোর্টও চিরকাল এভাবেই চলে।) কার্ডে <b>⚠️ কিছুই দেওয়া হয়নি</b> লেখা থাকলে বুঝবে ওকে এখনো কিছু দাওনি।',
        '<b>সবার জন্য সবসময় খোলা</b> (permission লাগে না): নিজের তোলা দাতার চাঁদা, জমা দেওয়া, আমার লেখা entry, আর বাকির তালিকা। <b>অন্য কারো দাতার</b> কাছে পৌঁছনো আলাদা permission।',
        '<b>খরচ</b> — সাধারণ পুজো-খরচে <b>কোন খাত জিজ্ঞেস করা হয় না</b>। ক্যাশিয়ারের হাতে তো বহু লোকের টাকা মেশানো, তাই খাত বাছা মানে আন্দাজ। ওটা “অন্যান্য” ঘরে বসে, দরকারে ঋণাত্মক হয় — পরে অদল-বদল করে মেলাবে। <b>রোড/টোটো/বাসের খরচ</b> আলাদা: ওটা নিজের রাউন্ড থেকেই যায়, তাই নিজে থেকেই বসে যায়।',
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
        'For each approved user: <b>🎖️ Committee post</b>, <b>💰 Make cashier</b>, <b>👑 Make/remove admin</b>, <b>🔑 Reset password</b> (gives a temporary password — tell them verbally), <b>🚫 Block</b>, <b>✏️ Can collect</b>, <b>📊 report permissions</b>, and <b>📍 Area duties</b>.',
        '<b>Permissions now come from two places.</b> First the <b>post</b> — set what a post may do in Admin → 🧾 Lists → 🎖️ Committee positions & permissions, then each person just needs the post picked. Second, chips <b>granted to that person on top</b>. Chips that come with the post are marked 🎖️ and cannot be changed here — change the post instead, and everyone holding it moves together.',
        'Each card ends with three lines: what the <b>post</b> gives, what was <b>added on top</b>, and what they <b>end up with</b>. That is the answer to “why can he do that?”',
        '<b>Admin never comes with a post</b>, deliberately. Making somebody secretary must not hand them the whole system — the board grants admin, one person at a time.',
        '<b>🧹 Clear everyone\'s personal permissions</b> — to stand everybody on their post alone. Before it runs it names who loses what, and <b>warns by name</b> if anyone\'s post grants no entry permission, since otherwise ten collectors are locked out on a collection day. Admins are untouched.',
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
