/**
 * financialEngine.ts
 * Pure TypeScript financial calculation engine.
 * No external dependencies — all logic is deterministic and testable.
 */

/**
 * Calculate the break-even point in units.
 * Break-even = Fixed Costs / (Price Per Unit - Variable Cost Per Unit)
 *
 * @param fixedCosts - Total fixed costs per period (₹)
 * @param pricePerUnit - Selling price per unit (₹)
 * @param variableCostPerUnit - Variable cost per unit (₹)
 * @returns Number of units needed to break even, or Infinity if contribution margin is 0 or negative
 */
export function calculateBreakEven(
  fixedCosts: number,
  pricePerUnit: number,
  variableCostPerUnit: number
): number {
  const contributionMargin = pricePerUnit - variableCostPerUnit;

  // Guard: division by zero or negative contribution margin
  if (contributionMargin <= 0) {
    return Infinity;
  }

  return fixedCosts / contributionMargin;
}

/**
 * Calculate net profit in rupees for the period.
 *
 * The deck and the UI both talk about a "profit picture", but only a margin
 * percentage and a break-even target were ever computed. A percentage is not
 * what a shopkeeper checks at the end of the month; the rupee figure is.
 *
 * @param revenue - Total revenue for the period (₹)
 * @param expenses - Total expenses for the period (₹)
 * @returns Net profit (₹). Negative when running at a loss.
 */
export function calculateNetProfit(revenue: number, expenses: number): number {
  return revenue - expenses;
}

/**
 * Calculate the break-even point in RUPEES of monthly sales.
 *
 * Break-even revenue = Fixed Costs / Contribution Margin Ratio
 *
 * This is the figure the app actually reports. It is distinct from
 * `calculateBreakEven` above, which answers "how many units?" and needs
 * per-unit price and cost data this app never collects at onboarding.
 *
 * @param fixedCosts - Costs that must be covered each month (₹)
 * @param contributionMarginRatio - Share of each rupee of sales left after
 *   variable costs, in (0, 1]. Defaults to 1: with no split between fixed and
 *   variable costs available, every rupee of expenses must be covered by a
 *   rupee of sales, so break-even revenue equals total monthly expenses.
 * @returns Monthly sales needed to cover costs (₹), or Infinity if the
 *   contribution margin is zero or negative (no sales volume ever breaks even)
 */
export function calculateBreakEvenRevenue(
  fixedCosts: number,
  contributionMarginRatio: number = 1
): number {
  if (contributionMarginRatio <= 0) {
    return Infinity;
  }

  return fixedCosts / contributionMarginRatio;
}

/**
 * Calculate the profit margin percentage.
 * Margin % = (Revenue - Expenses) / Revenue * 100
 *
 * @param revenue - Total revenue (₹)
 * @param expenses - Total expenses (₹)
 * @returns Margin as a percentage (can be negative for a loss). Returns 0 if revenue is 0.
 */
export function calculateMarginPercent(revenue: number, expenses: number): number {
  // Guard: division by zero
  if (revenue === 0) {
    return 0;
  }

  return ((revenue - expenses) / revenue) * 100;
}

/**
 * Assess the cash flow risk level for a business.
 *
 * Risk levels:
 * - 'high':   expenses/revenue >= 0.9, OR existing loans with expenses/revenue >= 0.7, OR revenue = 0
 * - 'medium': expenses/revenue >= 0.7, OR existing loans present
 * - 'low':    all other cases
 *
 * @param monthlyRevenue - Monthly revenue (₹)
 * @param monthlyExpenses - Monthly expenses (₹)
 * @param existingLoans - Whether the business has outstanding loans
 * @returns Risk classification: 'low' | 'medium' | 'high'
 */
export function assessCashFlowRisk(
  monthlyRevenue: number,
  monthlyExpenses: number,
  existingLoans: boolean
): 'low' | 'medium' | 'high' {
  // No revenue → highest risk
  if (monthlyRevenue === 0) {
    return 'high';
  }

  const ratio = monthlyExpenses / monthlyRevenue;

  // High risk conditions
  if (ratio >= 0.9 || (existingLoans && ratio >= 0.7)) {
    return 'high';
  }

  // Medium risk conditions
  if (ratio >= 0.7 || existingLoans) {
    return 'medium';
  }

  return 'low';
}

/** Input profile for financial summary generation */
export interface FinancialSummaryInput {
  monthlyRevenueEst: number;
  monthlyExpenseEst: number;
  existingLoans: boolean;
}

/** Output from financial summary generation */
export interface FinancialSummaryOutput {
  /** Net profit for the month in rupees; negative when at a loss. */
  netProfit: number;
  /**
   * Monthly sales needed to cover costs, in RUPEES.
   *
   * Was previously `breakEvenUnits` and was computed as
   * `calculateBreakEven(expenses, revenue, 0)`, which returns
   * `expenses / revenue` — a ratio, not units and not rupees. It was stored in
   * a column called `break_even_units` while the explanation text told the
   * user a rupee figure, so the number shown, the number stored and the label
   * on it were three different things.
   */
  breakEvenRevenue: number;
  marginPercent: number;
  cashFlowRisk: 'low' | 'medium' | 'high';
  explanation: string;
}

/**
 * Generate a complete financial summary for a business profile.
 * Uses deterministic calculations — no LLM involved.
 * The explanation is a template-based string in English; it will be
 * translated/rephrased by the LLM in the API layer.
 *
 * Break-even is reported in rupees of monthly sales, not units: onboarding
 * collects monthly totals, never per-unit price or variable cost, so a
 * unit-based break-even cannot honestly be derived from this input. With no
 * fixed/variable split available every rupee of expense must be covered by a
 * rupee of sales, so the target equals monthly expenses. Once per-unit data
 * exists, pass a real contribution margin ratio to
 * `calculateBreakEvenRevenue`, or use `calculateBreakEven` for units.
 *
 * @param profile - Business financial profile
 * @returns Financial summary with metrics and human-readable explanation
 */
export function generateFinancialSummary(
  profile: FinancialSummaryInput
): FinancialSummaryOutput {
  const { monthlyRevenueEst, monthlyExpenseEst, existingLoans } = profile;

  // Treat every expense as a cost that must be covered by sales. Note this
  // deliberately does not depend on current revenue: a business earning
  // nothing still needs to reach ₹{expenses} of sales to break even, whereas
  // the old formula returned Infinity in exactly that case.
  const breakEvenRevenue = calculateBreakEvenRevenue(monthlyExpenseEst);

  const netProfit = calculateNetProfit(monthlyRevenueEst, monthlyExpenseEst);
  const marginPercent = calculateMarginPercent(monthlyRevenueEst, monthlyExpenseEst);
  const cashFlowRisk = assessCashFlowRisk(monthlyRevenueEst, monthlyExpenseEst, existingLoans);

  // Build a template explanation (no LLM — pure string template)
  const riskDescriptions: Record<string, string> = {
    low: 'Your cash flow looks healthy. You have a comfortable buffer between income and expenses.',
    medium:
      'Your cash flow has moderate risk. Consider reducing discretionary expenses or increasing revenue streams.',
    high: 'Your cash flow is under significant pressure. Immediate attention to expense reduction or revenue growth is recommended.',
  };

  const loanNote = existingLoans
    ? ' Note: Your existing loan obligations increase your financial risk — factor in EMI payments carefully.'
    : '';

  const marginNote =
    netProfit >= 0
      ? `You are keeping about ₹${netProfit.toFixed(0)} a month, a margin of ${marginPercent.toFixed(1)}%.`
      : `You are short by about ₹${Math.abs(netProfit).toFixed(0)} a month, a loss of ${Math.abs(marginPercent).toFixed(1)}%.`;

  const breakEvenNote = isFinite(breakEvenRevenue)
    ? `You need at least ₹${breakEvenRevenue.toFixed(0)} in monthly sales to cover your costs.`
    : 'Break-even cannot be calculated with the current data.';

  const explanation =
    `${riskDescriptions[cashFlowRisk]}${loanNote} ` +
    `${marginNote} ${breakEvenNote} ` +
    `Monthly Revenue: ₹${monthlyRevenueEst.toFixed(0)}, Monthly Expenses: ₹${monthlyExpenseEst.toFixed(0)}.`;

  return {
    netProfit: parseFloat(netProfit.toFixed(2)),
    breakEvenRevenue: isFinite(breakEvenRevenue)
      ? parseFloat(breakEvenRevenue.toFixed(2))
      : Infinity,
    marginPercent: parseFloat(marginPercent.toFixed(2)),
    cashFlowRisk,
    explanation,
  };
}

/**
 * The same figures, said plainly, in the language on screen — as two or
 * three short points a person can take in at a glance.
 *
 * `explanation` above is the English template the plan stores when no model
 * is configured; the dashboard used to print that paragraph (or the model's)
 * whole. This is what to render instead.
 */
export function explainPoints(
  summary: Pick<FinancialSummaryOutput, 'netProfit' | 'marginPercent' | 'breakEvenRevenue' | 'cashFlowRisk'>,
  lang: 'hi' | 'en',
  existingLoans = false
): string[] {
  const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const { netProfit, marginPercent, breakEvenRevenue, cashFlowRisk } = summary;
  const be = isFinite(breakEvenRevenue) ? inr(breakEvenRevenue) : null;
  // "₹100 of every ₹100" is what 99.9% rounds to, and it reads as nonsense.
  // Whole rupees normally; one decimal when rounding would say "all of it".
  const per100 = marginPercent >= 99.5 && marginPercent < 100 ? marginPercent.toFixed(1) : marginPercent.toFixed(0);

  if (lang === 'hi') {
    const points = [
      netProfit >= 0
        ? `इस महीने ${inr(netProfit)} बचे — हर ₹100 में से ₹${per100}।`
        : `इस महीने ${inr(Math.abs(netProfit))} कम पड़े — खर्च कमाई से ज़्यादा है।`,
    ];
    if (be) points.push(`खर्च निकालने के लिए हर महीने कम से कम ${be} की बिक्री चाहिए।`);
    points.push(
      {
        low: 'पैसा सुरक्षित है — कमाई और खर्च में अच्छा फ़ासला है।',
        medium: 'थोड़ा ध्यान रखें — फ़ासला ज़्यादा नहीं है।',
        high: 'सावधान — खर्च कमाई के बहुत करीब है।',
      }[cashFlowRisk] + (existingLoans ? ' लोन की किस्त भी इसी में गिनें।' : '')
    );
    return points;
  }

  const points = [
    netProfit >= 0
      ? `You kept ${inr(netProfit)} this month — ₹${per100} of every ₹100.`
      : `You were short by ${inr(Math.abs(netProfit))} this month — costs are more than sales.`,
  ];
  if (be) points.push(`You need at least ${be} in sales every month to cover costs.`);
  points.push(
    {
      low: 'Your money is safe — a good gap between what comes in and what goes out.',
      medium: 'Keep an eye on it — the gap is not large.',
      high: 'Be careful — costs are very close to sales.',
    }[cashFlowRisk] + (existingLoans ? ' Count the loan instalment in this too.' : '')
  );
  return points;
}

/** The points above as one paragraph, for places that store a single string. */
export function explainPlain(
  summary: Pick<FinancialSummaryOutput, 'netProfit' | 'marginPercent' | 'breakEvenRevenue' | 'cashFlowRisk'>,
  lang: 'hi' | 'en',
  existingLoans = false
): string {
  return explainPoints(summary, lang, existingLoans).join(' ');
}
