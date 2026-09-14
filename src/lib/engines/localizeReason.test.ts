import { describe, it, expect } from 'vitest';
import { localizeReason, reasonPassed } from './localizeReason';
import { matchSchemes, type BusinessProfile, type SchemeRecord } from './schemeMatcher';

describe('localizeReason', () => {
  it('turns the sector reason into Hindi with the sector named in Hindi', () => {
    expect(localizeReason('✓ Your business sector (retail) is covered by this scheme', 'hi'))
      .toBe('आपका काम (किराना / दुकान) इस योजना में आता है');
  });

  it('drops the ✓ and rewords in English', () => {
    expect(localizeReason('✓ Your business sector (retail) is covered by this scheme', 'en'))
      .toBe('Your trade (Shop / retail) is covered by this scheme');
  });

  it('keeps rupee figures intact', () => {
    const r = '✓ Your annual revenue (₹3,00,000) is within the scheme limit (₹25,00,000)';
    expect(localizeReason(r, 'hi')).toContain('₹3,00,000');
    expect(localizeReason(r, 'hi')).toContain('₹25,00,000');
    expect(localizeReason(r, 'hi')).not.toMatch(/[A-Za-z]{3,}/);
  });

  it('returns an unknown reason unchanged, minus the mark', () => {
    expect(localizeReason('✗ Something new the matcher says', 'hi')).toBe('Something new the matcher says');
  });

  it('knows a pass from a fail', () => {
    expect(reasonPassed('✓ ok')).toBe(true);
    expect(reasonPassed('✗ no')).toBe(false);
  });

  it('covers every reason the matcher can produce', () => {
    // A profile that trips every rule at least once, pass or fail.
    const profile: BusinessProfile = {
      monthly_revenue_est: 25000, monthly_expense_est: 10000, existing_loans: false,
      sector: 'retail', gender: 'male', category: 'obc', state: 'Maharashtra', area_type: 'rural',
      is_shg_member: false,
    };
    const schemes: SchemeRecord[] = [
      { id: 'a', name: 'a', eligibility_rules: { income_max: 1000, sector: ['dairy'], gender: 'female', category: ['sc'], state: 'Bihar', area_type: 'urban', requires_shg_membership: true } },
      { id: 'b', name: 'b', eligibility_rules: { income_max: 100000000, sector: ['retail'], gender: 'male', category: ['obc'], state: 'Maharashtra', area_type: 'rural', implementation_note: 'block_specific_not_nationwide' } },
      { id: 'c', name: 'c', eligibility_rules: {} },
      { id: 'd', name: 'd', eligibility_rules: { loan_amount_max: 50000 } },
    ];
    const reasons = matchSchemes(profile, schemes).flatMap((r) => r.reasons);
    expect(reasons.length).toBeGreaterThan(10);
    for (const reason of reasons) {
      const hi = localizeReason(reason, 'hi');
      // Every template must have been recognised: Hindi text with no
      // English sentence left (rupee amounts and SHG/Panchayat are fine).
      expect(hi.replace(/\(SHG\)|SHG|₹[\d,]+|[A-Z]{2,3}\b|Maharashtra|Bihar/g, '')).not.toMatch(/[A-Za-z]{3,}/);
    }
  });
});
