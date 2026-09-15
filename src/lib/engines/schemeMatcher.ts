/**
 * schemeMatcher.ts
 * Scheme eligibility matching engine for Indian government schemes.
 * Pure TypeScript — no external dependencies.
 * Checks a business profile against eligibility rules and returns
 * detailed match results with human-readable reasons.
 */

/** Eligibility rules stored per scheme (from JSONB column in DB) */
export interface EligibilityRules {
  /** Maximum annual income/turnover for eligibility (₹) */
  income_max?: number;
  /** Eligible social categories: 'sc' | 'st' | 'obc' | 'general' | 'minority' */
  category?: string[];
  /** Eligible business sectors */
  sector?: string[];
  /** Required gender: 'female' | 'male' | 'any' */
  gender?: string;
  /** State restriction (if any) */
  state?: string;
  /** Maximum loan amount available under scheme (₹) */
  loan_amount_max?: number;
  /** Minimum loan amount under scheme (₹) */
  loan_amount_min?: number;
  /** Whether Self-Help Group (SHG) membership is strictly required */
  requires_shg_membership?: boolean;
  /** Eligible relation to SHG member (e.g. ['shg_member', 'shg_member_family']) */
  eligible_relation?: string[];
  /** Area type restriction (e.g. 'rural' | 'urban') */
  area_type?: string;
  /** Implementation scope note (e.g. 'block_specific_not_nationwide') */
  implementation_note?: string;
  /** Priority groups targeted (e.g. ['women', 'youth']) */
  priority_groups?: string[];
}

/** A scheme record from the database */
export interface SchemeRecord {
  id: string;
  name: string;
  description?: string;
  benefit_summary?: string;
  eligibility_rules: EligibilityRules;
  application_link?: string;
  /** Ministry or agency running the scheme (schemes.sponsoring_body). */
  sponsoring_body?: string;
  /** Applicant document checklist (schemes.required_documents). */
  required_documents?: string[];
  active?: boolean;
  /** loan | subsidy | direct_benefit | credit_guarantee | training | registration | other (schemes.scheme_type). */
  scheme_type?: string | null;
  /** Hindi name and benefit (migration 016); English when absent. */
  name_hi?: string | null;
  benefit_summary_hi?: string | null;
}

/** Business profile input for matching */
export interface BusinessProfile {
  monthly_revenue_est: number;
  monthly_expense_est: number;
  existing_loans: boolean;
  /** Social category: 'sc' | 'st' | 'obc' | 'general' | 'minority' */
  category?: string;
  /** Business sector e.g. 'agriculture', 'manufacturing', 'retail', 'services' */
  sector?: string;
  /** 'male' | 'female' | 'other' */
  gender?: string;
  /** State name */
  state?: string;
  /**
   * SHG (Self-Help Group) association.
   * Can be boolean or status string ('shg_member' | 'shg_member_family' | 'none' | 'yes' | 'no')
   */
  shg_membership?: boolean | string;
  /** Explicit boolean flag indicating whether the entrepreneur is an SHG member */
  is_shg_member?: boolean;
  /** Specific relationship to an SHG member ('shg_member' | 'shg_member_family') */
  shg_relation?: string;
  /** Area type ('rural' | 'urban') */
  area_type?: string;
}

/** Result of checking a single scheme against a profile */
export interface MatchResult {
  scheme: SchemeRecord;
  eligible: boolean;
  /** Human-readable reasons — explains why eligible or which rules were not met */
  reasons: string[];
}

/**
 * The onboarding form offers eight sectors; scheme rules were written with
 * the government's own vocabulary. Without this table a farmer who picked
 * "agriculture" never matched PM-Kisan, whose rule says "farming".
 *
 * Keys are the words a rule may use; values are the profile sectors that
 * satisfy it. A rule word absent from this table matches only itself.
 */
const SECTOR_ALIASES: Record<string, readonly string[]> = {
  farming: ['agriculture'],
  agriculture: ['farming'],
  food_processing: ['food'],
  food: ['food_processing'],
  dairy_processing: ['dairy'],
  crafts: ['manufacturing', 'tailoring'],
  handicraft: ['manufacturing', 'tailoring'],
  // "non-farm" in NRLM programmes means any rural enterprise that is not
  // cultivation — every other sector the form offers.
  non_farm: ['retail', 'tailoring', 'dairy', 'food', 'manufacturing', 'services', 'general'],
};

/** Whether a profile sector satisfies any of a rule's sector words. */
export function sectorMatches(profileSector: string, ruleSectors: string[]): boolean {
  const mine = profileSector.toLowerCase();
  return ruleSectors.some((word) => {
    const w = word.toLowerCase();
    return w === mine || (SECTOR_ALIASES[w] ?? []).includes(mine);
  });
}

/**
 * Checks whether a business profile indicates that the entrepreneur
 * is part of an SHG or related to an SHG member.
 */
export function checkShgAffiliation(
  profile: BusinessProfile,
  eligibleRelations?: string[]
): boolean {
  if (profile.is_shg_member === true) {
    return true;
  }
  if (profile.shg_membership === true) {
    return true;
  }
  if (typeof profile.shg_membership === 'string') {
    const val = profile.shg_membership.trim().toLowerCase();
    if (val === 'shg_member' || val === 'shg_member_family' || val === 'yes' || val === 'true') {
      return true;
    }
    if (eligibleRelations && eligibleRelations.map((r) => r.toLowerCase()).includes(val)) {
      return true;
    }
    if (val !== 'none' && val !== 'no' && val !== 'false' && val !== '') {
      return true;
    }
  }
  if (typeof profile.shg_relation === 'string') {
    const rel = profile.shg_relation.trim().toLowerCase();
    if (rel === 'shg_member' || rel === 'shg_member_family' || rel === 'yes' || rel === 'true') {
      return true;
    }
    if (eligibleRelations && eligibleRelations.map((r) => r.toLowerCase()).includes(rel)) {
      return true;
    }
    if (rel !== 'none' && rel !== 'no' && rel !== 'false' && rel !== '') {
      return true;
    }
  }
  return false;
}

/**
 * Match a business profile against an array of schemes.
 * For each scheme, checks all defined eligibility rules and generates
 * human-readable reason strings.
 *
 * @param profile - The entrepreneur's business profile
 * @param schemes - All schemes fetched from the database
 * @returns Array of MatchResult sorted: eligible first, ineligible after
 */
export function matchSchemes(
  profile: BusinessProfile,
  schemes: SchemeRecord[]
): MatchResult[] {
  const results: MatchResult[] = schemes.map((scheme) => {
    const rules = scheme.eligibility_rules;
    const reasons: string[] = [];
    let eligible = true;

    // ── 1. Income / Revenue Check ──────────────────────────────────────
    if (rules.income_max !== undefined) {
      const annualRevenue = profile.monthly_revenue_est * 12;
      if (annualRevenue <= rules.income_max) {
        reasons.push(
          `✓ Your annual revenue (₹${annualRevenue.toLocaleString('en-IN')}) is within the scheme limit (₹${rules.income_max.toLocaleString('en-IN')})`
        );
      } else {
        eligible = false;
        reasons.push(
          `✗ Your annual revenue (₹${annualRevenue.toLocaleString('en-IN')}) exceeds the income limit (₹${rules.income_max.toLocaleString('en-IN')})`
        );
      }
    }

    // ── 2. Social Category Check ───────────────────────────────────────
    if (rules.category && rules.category.length > 0) {
      const profileCategory = profile.category?.toLowerCase();
      if (profileCategory && rules.category.map((c) => c.toLowerCase()).includes(profileCategory)) {
        reasons.push(
          `✓ Your social category (${profile.category}) is eligible for this scheme`
        );
      } else {
        eligible = false;
        const allowed = rules.category.join(', ').toUpperCase();
        reasons.push(
          `✗ This scheme is reserved for: ${allowed}. Your category (${profile.category || 'not specified'}) does not qualify`
        );
      }
    }

    // ── 3. Sector Check ───────────────────────────────────────────────
    if (rules.sector && rules.sector.length > 0) {
      const profileSector = profile.sector?.toLowerCase();
      if (profileSector && sectorMatches(profileSector, rules.sector)) {
        reasons.push(`✓ Your business sector (${profile.sector}) is covered by this scheme`);
      } else {
        eligible = false;
        const allowed = rules.sector.join(', ');
        reasons.push(
          `✗ This scheme covers: ${allowed}. Your sector (${profile.sector || 'not specified'}) is not listed`
        );
      }
    }

    // ── 4. Gender Check ───────────────────────────────────────────────
    if (rules.gender && rules.gender !== 'any') {
      const profileGender = profile.gender?.toLowerCase();
      if (profileGender === rules.gender.toLowerCase()) {
        reasons.push(`✓ This scheme is available for your gender`);
      } else {
        eligible = false;
        reasons.push(
          `✗ This scheme is specifically for ${rules.gender} entrepreneurs`
        );
      }
    }

    // ── 5. State Restriction Check ────────────────────────────────────
    if (rules.state) {
      const profileState = profile.state?.toLowerCase();
      if (profileState && rules.state.toLowerCase() === profileState) {
        reasons.push(`✓ This scheme is available in your state (${profile.state})`);
      } else {
        eligible = false;
        reasons.push(
          `✗ This scheme is only available in ${rules.state}. Your state: ${profile.state || 'not specified'}`
        );
      }
    }

    // ── 6. SHG Membership Check ───────────────────────────────────────
    if (rules.requires_shg_membership) {
      const isAffiliated = checkShgAffiliation(profile, rules.eligible_relation);
      if (isAffiliated) {
        reasons.push(
          '✓ Your profile indicates Self-Help Group (SHG) membership or family relation'
        );
      } else {
        eligible = false;
        reasons.push(
          '✗ This scheme requires Self-Help Group (SHG) membership or relation to an SHG member'
        );
      }
    }

    // ── 7. Area Type Check ────────────────────────────────────────────
    if (rules.area_type && profile.area_type) {
      if (profile.area_type.toLowerCase() === rules.area_type.toLowerCase()) {
        reasons.push(`✓ Your area type (${profile.area_type}) is eligible for this scheme`);
      } else {
        eligible = false;
        reasons.push(
          `✗ This scheme is specifically for ${rules.area_type} areas. Your area type: ${profile.area_type}`
        );
      }
    }

    // ── 8. Implementation Note / District Caveat ─────────────────────
    if (rules.implementation_note === 'block_specific_not_nationwide') {
      reasons.push(
        "This programme is not yet active in every district — confirm with your local SHG/Panchayat contact before assuming it's available in your area"
      );
    }

    // ── 9. If no specific rules, scheme is universally applicable ─────
    if (Object.keys(rules).length === 0) {
      reasons.push('✓ This scheme has no specific eligibility restrictions — broadly applicable');
    }

    // ── 10. Add general eligibility summary ───────────────────────────
    if (eligible && reasons.length === 0) {
      reasons.push('✓ You appear to meet all eligibility criteria for this scheme');
    }

    return { scheme, eligible, reasons };
  });

  // Eligible first. Within the eligible set, the ones that matched this
  // person specifically come before the ones that match everyone, and
  // money before portals: a kirana owner's top result should be a loan or
  // subsidy they fit, not a grievance portal that has no rules at all.
  return results.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (!a.eligible) return 0;
    const fit = specificMatches(b) - specificMatches(a);
    if (fit !== 0) return fit;
    return typeRank(a.scheme.scheme_type) - typeRank(b.scheme.scheme_type);
  });
}

/** How many rules this person satisfied, ignoring the "no rules" tick. */
function specificMatches(result: MatchResult): number {
  return result.reasons.filter((r) => r.startsWith('✓') && !r.includes('no specific eligibility')).length;
}

const TYPE_ORDER = ['loan', 'subsidy', 'direct_benefit', 'credit_guarantee', 'training', 'registration', 'other'];

/** Lower is better. Rows without a type (the original seed) sit with loans/subsidies. */
function typeRank(type?: string | null): number {
  if (!type) return 1;
  const i = TYPE_ORDER.indexOf(type);
  return i === -1 ? TYPE_ORDER.length : i;
}
