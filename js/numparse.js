// Parse spoken/typed amounts in Bengali or English into a Number.
// Handles: digits in both scripts, 0-99 Bengali words, compound hundreds
// (পাঁচশো), হাজার/লাখ multipliers, দেড়/আড়াই/সাড়ে halves, English words.
(function () {
  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

  const UNITS = {
    // 0-9
    'শূন্য': 0, 'এক': 1, 'দুই': 2, 'তিন': 3, 'চার': 4, 'পাঁচ': 5,
    'ছয়': 6, 'ছ': 6, 'সাত': 7, 'আট': 8, 'নয়': 9,
    // 10-19
    'দশ': 10, 'এগারো': 11, 'এগার': 11, 'বারো': 12, 'বার': 12, 'তেরো': 13,
    'তের': 13, 'চোদ্দ': 14, 'চৌদ্দ': 14, 'পনেরো': 15, 'পনের': 15,
    'ষোলো': 16, 'ষোল': 16, 'সতেরো': 17, 'সতের': 17, 'আঠারো': 18,
    'আঠার': 18, 'উনিশ': 19,
    // 20-99 (Bengali has unique words per number)
    'কুড়ি': 20, 'বিশ': 20, 'একুশ': 21, 'বাইশ': 22, 'তেইশ': 23,
    'চব্বিশ': 24, 'পঁচিশ': 25, 'পচিশ': 25, 'ছাব্বিশ': 26, 'সাতাশ': 27,
    'আঠাশ': 28, 'ঊনত্রিশ': 29, 'উনত্রিশ': 29, 'ত্রিশ': 30, 'তিরিশ': 30,
    'একত্রিশ': 31, 'বত্রিশ': 32, 'তেত্রিশ': 33, 'চৌত্রিশ': 34,
    'পঁয়ত্রিশ': 35, 'ছত্রিশ': 36, 'সাঁইত্রিশ': 37, 'আটত্রিশ': 38,
    'ঊনচল্লিশ': 39, 'উনচল্লিশ': 39, 'চল্লিশ': 40, 'একচল্লিশ': 41,
    'বিয়াল্লিশ': 42, 'তেতাল্লিশ': 43, 'চুয়াল্লিশ': 44, 'পঁয়তাল্লিশ': 45,
    'ছেচল্লিশ': 46, 'সাতচল্লিশ': 47, 'আটচল্লিশ': 48, 'ঊনপঞ্চাশ': 49,
    'উনপঞ্চাশ': 49, 'পঞ্চাশ': 50, 'একান্ন': 51, 'বাহান্ন': 52,
    'তিপ্পান্ন': 53, 'চুয়ান্ন': 54, 'পঞ্চান্ন': 55, 'ছাপ্পান্ন': 56,
    'সাতান্ন': 57, 'আটান্ন': 58, 'ঊনষাট': 59, 'উনষাট': 59, 'ষাট': 60,
    'একষট্টি': 61, 'বাষট্টি': 62, 'তেষট্টি': 63, 'চৌষট্টি': 64,
    'পঁয়ষট্টি': 65, 'ছেষট্টি': 66, 'সাতষট্টি': 67, 'আটষট্টি': 68,
    'ঊনসত্তর': 69, 'উনসত্তর': 69, 'সত্তর': 70, 'একাত্তর': 71,
    'বাহাত্তর': 72, 'তিয়াত্তর': 73, 'চুয়াত্তর': 74, 'পঁচাত্তর': 75,
    'ছিয়াত্তর': 76, 'সাতাত্তর': 77, 'আটাত্তর': 78, 'ঊনআশি': 79,
    'উনআশি': 79, 'আশি': 80, 'একাশি': 81, 'বিরাশি': 82, 'তিরাশি': 83,
    'চুরাশি': 84, 'পঁচাশি': 85, 'ছিয়াশি': 86, 'সাতাশি': 87, 'আটাশি': 88,
    'ঊননব্বই': 89, 'উননব্বই': 89, 'নব্বই': 90, 'একানব্বই': 91,
    'বিরানব্বই': 92, 'তিরানব্বই': 93, 'চুরানব্বই': 94, 'পঁচানব্বই': 95,
    'ছিয়ানব্বই': 96, 'সাতানব্বই': 97, 'আটানব্বই': 98, 'নিরানব্বই': 99,
    // English words
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14,
    'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18,
    'nineteen': 19, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
  };

  // Compound "N-hundred" single words
  const HUNDREDS = {
    'একশো': 100, 'একশ': 100, 'দুশো': 200, 'দুইশো': 200, 'দুশ': 200,
    'তিনশো': 300, 'তিনশ': 300, 'চারশো': 400, 'চারশ': 400,
    'পাঁচশো': 500, 'পাঁচশ': 500, 'ছয়শো': 600, 'ছশো': 600, 'ছয়শ': 600,
    'সাতশো': 700, 'সাতশ': 700, 'আটশো': 800, 'আটশ': 800,
    'নয়শো': 900, 'নশো': 900, 'নয়শ': 900,
    'দেড়শো': 150, 'দেড়শ': 150, 'আড়াইশো': 250, 'আড়াইশ': 250,
  };

  const MULTS = { 'শো': 100, 'শ': 100, 'শত': 100, 'hundred': 100,
    'হাজার': 1000, 'thousand': 1000, 'k': 1000,
    'লাখ': 100000, 'লক্ষ': 100000, 'lakh': 100000, 'lac': 100000 };

  const FRACTIONS = { 'দেড়': 1.5, 'আড়াই': 2.5 };
  const HALF_PREFIX = ['সাড়ে']; // সাড়ে X → X + half of X's scale

  function normalizeDigits(s) {
    return s.replace(/[০-৯]/g, function (d) { return String(BN_DIGITS.indexOf(d)); });
  }

  function parseAmount(input) {
    if (input == null) return NaN;
    let s = normalizeDigits(String(input)).toLowerCase().trim();
    s = s.replace(/[,₹]/g, '')
         .replace(/\b(টাকা|taka|rupees?|rs\.?|inr|মাত্র|only)\b/g, ' ')
         .replace(/টাকা/g, ' ')
         .replace(/\s+/g, ' ').trim();
    if (!s) return NaN;
    // pure numeric (possibly "1 500" from STT) — join digit groups
    const joined = s.replace(/(\d) (?=\d)/g, '$1');
    if (/^\d+(\.\d+)?$/.test(joined)) return Number(joined);

    const toks = s.split(' ').filter(Boolean);
    let total = 0, cur = 0, half = false, sawNumber = false;

    for (let i = 0; i < toks.length; i++) {
      const tok = toks[i];
      if (/^\d+(\.\d+)?$/.test(tok)) { cur += Number(tok); sawNumber = true; continue; }
      if (HALF_PREFIX.indexOf(tok) >= 0) { half = true; continue; }
      if (tok in FRACTIONS) { cur += FRACTIONS[tok]; sawNumber = true; continue; }
      if (tok in HUNDREDS) {
        let v = HUNDREDS[tok];
        if (half) { v += 50; half = false; } // সাড়ে তিনশো = 350
        total += v; sawNumber = true; continue;
      }
      if (tok in MULTS) {
        let base = cur || 1;
        if (half) { base += 0.5; half = false; } // সাড়ে পাঁচ হাজার = 5500
        total += base * MULTS[tok]; cur = 0; sawNumber = true; continue;
      }
      if (tok in UNITS) { cur += UNITS[tok]; sawNumber = true; continue; }
      // unknown token: ignore (STT noise like "দাও", "নাও")
    }
    if (half) return NaN; // dangling সাড়ে with nothing after
    if (!sawNumber) return NaN;
    const result = total + cur;
    return result > 0 || sawNumber ? result : NaN;
  }

  const api = { parseAmount: parseAmount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.NumParse = api;
})();
