/**
 * schemeMatcher.test.ts
 * Vitest tests for the scheme matching engine.
 * Tests various business profiles against mock scheme data.
 */

import { describe, it, expect } from 'vitest';
import { matchSchemes, sectorMatches, BusinessProfile, SchemeRecord } from './schemeMatcher';

// ── Mock Schemes ──────────────────────────────────────────────────────────────

const mockSchemes: SchemeRecord[] = [
  {
    id: 'scheme-1',
    name: 'PMEGP',
    eligibility_rules: {
      income_max: 2500000, // ₹25 lakh annual
    },
  },
  {
    id: 'scheme-2',
    name: 'Stand-Up India',
    eligibility_rules: {
      category: ['sc', 'st'],
      // Also for women — but we don't mix gender+category in same rule here for test clarity
    },
  },
  {
    id: 'scheme-3',
    name: 'Mahila Samridhi Yojana',
    eligibility_rules: {
      gender: 'female',
      income_max: 1200000, // ₹12 lakh annual
    },
  },
  {
    id: 'scheme-4',
    name: 'KVIC Honey Mission',
    eligibility_rules: {
      sector: ['agriculture', 'beekeeping'],
    },
  },
  {
    id: 'scheme-5',
    name: 'PM SVANidhi',
    eligibility_rules: {
      // Street vendors — no category/sector restriction
    },
  },
  {
    id: 'svep-nrlm',
    name: 'Start-up Village Entrepreneurship Programme (SVEP)',
    description:
      'A sub-scheme of DAY-NRLM supporting Self-Help Group (SHG) members and their family members to set up non-farm rural enterprises. Unlike a one-time cash subsidy, SVEP provides ongoing support through training, mentoring, and access to a community-managed revolving loan fund (Community Enterprise Fund). It is implemented block-by-block, not nationwide — availability depends on whether SVEP has been rolled out in the user\'s specific block.',
    benefit_summary:
      'Access to a community-managed revolving loan fund (Community Enterprise Fund) plus business training and ongoing mentoring support — not a one-time cash grant.',
    sponsoring_body: 'Ministry of Rural Development (DAY-NRLM)',
    application_link: 'https://svep.nrlm.gov.in/',
    eligibility_rules: {
      requires_shg_membership: true,
      eligible_relation: ['shg_member', 'shg_member_family'],
      sector: ['non_farm', 'retail', 'tailoring', 'food_processing', 'handicraft', 'dairy_processing'],
      area_type: 'rural',
      implementation_note: 'block_specific_not_nationwide',
      priority_groups: ['women', 'youth'],
    },
    active: true,
  },
];

// ── Test Scenarios ─────────────────────────────────────────────────────────────

describe('matchSchemes', () => {
  // Scenario 1: SC entrepreneur with low revenue — should match PMEGP + Stand-Up India
  it('SC entrepreneur with low revenue matches PMEGP and Stand-Up India', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 15000, // ₹1.8L annual — within PMEGP limit
      monthly_expense_est: 10000,
      existing_loans: false,
      category: 'sc',
      sector: 'retail',
      gender: 'male',
    };

    const results = matchSchemes(profile, mockSchemes);

    const pmegp = results.find((r) => r.scheme.name === 'PMEGP');
    const standUp = results.find((r) => r.scheme.name === 'Stand-Up India');
    const mahila = results.find((r) => r.scheme.name === 'Mahila Samridhi Yojana');

    expect(pmegp?.eligible).toBe(true);
    expect(standUp?.eligible).toBe(true);
    expect(mahila?.eligible).toBe(false); // male, not female
  });

  // Scenario 2: Female ST entrepreneur with low income — eligible for Mahila + Stand-Up India
  it('Female ST entrepreneur matches Mahila Samridhi Yojana and Stand-Up India', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 8000, // ₹96K annual — well within ₹12L limit
      monthly_expense_est: 5000,
      existing_loans: false,
      category: 'st',
      sector: 'services',
      gender: 'female',
    };

    const results = matchSchemes(profile, mockSchemes);

    const mahila = results.find((r) => r.scheme.name === 'Mahila Samridhi Yojana');
    const standUp = results.find((r) => r.scheme.name === 'Stand-Up India');

    expect(mahila?.eligible).toBe(true);
    expect(standUp?.eligible).toBe(true);
  });

  // Scenario 3: High-revenue general category male — exceeds income limits
  it('High-revenue general category male exceeds PMEGP income limit', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 250000, // ₹30L annual — exceeds PMEGP ₹25L limit
      monthly_expense_est: 150000,
      existing_loans: true,
      category: 'general',
      sector: 'manufacturing',
      gender: 'male',
    };

    const results = matchSchemes(profile, mockSchemes);

    const pmegp = results.find((r) => r.scheme.name === 'PMEGP');
    expect(pmegp?.eligible).toBe(false);
    // Reason should mention the income limit
    expect(pmegp?.reasons.some((r) => r.includes('exceeds'))).toBe(true);
  });

  // Scenario 4: Agriculture sector entrepreneur matches KVIC Honey Mission
  it('Agriculture sector entrepreneur matches KVIC Honey Mission', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 12000,
      monthly_expense_est: 8000,
      existing_loans: false,
      category: 'obc',
      sector: 'agriculture',
      gender: 'male',
    };

    const results = matchSchemes(profile, mockSchemes);

    const kvic = results.find((r) => r.scheme.name === 'KVIC Honey Mission');
    expect(kvic?.eligible).toBe(true);
    expect(kvic?.reasons.some((r) => r.includes('✓'))).toBe(true);
  });

  // Scenario 5: Any entrepreneur qualifies for PM SVANidhi (no eligibility restrictions)
  it('Any entrepreneur qualifies for PM SVANidhi (open scheme)', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 5000,
      monthly_expense_est: 4000,
      existing_loans: false,
      category: 'general',
      sector: 'street_vending',
      gender: 'female',
    };

    const results = matchSchemes(profile, mockSchemes);

    const svaNidhi = results.find((r) => r.scheme.name === 'PM SVANidhi');
    expect(svaNidhi?.eligible).toBe(true);
    expect(svaNidhi?.reasons.some((r) => r.includes('no specific eligibility'))).toBe(true);
  });

  // Scenario 6: Eligible schemes appear first in sorted results
  it('Returns eligible schemes before ineligible ones', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 5000,
      monthly_expense_est: 3000,
      existing_loans: false,
      category: 'general',
      gender: 'male',
    };

    const results = matchSchemes(profile, mockSchemes);

    // Find the index of first ineligible result
    const firstIneligibleIndex = results.findIndex((r) => !r.eligible);
    // Find the index of last eligible result
    const lastEligibleIndex = results.reduce(
      (acc, r, i) => (r.eligible ? i : acc),
      -1
    );

    // All eligible schemes should appear before ineligible ones
    if (firstIneligibleIndex !== -1 && lastEligibleIndex !== -1) {
      expect(lastEligibleIndex).toBeLessThan(firstIneligibleIndex);
    }
  });

  // Scenario 7: Reasons contain meaningful text
  it('Reasons contain human-readable text with checkmarks', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 20000,
      monthly_expense_est: 12000,
      existing_loans: false,
      category: 'sc',
      sector: 'retail',
      gender: 'male',
    };

    const results = matchSchemes(profile, mockSchemes);

    results.forEach((result) => {
      expect(result.reasons.length).toBeGreaterThan(0);
      result.reasons.forEach((reason) => {
        expect(typeof reason).toBe('string');
        expect(reason.length).toBeGreaterThan(0);
      });
    });
  });

  // Scenario 8: Empty profile category fails category-restricted schemes
  it('Profile with no category fails category-restricted schemes', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 10000,
      monthly_expense_est: 7000,
      existing_loans: false,
      // no category
      gender: 'male',
    };

    const results = matchSchemes(profile, mockSchemes);

    const standUp = results.find((r) => r.scheme.name === 'Stand-Up India');
    expect(standUp?.eligible).toBe(false);
    expect(standUp?.reasons.some((r) => r.includes('not specified'))).toBe(true);
  });

  // Scenario 9: SVEP matches for active SHG member in covered sector with district caveat
  it('SHG member in tailoring sector qualifies for SVEP with explicit block-specific caveat', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 12000,
      monthly_expense_est: 8000,
      existing_loans: false,
      category: 'obc',
      sector: 'tailoring',
      gender: 'female',
      is_shg_member: true,
      shg_membership: 'shg_member',
    };

    const results = matchSchemes(profile, mockSchemes);
    const svep = results.find((r) => r.scheme.id === 'svep-nrlm');

    expect(svep).toBeDefined();
    expect(svep?.eligible).toBe(true);

    // Profile confirms SHG affiliation in reasons
    expect(
      svep?.reasons.some((r) => r.includes('Self-Help Group (SHG) membership or family relation'))
    ).toBe(true);

    // Must include the mandatory district caveat
    const expectedCaveat =
      "This programme is not yet active in every district — confirm with your local SHG/Panchayat contact before assuming it's available in your area";
    expect(svep?.reasons).toContain(expectedCaveat);
  });

  // Scenario 10: SVEP matches for family member of an SHG member
  it('Family member of SHG member qualifies for SVEP', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 20000,
      monthly_expense_est: 14000,
      existing_loans: false,
      category: 'general',
      sector: 'retail',
      gender: 'male',
      shg_relation: 'shg_member_family',
    };

    const results = matchSchemes(profile, mockSchemes);
    const svep = results.find((r) => r.scheme.id === 'svep-nrlm');

    expect(svep?.eligible).toBe(true);
    const expectedCaveat =
      "This programme is not yet active in every district — confirm with your local SHG/Panchayat contact before assuming it's available in your area";
    expect(svep?.reasons).toContain(expectedCaveat);
  });

  // Scenario 11: SVEP fails for users without SHG affiliation
  it('Non-SHG member does not qualify for SVEP even in an eligible sector', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 15000,
      monthly_expense_est: 10000,
      existing_loans: false,
      category: 'general',
      sector: 'tailoring',
      gender: 'female',
      is_shg_member: false,
      shg_membership: 'none',
    };

    const results = matchSchemes(profile, mockSchemes);
    const svep = results.find((r) => r.scheme.id === 'svep-nrlm');

    expect(svep?.eligible).toBe(false);
    expect(
      svep?.reasons.some((r) =>
        r.includes('This scheme requires Self-Help Group (SHG) membership or relation')
      )
    ).toBe(true);

    // Caveat is still present in reasons
    const expectedCaveat =
      "This programme is not yet active in every district — confirm with your local SHG/Panchayat contact before assuming it's available in your area";
    expect(svep?.reasons).toContain(expectedCaveat);
  });

  // Scenario 12: SVEP fails when SHG info is not provided
  it('User with no SHG info does not qualify for SVEP', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 15000,
      monthly_expense_est: 10000,
      existing_loans: false,
      category: 'general',
      sector: 'retail',
      gender: 'male',
    };

    const results = matchSchemes(profile, mockSchemes);
    const svep = results.find((r) => r.scheme.id === 'svep-nrlm');

    expect(svep?.eligible).toBe(false);
  });

  // Scenario 13: SVEP fails for farm sector even if SHG member
  it('SHG member in farming sector fails SVEP sector check (non-farm only)', () => {
    const profile: BusinessProfile = {
      monthly_revenue_est: 10000,
      monthly_expense_est: 6000,
      existing_loans: false,
      category: 'obc',
      sector: 'farming',
      gender: 'female',
      is_shg_member: true,
    };

    const results = matchSchemes(profile, mockSchemes);
    const svep = results.find((r) => r.scheme.id === 'svep-nrlm');

    expect(svep?.eligible).toBe(false);
    expect(svep?.reasons.some((r) => r.includes('Your sector (farming) is not listed'))).toBe(true);
  });
});

describe('sectorMatches', () => {
  it('matches the same word', () => {
    expect(sectorMatches('retail', ['retail', 'services'])).toBe(true);
    expect(sectorMatches('dairy', ['retail', 'services'])).toBe(false);
  });

  it('lets an "agriculture" profile satisfy a "farming" rule and vice versa', () => {
    expect(sectorMatches('agriculture', ['farming'])).toBe(true);
    expect(sectorMatches('farming', ['agriculture'])).toBe(true);
  });

  it('maps the form sectors onto the rule vocabulary', () => {
    expect(sectorMatches('food', ['food_processing'])).toBe(true);
    expect(sectorMatches('dairy', ['dairy_processing'])).toBe(true);
    expect(sectorMatches('manufacturing', ['crafts'])).toBe(true);
    expect(sectorMatches('tailoring', ['handicraft'])).toBe(true);
  });

  it('treats non_farm as everything except cultivation', () => {
    expect(sectorMatches('retail', ['non_farm'])).toBe(true);
    expect(sectorMatches('services', ['non_farm'])).toBe(true);
    expect(sectorMatches('agriculture', ['non_farm'])).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(sectorMatches('Agriculture', ['Farming'])).toBe(true);
  });
});

describe('ranking of eligible schemes', () => {
  const profile: BusinessProfile = {
    monthly_revenue_est: 25000,
    monthly_expense_est: 15000,
    existing_loans: false,
    sector: 'retail',
  };
  const portal: SchemeRecord = { id: 'portal', name: 'Grievance Portal', eligibility_rules: {}, scheme_type: 'other' };
  const loan: SchemeRecord = {
    id: 'loan', name: 'Small Loan', eligibility_rules: { income_max: 2500000, sector: ['retail'] }, scheme_type: 'loan',
  };
  const registration: SchemeRecord = {
    id: 'reg', name: 'Registration', eligibility_rules: { sector: ['retail'] }, scheme_type: 'registration',
  };

  it('puts schemes that matched the person before ones with no rules', () => {
    const ids = matchSchemes(profile, [portal, registration, loan]).map((r) => r.scheme.id);
    expect(ids).toEqual(['loan', 'reg', 'portal']);
  });

  it('puts money before portals when the fit is equal', () => {
    const grant: SchemeRecord = { id: 'grant', name: 'Grant', eligibility_rules: {}, scheme_type: 'subsidy' };
    const ids = matchSchemes(profile, [portal, grant]).map((r) => r.scheme.id);
    expect(ids).toEqual(['grant', 'portal']);
  });

  it('still lists ineligible schemes last', () => {
    const women: SchemeRecord = { id: 'w', name: 'Women only', eligibility_rules: { gender: 'female' }, scheme_type: 'loan' };
    const ids = matchSchemes({ ...profile, gender: 'male' }, [women, portal]).map((r) => r.scheme.id);
    expect(ids).toEqual(['portal', 'w']);
  });
});
