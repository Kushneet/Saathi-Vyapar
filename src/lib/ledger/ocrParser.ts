/**
 * src/lib/ledger/ocrParser.ts
 *
 * Parses raw OCR text from a photographed bahi-khata page into ledger entries.
 *
 * Extracted from the OCR route so the web upload and the WhatsApp photo flow
 * run exactly the same parser, and so the parsing rules are unit-testable
 * without Tesseract, Supabase or a network.
 *
 * Every extracted row used to be labelled 'income', which silently turned a
 * page of expenses into revenue and corrupted the margin and cash-flow-risk
 * figures downstream. Lines are now classified with bilingual keywords, and
 * each row carries the confidence of that guess so the review UI can ask the
 * entrepreneur about the ones we are unsure of.
 */

export type EntryType = 'income' | 'expense';

export interface ParsedEntry {
  amount: number;
  entry_type: EntryType;
  description: string;
  /** 'high' when a keyword decided the type, 'low' when it was defaulted. */
  confidence: 'high' | 'low';
}

/** Maximum plausible single ledger amount (₹1 crore). */
const MAX_AMOUNT = 10000000;

// Hindi/Devanagari + romanised Hindi + English markers. Matched case-
// insensitively against the whole line, so "Kharch: 500" and "खर्च 500" and
// "Paid to supplier 500" all classify the same way.
const EXPENSE_MARKERS = [
  'खर्च', 'व्यय', 'खरीद', 'खरीदा', 'भुगतान', 'दिया', 'किराया', 'भाड़ा',
  'बिजली', 'मजदूरी', 'वेतन', 'माल', 'लागत',
  'kharch', 'kharcha', 'vyay', 'kharid', 'kharida', 'bhugtan', 'diya',
  'kiraya', 'bhada', 'bijli', 'mazdoori', 'majdoori', 'vetan', 'maal',
  'expense', 'expenses', 'paid', 'payment', 'purchase', 'purchased', 'bought',
  'bill', 'rent', 'wages', 'salary', 'stock', 'cost', 'transport', 'debit',
];

const INCOME_MARKERS = [
  'आय', 'आमदनी', 'बिक्री', 'बेचा', 'जमा', 'मिला', 'प्राप्त', 'कमाई', 'नकद',
  'aay', 'aamdani', 'amdani', 'bikri', 'becha', 'jama', 'mila', 'prapt',
  'kamai', 'nakad',
  'income', 'sale', 'sales', 'sold', 'received', 'revenue', 'earning',
  'earnings', 'credit', 'cash in', 'deposit',
];

/**
 * Classify a ledger line. Expense markers are checked first: mistaking an
 * expense for income inflates revenue, which is the more damaging error.
 */
export function classifyEntryType(line: string): { type: EntryType; confidence: 'high' | 'low' } {
  const haystack = line.toLowerCase();

  if (EXPENSE_MARKERS.some((marker) => haystack.includes(marker))) {
    return { type: 'expense', confidence: 'high' };
  }

  if (INCOME_MARKERS.some((marker) => haystack.includes(marker))) {
    return { type: 'income', confidence: 'high' };
  }

  // A bare "Rice 150" in a sales notebook is most often a sale, but the user
  // must be able to see and flip it before anything is confirmed.
  return { type: 'income', confidence: 'low' };
}

/**
 * Parse OCR text to extract amount/description pairs.
 * Recognises:
 *   - "Item Name 150"   word(s) followed by a number
 *   - "Total: 1500"     label followed by a number
 *   - "150.00"          a standalone number
 */
export function parseOcrText(rawText: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const lines = rawText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2) continue;

    const { type, confidence } = classifyEntryType(trimmed);

    // Pattern 1: word(s) followed by a number at end of line
    const wordNumberMatch = trimmed.match(/^(.+?)\s+([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:\/|$)/);
    if (wordNumberMatch) {
      const description = wordNumberMatch[1].trim();
      const amount = parseFloat(wordNumberMatch[2].replace(/,/g, ''));

      if (!isNaN(amount) && amount > 0 && amount < MAX_AMOUNT && description.length > 0) {
        // Skip lines that look like dates or codes
        if (!/^\d{1,2}[-/]\d{1,2}/.test(description)) {
          entries.push({ amount, entry_type: type, description, confidence });
          continue;
        }
      }
    }

    // Pattern 2: "Label: number" e.g. "Total: 1500", "Amount: 250.00"
    const labelNumberMatch = trimmed.match(
      /^([A-Za-zऀ-ॿ\s]+):\s*(?:Rs\.?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
    );
    if (labelNumberMatch) {
      const description = labelNumberMatch[1].trim();
      const amount = parseFloat(labelNumberMatch[2].replace(/,/g, ''));

      if (!isNaN(amount) && amount > 0 && amount < MAX_AMOUNT) {
        entries.push({ amount, entry_type: type, description, confidence });
        continue;
      }
    }

    // Pattern 3: standalone number (often a running total)
    const standaloneNumber = trimmed.match(/^(?:Rs\.?|₹)?\s*([0-9,]+(?:\.[0-9]{1,2})?)$/);
    if (standaloneNumber) {
      const amount = parseFloat(standaloneNumber[1].replace(/,/g, ''));

      if (!isNaN(amount) && amount > 0 && amount < MAX_AMOUNT) {
        entries.push({
          amount,
          entry_type: type,
          description: 'OCR extracted amount',
          confidence: 'low',
        });
        continue;
      }
    }

    // Pattern 4: a spoken or typed sentence with the amount anywhere —
    // "aaj 2400 ki bikri hui", "sold 500 today". Exactly one number, so a
    // line like "2 kg aloo 60" is not misread as ₹2. The words either side
    // become the description; small filler words are dropped from it.
    const numbers = trimmed.match(/(?:Rs\.?|₹)?\s*\b[0-9][0-9,]*(?:\.[0-9]{1,2})?\b/g) ?? [];
    if (numbers.length === 1) {
      const amount = parseFloat(numbers[0].replace(/[^0-9.]/g, ''));
      const words = trimmed
        .replace(numbers[0], ' ')
        .replace(/\b(aaj|kal|ka|ki|ke|ko|hui|hua|huyi|the|today|of|for|rupaye|rupay|rs|₹|आज|कल|का|की|के|को|हुई|हुआ|रुपये|रुपए)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!isNaN(amount) && amount > 0 && amount < MAX_AMOUNT && words.length > 0) {
        entries.push({ amount, entry_type: type, description: words, confidence });
      }
    }
  }

  return entries;
}

/** Totals for a parsed page, used in the WhatsApp reply and the review UI. */
export function summariseEntries(entries: ParsedEntry[]): {
  income: number;
  expense: number;
  net: number;
} {
  const income = entries
    .filter((e) => e.entry_type === 'income')
    .reduce((sum, e) => sum + e.amount, 0);
  const expense = entries
    .filter((e) => e.entry_type === 'expense')
    .reduce((sum, e) => sum + e.amount, 0);

  return { income, expense, net: income - expense };
}
