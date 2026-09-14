// One-off: Hindi name/benefit/description for every scheme → migration 015.
import { GoogleGenAI } from '@google/genai';
import { writeFileSync } from 'node:fs';
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const rows = await (await fetch(`${URL}/rest/v1/schemes?select=id,name,benefit_summary,description&order=id`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
for (let i = 0; i < rows.length; i += 8) {
  const batch = rows.slice(i, i + 8);
  const prompt = `Translate these Indian government scheme entries into simple Hindi (Devanagari) for a rural shopkeeper who never studied English.
Rules: keep scheme names' proper nouns (PMEGP, Mudra, Udyam, KVIC, NABARD, etc.) in Latin script inside the Hindi name; keep ₹ amounts and percentages exactly; no English words except those proper nouns; short everyday words, no bureaucratic Hindi (say "कर्ज़" not "ऋण", "मदद" not "सहायता", "कागज़" not "दस्तावेज़").
Return ONLY a JSON object mapping id → {"name_hi","benefit_hi","description_hi"}.

${JSON.stringify(batch, null, 1)}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { temperature: 0, responseMimeType: 'application/json' } });
      Object.assign(out, JSON.parse(r.text));
      console.log(`batch ${i / 8 + 1}/${Math.ceil(rows.length / 8)} ok (${Object.keys(out).length} done)`);
      break;
    } catch (e) {
      console.log(`batch ${i / 8 + 1} attempt ${attempt} failed: ${String(e.message).slice(0, 80)}`);
      await sleep(attempt * 20000);
    }
  }
  await sleep(8000); // free tier: stay well under 10 req/min
}
writeFileSync('.scheme_translations.json', JSON.stringify(out, null, 1));
console.log('DONE', Object.keys(out).length, 'of', rows.length);
