/**
 * src/lib/ledger/spokenNumbers.ts
 *
 * Turns spoken amounts into digits so the ledger parser can read them.
 *
 * Speech recognition returns what was said, not what was meant: "pandrah sau"
 * and "पंद्रह सौ" both mean 1500, and neither contains a digit. The ledger
 * parser looks for numbers, so without this step a dictated entry is dropped
 * entirely.
 *
 * Deliberately deterministic rather than handed to a model. A misheard amount
 * is the one error that silently corrupts someone's books, so the mapping is
 * fixed, testable, and identical every time.
 */

/** Hindi and English number words, romanised and in Devanagari. */
const UNITS: Record<string, number> = {
  zero: 0, ek: 1, one: 1, do: 2, two: 2, teen: 3, tin: 3, three: 3, char: 4, chaar: 4, four: 4,
  paanch: 5, panch: 5, five: 5, chah: 6, chhah: 6, chhe: 6, six: 6, saat: 7, sat: 7, seven: 7,
  aath: 8, ath: 8, eight: 8, nau: 9, no: 9, nine: 9, das: 10, dus: 10, ten: 10,
  gyarah: 11, eleven: 11, barah: 12, twelve: 12, terah: 13, thirteen: 13,
  chaudah: 14, fourteen: 14, pandrah: 15, pandra: 15, fifteen: 15,
  solah: 16, sixteen: 16, satrah: 17, seventeen: 17, atharah: 18, eighteen: 18,
  unnis: 19, nineteen: 19, bees: 20, bis: 20, twenty: 20, pachees: 25, pachis: 25,
  tees: 30, thirty: 30, chalis: 40, chalees: 40, forty: 40, pachas: 50, pachaas: 50, fifty: 50,
  saath: 60, sixty: 60, sattar: 70, seventy: 70, assi: 80, eighty: 80, nabbe: 90, ninety: 90,
  'शून्य': 0, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5, 'छह': 6, 'सात': 7,
  'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12, 'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15,
  'सोलह': 16, 'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20, 'पच्चीस': 25, 'तीस': 30,
  'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90,
};

/** Multipliers, largest first so "do lakh pachas hazaar" resolves correctly. */
const SCALES: { words: string[]; value: number }[] = [
  { words: ['crore', 'karod', 'karor', 'करोड़'], value: 10000000 },
  { words: ['lakh', 'lakhs', 'lac', 'lakhh', 'लाख'], value: 100000 },
  { words: ['thousand', 'hazaar', 'hazar', 'hajar', 'हज़ार', 'हजार'], value: 1000 },
  { words: ['hundred', 'sau', 'सौ'], value: 100 },
];

const SCALE_LOOKUP = new Map<string, number>(
  SCALES.flatMap((s) => s.words.map((w) => [w, s.value] as const))
);

/**
 * Replace spoken amounts in a transcript with digits, leaving all other
 * words untouched so the ledger parser still sees the description.
 *
 *   "bikri pandrah sau"   -> "bikri 1500"
 *   "kharch do hazaar"    -> "kharch 2000"
 *   "बिक्री पंद्रह सौ"      -> "बिक्री 1500"
 */
export function spokenToDigits(text: string): string {
  // Convert a line at a time. Each dictated entry is its own line, and the
  // ledger parser reads line by line, so a number must never absorb the break
  // between two entries — "bikri pandrah sau / kharch aath sau" has to stay
  // two lines or it parses as one entry with the wrong amount.
  return (text || '')
    .split('\n')
    .map(convertLine)
    .join('\n');
}

function convertLine(line: string): string {
  const words = line.split(/\s+/).filter(Boolean);
  const out: string[] = [];

  let pending = 0;      // value accumulated across scale words
  let current = 0;      // units seen since the last scale word
  let active = false;   // whether we are part-way through an amount

  const flush = () => {
    if (!active) return;
    out.push(String(pending + current));
    pending = 0;
    current = 0;
    active = false;
  };

  for (const token of words) {
    const word = token.toLowerCase().replace(/[.,!?॥।]/g, '');
    const unit = UNITS[word];
    const scale = SCALE_LOOKUP.get(word);

    if (unit !== undefined) {
      current = current === 0 ? unit : current + unit;
      active = true;
      continue;
    }

    if (scale !== undefined) {
      // A bare scale word means one of it: "sau rupaye" is a hundred, not zero.
      pending += (current === 0 ? 1 : current) * scale;
      current = 0;
      active = true;
      continue;
    }

    flush();
    out.push(token);
  }

  flush();
  return out.join(' ');
}
