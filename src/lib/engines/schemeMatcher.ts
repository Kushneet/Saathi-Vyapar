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
}

/** Result of checking a single scheme against a profile */
export interface MatchResult {
  scheme: SchemeRecord;
  eligible: boolean;
  /** Human-readable reasons — explains why eligible or which rules were not met */
  reasons: string[];
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
      if (profileSector && rules.sector.map((s) => s.toLowerCase()).includes(profileSector)) {
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

    // ── 6. If no specific rules, scheme is universally applicable ─────
    if (Object.keys(rules).length === 0) {
      reasons.push('✓ This scheme has no specific eligibility restrictions — broadly applicable');
    }

    // ── 7. Add general eligibility summary ────────────────────────────
    if (eligible && reasons.length === 0) {
      reasons.push('✓ You appear to meet all eligibility criteria for this scheme');
    }

    return { scheme, eligible, reasons };
  });

  // Sort: eligible schemes first
  return results.sort((a, b) => {
    if (a.eligible === b.eligible) return 0;
    return a.eligible ? -1 : 1;
  });
}
