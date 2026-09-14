/**
 * src/lib/engines/sectorLabel.ts
 *
 * The sector ids the onboarding form stores ('retail', 'tailoring', …) and
 * the rule vocabulary the schemes use ('farming', 'food_processing', …),
 * as words a person would say. Unknown ids come back unchanged.
 */

const LABELS: Record<string, { hi: string; en: string }> = {
  retail: { hi: 'किराना / दुकान', en: 'Shop / retail' },
  tailoring: { hi: 'सिलाई', en: 'Tailoring' },
  dairy: { hi: 'डेयरी', en: 'Dairy' },
  dairy_processing: { hi: 'दूध से बने सामान', en: 'Dairy products' },
  agriculture: { hi: 'खेती', en: 'Farming' },
  farming: { hi: 'खेती', en: 'Farming' },
  food: { hi: 'खाने-पीने का काम', en: 'Food' },
  food_processing: { hi: 'खाने-पीने का काम', en: 'Food' },
  manufacturing: { hi: 'बनाने का काम', en: 'Making things' },
  crafts: { hi: 'हस्तशिल्प', en: 'Crafts' },
  handicraft: { hi: 'हस्तशिल्प', en: 'Handicraft' },
  services: { hi: 'सेवा', en: 'Services' },
  general: { hi: 'अन्य', en: 'Other' },
  non_farm: { hi: 'खेती के अलावा', en: 'Non-farm' },
};

export function sectorLabel(id: string | null | undefined, lang: 'hi' | 'en'): string {
  if (!id) return lang === 'hi' ? 'अन्य' : 'Other';
  const key = id.toLowerCase().trim();
  return LABELS[key]?.[lang] ?? id;
}
