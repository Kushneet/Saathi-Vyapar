/**
 * src/lib/engines/localizeReason.ts
 *
 * schemeMatcher writes its reasons in English and they are stored that way
 * in financial_plans.plan_json, so a Hindi-mode screen cannot just print
 * them. This turns each known template into the on-screen language and
 * strips the ✓/✗ prefix (the UI draws its own mark). An unknown reason is
 * returned as written rather than dropped.
 */

import { sectorLabel } from './sectorLabel';

type Lang = 'hi' | 'en';

/** "dairy, retail" → each word as a person would say it, de-duplicated. */
function sectorList(csv: string, lang: Lang): string {
  const seen = new Set<string>();
  return csv
    .split(',')
    .map((w) => sectorLabel(w.trim(), lang))
    .filter((w) => (seen.has(w) ? false : (seen.add(w), true)))
    .join(', ');
}

interface Rule {
  re: RegExp;
  hi: (m: RegExpMatchArray) => string;
  en?: (m: RegExpMatchArray) => string;
}

const RULES: Rule[] = [
  {
    re: /^Your business sector \((.+?)\) is covered by this scheme$/,
    hi: (m) => `आपका काम (${sectorLabel(m[1], 'hi')}) इस योजना में आता है`,
    en: (m) => `Your trade (${sectorLabel(m[1], 'en')}) is covered by this scheme`,
  },
  {
    re: /^Your annual revenue \((.+?)\) is within the scheme limit \((.+?)\)$/,
    hi: (m) => `आपकी साल की कमाई (${m[1]}) योजना की सीमा (${m[2]}) के अंदर है`,
    en: (m) => `Your yearly sales (${m[1]}) are within the scheme's limit (${m[2]})`,
  },
  {
    re: /^Your annual revenue \((.+?)\) exceeds the income limit \((.+?)\)$/,
    hi: (m) => `आपकी साल की कमाई (${m[1]}) योजना की सीमा (${m[2]}) से ज़्यादा है`,
    en: (m) => `Your yearly sales (${m[1]}) are above the scheme's limit (${m[2]})`,
  },
  {
    re: /^This scheme covers: (.+?)\. Your sector \((.+?)\) is not listed$/,
    hi: (m) => `यह योजना इनके लिए है: ${sectorList(m[1], 'hi')}। आपका काम (${sectorLabel(m[2], 'hi')}) इसमें नहीं है`,
    en: (m) => `This scheme is for: ${sectorList(m[1], 'en')}. Your trade (${sectorLabel(m[2], 'en')}) is not on the list`,
  },
  {
    re: /^This scheme is available for your gender$/,
    hi: () => 'यह योजना आपके लिए खुली है',
    en: () => 'This scheme is open to you',
  },
  {
    re: /^This scheme is specifically for (.+?) entrepreneurs$/,
    hi: (m) => `यह योजना सिर्फ़ ${m[1] === 'female' ? 'महिलाओं' : m[1] === 'male' ? 'पुरुषों' : m[1]} के लिए है`,
    en: (m) => `This scheme is only for ${m[1] === 'female' ? 'women' : m[1] === 'male' ? 'men' : m[1]}`,
  },
  {
    re: /^Your social category \((.+?)\) is eligible for this scheme$/,
    hi: (m) => `आपकी श्रेणी (${m[1].toUpperCase()}) इस योजना में आती है`,
    en: (m) => `Your category (${m[1].toUpperCase()}) qualifies for this scheme`,
  },
  {
    re: /^This scheme is reserved for: (.+?)\. Your category \((.+?)\) does not qualify$/,
    hi: (m) => `यह योजना सिर्फ़ ${m[1].toUpperCase()} के लिए है। आपकी श्रेणी (${m[2].toUpperCase()}) इसमें नहीं आती`,
    en: (m) => `This scheme is reserved for ${m[1].toUpperCase()}. Your category (${m[2].toUpperCase()}) does not qualify`,
  },
  {
    re: /^This scheme is available in your state \((.+?)\)$/,
    hi: (m) => `यह योजना आपके राज्य (${m[1]}) में चलती है`,
  },
  {
    re: /^This scheme is only available in (.+?)\. Your state: (.+)$/,
    hi: (m) => `यह योजना सिर्फ़ ${m[1]} में चलती है। आपका राज्य: ${m[2]}`,
  },
  {
    re: /^Your area type \((.+?)\) is eligible for this scheme$/,
    hi: (m) => `आपका इलाका (${m[1] === 'rural' ? 'गाँव' : 'शहर'}) इस योजना में आता है`,
    en: (m) => `Your area (${m[1]}) qualifies for this scheme`,
  },
  {
    re: /^This scheme is specifically for (.+?) areas\. Your area type: (.+)$/,
    hi: (m) => `यह योजना सिर्फ़ ${m[1] === 'rural' ? 'गाँव' : 'शहर'} के लिए है। आपका इलाका: ${m[2] === 'rural' ? 'गाँव' : 'शहर'}`,
    en: (m) => `This scheme is only for ${m[1]} areas. Your area: ${m[2]}`,
  },
  {
    re: /^Your profile indicates Self-Help Group \(SHG\) membership or family relation$/,
    hi: () => 'आप स्वयं सहायता समूह (SHG) से जुड़े हैं',
    en: () => 'You are linked to a Self-Help Group (SHG)',
  },
  {
    re: /^This scheme requires Self-Help Group \(SHG\) membership or relation to an SHG member$/,
    hi: () => 'इसके लिए स्वयं सहायता समूह (SHG) का सदस्य होना या सदस्य के परिवार से होना ज़रूरी है',
    en: () => 'You need to be in a Self-Help Group (SHG), or in an SHG member\'s family',
  },
  {
    re: /^This scheme has no specific eligibility restrictions — broadly applicable$/,
    hi: () => 'इस योजना की कोई खास शर्त नहीं है — सबके लिए खुली है',
    en: () => 'No special conditions — open to everyone',
  },
  {
    re: /^You appear to meet all eligibility criteria for this scheme$/,
    hi: () => 'आप इसकी सभी शर्तें पूरी करते हैं',
    en: () => 'You meet all the conditions',
  },
  {
    re: /^This programme is not yet active in every district/,
    hi: () => 'यह योजना अभी हर ज़िले में शुरू नहीं हुई है — अपने SHG या पंचायत से पूछ लें',
    en: () => 'Not yet running in every district — check with your SHG or Panchayat first',
  },
];

/** The reason as the user should read it: no ✓/✗, in their language. */
export function localizeReason(reason: string, lang: Lang): string {
  const bare = reason.replace(/^[✓✗⚠️]\s*/, '').trim();
  for (const rule of RULES) {
    const m = bare.match(rule.re);
    if (m) return lang === 'hi' ? rule.hi(m) : rule.en ? rule.en(m) : bare;
  }
  return bare;
}

/** Whether the reason was a pass (✓) or a fail (✗). */
export function reasonPassed(reason: string): boolean {
  return !reason.startsWith('✗');
}
