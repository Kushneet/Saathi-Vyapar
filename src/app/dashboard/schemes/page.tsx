'use client';

/**
 * src/app/dashboard/schemes/page.tsx — Yojana Kendra
 *
 * Every government scheme in the table, matched against this person's
 * profile, in the language on screen. The previous page showed Hindi and
 * English on every line, a "#Rank 1" badge, eight profile boxes and an
 * "Update details" button that restarted the whole onboarding. This one:
 *
 *   - says what the match is based on in one line, with "Change details"
 *     opening a small form right here (PATCH /api/profile)
 *   - lets the user filter by kind (loan, grant, training, …), sort, and
 *     search, and see the ones they do not qualify for with the reason
 *   - shows per scheme: name, what you get, why you qualify, the papers
 *     you need (tick them off), and Apply
 *
 * Matching itself is the same deterministic schemeMatcher the dashboard
 * and the plan use, run in the browser on the rows the anon client can
 * read (RLS allows schemes for everyone).
 */

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabaseClient } from '@/lib/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import LanguageToggleButton from '@/components/LanguageToggleButton';
import { matchSchemes, type MatchResult, type BusinessProfile, type SchemeRecord } from '@/lib/engines/schemeMatcher';
import { localizeReason, reasonPassed } from '@/lib/engines/localizeReason';
import { sectorLabel } from '@/lib/engines/sectorLabel';

type Lang = 'hi' | 'en';
type Kind = 'loan' | 'subsidy' | 'direct_benefit' | 'credit_guarantee' | 'training' | 'registration' | 'other';
type Filter = 'eligible' | Kind | 'ineligible' | 'all';
type Sort = 'best' | 'name' | 'amount';

/** A scheme row with the optional Hindi columns. */
interface SchemeRow extends SchemeRecord {
  name_hi?: string | null;
  benefit_summary_hi?: string | null;
}

interface ProfileRow {
  sector: string | null;
  district: string | null;
  state: string | null;
  monthly_revenue_est: number | null;
  monthly_expense_est: number | null;
  existing_loans: boolean | null;
  loan_amount: number | null;
  loan_monthly_payment: number | null;
  loan_interest_rate: number | null;
  category: string | null;
  gender: string | null;
  is_shg_member: boolean | null;
  shg_membership: string | boolean | null;
  shg_relation: string | null;
}

const SECTORS = ['retail', 'tailoring', 'dairy', 'agriculture', 'food', 'manufacturing', 'services', 'general'] as const;

/** The original 15 rows carry no scheme_type; this is what they are. */
const SEED_KIND: Record<string, Kind> = {
  'mudra-shishu': 'loan', 'mudra-kishor': 'loan', 'mudra-tarun': 'loan', 'wdc-mahila': 'loan',
  'stand-up-india': 'loan', 'pm-svanidhi': 'loan', 'agriculture-kcc': 'loan', 'dairy-nabard': 'subsidy',
  pmegp: 'subsidy', 'nrlm-sjsry': 'subsidy', sfurti: 'subsidy', 'pm-kisan-samman': 'direct_benefit',
  pmkvy: 'training', 'uam-msme': 'registration', cgtmse: 'credit_guarantee',
};

function kindOf(s: SchemeRow): Kind {
  return (s.scheme_type || SEED_KIND[s.id] || 'other') as Kind;
}

/**
 * What kind of paper a document string is asking for, so the user can tick
 * "I have Aadhaar, PAN and a bank passbook" and see only the schemes those
 * are enough for. Strings are free text from the table; keywords decide.
 * Anything unrecognised is 'other', which the user can also tick.
 */
type Paper = 'aadhaar' | 'pan' | 'bank' | 'udyam' | 'address' | 'caste' | 'shop';
/** Only papers that are an identity or a proof. Photos, quotations and
 *  project reports are not filtered on: everyone can get those made. */
const PAPERS: Paper[] = ['aadhaar', 'pan', 'bank', 'udyam', 'address', 'caste', 'shop'];

function paperOf(doc: string): Paper | null {
  const d = doc.toLowerCase();
  // Udyam first: "उद्यम आधार" contains "आधार" and is not an Aadhaar card.
  if (/udyam|उद्यम|msme reg|incorporation|पंजीकरण/.test(d)) return 'udyam';
  if (/aadhaar|आधार|voter|पहचान/.test(d)) return 'aadhaar';
  if (/\bpan\b|पैन|फॉर्म 60/.test(d)) return 'pan';
  if (/bank|बैंक|passbook|पासबुक|statement/.test(d)) return 'bank';
  if (/address|निवास|ration|राशन|residence/.test(d)) return 'address';
  if (/caste|जाति|sc\/st/.test(d)) return 'caste';
  if (/shop|दुकान|कार्यस्थल|vending|वेंडिंग/.test(d)) return 'shop';
  return null;
}

/** "आधार कार्ड (Aadhaar Card)" → one language. Anything else is returned whole. */
function docLabel(doc: string, lang: Lang): string {
  const m = doc.match(/^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)\s*$/);
  if (!m) return doc;
  const hi = m[1].trim();
  const en = m[2].trim();
  if (lang === 'hi') return /[ऀ-ॿ]/.test(hi) ? hi : en;
  return en;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function toMatchProfile(p: ProfileRow): BusinessProfile {
  return {
    monthly_revenue_est: Number(p.monthly_revenue_est) || 0,
    monthly_expense_est: Number(p.monthly_expense_est) || 0,
    existing_loans: Boolean(p.existing_loans),
    sector: p.sector || undefined,
    category: p.category || undefined,
    gender: p.gender || undefined,
    state: p.state || undefined,
    is_shg_member: Boolean(p.is_shg_member || p.shg_membership === 'shg_member' || p.shg_membership === true),
    shg_membership: p.shg_membership ?? undefined,
    shg_relation: p.shg_relation ?? undefined,
  };
}

function displayName(s: SchemeRow, lang: Lang): string {
  return (lang === 'hi' && s.name_hi) || s.name;
}

function displayBenefit(s: SchemeRow, lang: Lang): string {
  return (lang === 'hi' && s.benefit_summary_hi) || s.benefit_summary || s.description || '';
}

function YojanaKendraContent() {
  const { t, language } = useLanguage();
  const lang: Lang = language === 'hi' ? 'hi' : 'en';
  const searchParams = useSearchParams();
  const paramUserId = searchParams.get('user_id');

  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [schemes, setSchemes] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>('eligible');
  const [sort, setSort] = useState<Sort>('best');
  const [query, setQuery] = useState('');
  const [have, setHave] = useState<Set<Paper>>(new Set());
  const [papersOpen, setPapersOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // ── Load the person and every scheme ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        // The signed-in user, or the facilitator's ?user_id hint; RLS decides.
        const id = session?.user?.id ?? paramUserId;
        if (!id) {
          setLoadError('login');
          return;
        }
        const [{ data: p }, { data: rows }] = await Promise.all([
          supabaseClient
            .from('business_profiles')
            .select('*')
            .eq('user_id', id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabaseClient.from('schemes').select('*'),
        ]);
        if (cancelled) return;
        setUserId(id);
        setProfile((p as ProfileRow) ?? null);
        setSchemes(((rows ?? []) as SchemeRow[]).map((s) => ({ ...s, eligibility_rules: s.eligibility_rules || {} })));
      } catch (err) {
        console.error('Yojana Kendra load failed:', err);
        if (!cancelled) setLoadError('failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramUserId]);

  // ── Match, then filter / search / sort ────────────────────────────────
  const results: MatchResult[] = useMemo(
    () => (profile ? matchSchemes(toMatchProfile(profile), schemes) : []),
    [profile, schemes]
  );
  const eligibleCount = results.filter((r) => r.eligible).length;

  const shown = useMemo(() => {
    let list = results;
    if (filter === 'eligible') list = list.filter((r) => r.eligible);
    else if (filter === 'ineligible') list = list.filter((r) => !r.eligible);
    else if (filter !== 'all') list = list.filter((r) => r.eligible && kindOf(r.scheme as SchemeRow) === filter);

    // "Papers I have": keep schemes whose every ID-type paper is one the
    // user ticked (photos and the like are ignored). Nothing ticked means
    // no restriction.
    if (have.size > 0) {
      list = list.filter((r) => {
        const ids = ((r.scheme as SchemeRow).required_documents ?? []).map(paperOf).filter((x): x is Paper => x !== null);
        return ids.every((x) => have.has(x));
      });
    }

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const s = r.scheme as SchemeRow;
        return [s.name, s.name_hi, s.benefit_summary, s.benefit_summary_hi, s.description]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(q));
      });
    }

    if (sort === 'name') {
      list = [...list].sort((a, b) =>
        displayName(a.scheme as SchemeRow, lang).localeCompare(displayName(b.scheme as SchemeRow, lang))
      );
    } else if (sort === 'amount') {
      const amt = (r: MatchResult) => Number(r.scheme.eligibility_rules.loan_amount_max ?? 0);
      list = [...list].sort((a, b) => amt(b) - amt(a));
    }
    return list;
  }, [results, filter, query, sort, lang, have]);

  // ── Change details, in place ──────────────────────────────────────────
  function startEdit() {
    if (!profile) return;
    setDraft({ ...profile });
    setSaveMsg(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!draft || !userId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          sector: draft.sector ?? undefined,
          district: draft.district || undefined,
          monthly_revenue_est: Number(draft.monthly_revenue_est) || 0,
          monthly_expense_est: Number(draft.monthly_expense_est) || 0,
          existing_loans: Boolean(draft.existing_loans),
          loan_amount: draft.existing_loans ? Number(draft.loan_amount) || null : null,
          loan_monthly_payment: draft.existing_loans ? Number(draft.loan_monthly_payment) || null : null,
          loan_interest_rate: draft.existing_loans ? Number(draft.loan_interest_rate) || null : null,
          category: draft.category || 'general',
          gender: draft.gender || 'other',
          is_shg_member: Boolean(draft.is_shg_member),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveMsg(data.error || t('common_error'));
        return;
      }
      setProfile(data.profile as ProfileRow);
      setEditing(false);
      setSaveMsg(t('yk_saved'));
      setTimeout(() => setSaveMsg(null), 4000);
    } catch {
      setSaveMsg(t('common_error'));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'eligible', label: t('yk_f_all') },
    { id: 'loan', label: t('yk_f_loan') },
    { id: 'subsidy', label: t('yk_f_subsidy') },
    { id: 'direct_benefit', label: t('yk_f_benefit') },
    { id: 'credit_guarantee', label: t('yk_f_guarantee') },
    { id: 'training', label: t('yk_f_training') },
    { id: 'registration', label: t('yk_f_registration') },
    { id: 'ineligible', label: t('yk_f_ineligible') },
    { id: 'all', label: t('yk_f_everything') },
  ];

  return (
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] font-['Open_Sans',sans-serif] px-3 sm:px-6 pt-4 pb-24">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header: logo and actions on one row, the title on its own so it
            never has to squeeze past the buttons on a phone. */}
        <header className="border-b border-[#C9A24B]/20 pb-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Logo.png" alt="Saathi Vyapar" className="h-10 w-auto object-contain" />
            </Link>
            <div className="flex items-center gap-2">
              <LanguageToggleButton />
              <Link
                href={`/dashboard${userId && paramUserId ? `?user_id=${userId}` : ''}`}
                className="px-3.5 py-2 bg-white hover:bg-[#EDE9DA] text-xs font-semibold rounded-full border border-[#0B1E33]/50 transition-colors whitespace-nowrap"
              >
                {t('yk_back')}
              </Link>
            </div>
          </div>
          <div>
            <h1 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold leading-tight">{t('yk_title')}</h1>
            {!loading && profile && (
              <p className="text-sm text-[#0B1E33]/60 mt-1">
                {t('yk_count').replace('{n}', String(eligibleCount)).replace('{total}', String(schemes.length))}
              </p>
            )}
          </div>
        </header>

        {loading && <p className="text-sm text-[#0B1E33]/60 py-10 text-center">{t('yk_loading')}</p>}

        {!loading && loadError === 'login' && (
          <div className="bg-white border border-[#C9A24B]/20 rounded-3xl p-6 text-center space-y-3">
            <p className="text-sm">{t('yk_need_login')}</p>
            <Link href="/login" className="inline-block px-5 py-2.5 bg-[#0B1E33] text-[#F5F1E6] text-sm font-bold rounded-full">
              {t('nav_login')}
            </Link>
          </div>
        )}

        {!loading && !loadError && !profile && (
          <div className="bg-white border border-[#C9A24B]/20 rounded-3xl p-6 text-center space-y-3">
            <p className="text-sm">{t('yk_no_profile')}</p>
            <Link href="/onboarding" className="inline-block px-5 py-2.5 bg-[#C9A24B] text-white text-sm font-bold rounded-full">
              {t('yk_start_onboarding')}
            </Link>
          </div>
        )}

        {!loading && profile && (
          <>
            {/* Based on your details */}
            <section className="bg-white border border-[#C9A24B]/20 rounded-3xl p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold">{t('yk_based_on')}</h2>
                  {!editing && (
                    <p className="text-sm text-[#0B1E33]/70 mt-1 leading-relaxed">
                      {[
                        sectorLabel(profile.sector, lang),
                        `${inr(Number(profile.monthly_revenue_est) || 0)}${t('per_month_short')} ${t('yk_sales')}`,
                        `${inr(Number(profile.monthly_expense_est) || 0)}${t('per_month_short')} ${t('yk_costs')}`,
                        profile.existing_loans ? t('yk_loan_yes') : t('yk_loan_no'),
                        profile.district || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                {!editing && (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="cursor-pointer shrink-0 px-3.5 py-2 text-xs font-semibold rounded-full border border-[#0B1E33]/50 bg-white hover:bg-[#EDE9DA] transition-colors"
                  >
                    {t('yk_change')}
                  </button>
                )}
              </div>
              {saveMsg && !editing && <p className="text-xs text-emerald-700 mt-2">{saveMsg}</p>}

              {editing && draft && (
                <form
                  className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit();
                  }}
                >
                  <Field label={t('onboarding_sector_field')}>
                    <select
                      value={draft.sector ?? 'general'}
                      onChange={(e) => setDraft({ ...draft, sector: e.target.value })}
                      className={inputCls}
                    >
                      {SECTORS.map((s) => (
                        <option key={s} value={s}>
                          {sectorLabel(s, lang)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('onboarding_location_field')}>
                    <input
                      type="text"
                      value={draft.district ?? ''}
                      onChange={(e) => setDraft({ ...draft, district: e.target.value })}
                      className={inputCls}
                    />
                  </Field>
                  <Field label={t('onboarding_revenue_field')}>
                    <Money value={draft.monthly_revenue_est} onChange={(v) => setDraft({ ...draft, monthly_revenue_est: v })} />
                  </Field>
                  <Field label={t('onboarding_expense_field')}>
                    <Money value={draft.monthly_expense_est} onChange={(v) => setDraft({ ...draft, monthly_expense_est: v })} />
                  </Field>
                  <Field label={t('onboarding_loan_field')}>
                    <div className="grid grid-cols-2 gap-2">
                      <Toggle active={Boolean(draft.existing_loans)} onClick={() => setDraft({ ...draft, existing_loans: true })}>
                        {t('onboarding_yes_loans')}
                      </Toggle>
                      <Toggle active={!draft.existing_loans} onClick={() => setDraft({ ...draft, existing_loans: false })}>
                        {t('onboarding_no_loans')}
                      </Toggle>
                    </div>
                  </Field>
                  {draft.existing_loans && (
                    <>
                      <Field label={t('onboarding_loan_amount_label')}>
                        <Money value={draft.loan_amount} onChange={(v) => setDraft({ ...draft, loan_amount: v })} />
                      </Field>
                      <Field label={t('onboarding_loan_emi_label')}>
                        <Money value={draft.loan_monthly_payment} onChange={(v) => setDraft({ ...draft, loan_monthly_payment: v })} />
                      </Field>
                      <Field label={t('onboarding_loan_rate_label')}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={draft.loan_interest_rate ?? ''}
                          onChange={(e) => setDraft({ ...draft, loan_interest_rate: parseFloat(e.target.value) || null })}
                          className={inputCls}
                        />
                      </Field>
                    </>
                  )}
                  <Field label={t('yk_category')}>
                    <select
                      value={draft.category ?? 'general'}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                      className={inputCls}
                    >
                      {(['general', 'obc', 'sc', 'st', 'minority'] as const).map((c) => (
                        <option key={c} value={c}>
                          {t(`cat_${c}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('yk_gender')}>
                    <select
                      value={draft.gender ?? 'other'}
                      onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
                      className={inputCls}
                    >
                      {(['female', 'male', 'other'] as const).map((g) => (
                        <option key={g} value={g}>
                          {t(`gender_${g}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('yk_shg')}>
                    <div className="grid grid-cols-2 gap-2">
                      <Toggle active={Boolean(draft.is_shg_member)} onClick={() => setDraft({ ...draft, is_shg_member: true })}>
                        {t('common_yes')}
                      </Toggle>
                      <Toggle active={!draft.is_shg_member} onClick={() => setDraft({ ...draft, is_shg_member: false })}>
                        {t('common_no')}
                      </Toggle>
                    </div>
                  </Field>

                  <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={saving}
                      className="cursor-pointer px-5 py-2.5 bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] text-sm font-bold rounded-full disabled:opacity-50"
                    >
                      {saving ? t('yk_saving') : t('yk_save')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="cursor-pointer px-4 py-2.5 text-sm font-semibold rounded-full border border-[#C9A24B]/30 bg-white"
                    >
                      {t('common_cancel')}
                    </button>
                    {saveMsg && <span className="text-xs text-rose-700">{saveMsg}</span>}
                  </div>
                </form>
              )}
            </section>

            {/* Filter / sort / search */}
            <section className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 [scrollbar-width:none]">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={`cursor-pointer shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors ${
                      filter === f.id
                        ? 'bg-[#0B1E33] text-[#F5F1E6] border-[#0B1E33]'
                        : 'bg-white text-[#0B1E33] border-[#0B1E33]/50 hover:bg-[#EDE9DA]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('yk_search_ph')}
                  className={`${inputCls} flex-1`}
                />
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={`${inputCls} sm:w-56`}>
                  <option value="best">{t('yk_sort_best')}</option>
                  <option value="name">{t('yk_sort_name')}</option>
                  <option value="amount">{t('yk_sort_amount')}</option>
                </select>
              </div>

              {/* Papers I have — a multi-select dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPapersOpen((o) => !o)}
                  aria-expanded={papersOpen}
                  className={`${inputCls} cursor-pointer text-left flex items-center justify-between`}
                >
                  <span className={have.size ? 'font-semibold' : 'text-[#0B1E33]/60'}>
                    {have.size === 0
                      ? t('yk_papers_have')
                      : `${t('yk_papers_have')} ${Array.from(have).map((x) => t(`paper_${x}`)).join(', ')}`}
                  </span>
                  <span className="text-[#0B1E33]/50 ml-2">{papersOpen ? '▴' : '▾'}</span>
                </button>
                {papersOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-white border-[1.5px] border-[#0B1E33]/60 rounded-2xl shadow-[0_12px_32px_rgba(11,30,51,0.12)] p-2">
                    {PAPERS.map((paper) => (
                      <label key={paper} className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-[#F5F1E6] cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={have.has(paper)}
                          onChange={() =>
                            setHave((prev) => {
                              const next = new Set(prev);
                              if (next.has(paper)) next.delete(paper);
                              else next.add(paper);
                              return next;
                            })
                          }
                          className="h-4 w-4 accent-[#C9A24B]"
                        />
                        {t(`paper_${paper}`)}
                      </label>
                    ))}
                    <div className="flex justify-between items-center px-2.5 pt-2 border-t border-[#C9A24B]/15 mt-1">
                      <button type="button" onClick={() => setHave(new Set())} className="cursor-pointer text-xs text-[#0B1E33]/60 hover:underline">
                        {t('yk_papers_clear')}
                      </button>
                      <button type="button" onClick={() => setPapersOpen(false)} className="cursor-pointer text-xs font-bold px-3 py-1.5 rounded-full bg-[#0B1E33] text-[#F5F1E6]">
                        {t('yk_papers_done')}
                      </button>
                    </div>
                  </div>
                )}
                {have.size > 0 && <p className="text-[11px] text-[#0B1E33]/50 mt-1">{t('yk_papers_hint')}</p>}
              </div>
            </section>

            {/* Cards */}
            <section className="space-y-3">
              <p className="text-xs text-[#0B1E33]/50">{t('yk_showing').replace('{n}', String(shown.length))}</p>
              {shown.length === 0 && (
                <div className="bg-white border border-[#C9A24B]/20 rounded-3xl p-6 text-center text-sm text-[#0B1E33]/60">
                  {t('yk_none')}
                </div>
              )}
              {shown.map((r) => {
                const s = r.scheme as SchemeRow;
                const isOpen = open === s.id;
                const docs = (s.required_documents ?? []).map((d) => docLabel(d, lang));
                const passes = r.reasons.filter(reasonPassed);
                const fails = r.reasons.filter((x) => !reasonPassed(x));
                return (
                  <article
                    key={s.id}
                    className={`bg-white border rounded-3xl p-4 sm:p-5 ${r.eligible ? 'border-[#C9A24B]/20' : 'border-[#0B1E33]/10'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0B1E33]/45">
                          {t(`yk_kind_${kindOf(s)}`)}
                        </span>
                        <h3 className="text-base sm:text-lg font-bold leading-snug mt-0.5">{displayName(s, lang)}</h3>
                        <p className="text-sm text-[#0B1E33]/75 mt-1">{displayBenefit(s, lang)}</p>
                      </div>
                      {r.eligible && s.application_link && (
                        <a
                          href={s.application_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 px-4 py-2 bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] text-xs font-semibold rounded-full"
                        >
                          {t('dashboard_apply')}
                        </a>
                      )}
                    </div>

                    {/* Why */}
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-bold">{r.eligible ? t('yk_why_yes') : t('yk_why_no')}</p>
                      {(r.eligible ? passes : fails).slice(0, 3).map((x, i) => (
                        <p key={i} className={`text-sm ${r.eligible ? 'text-[#0B1E33]/75' : 'text-amber-900'}`}>
                          <span className={r.eligible ? 'text-emerald-700' : 'text-amber-600'}>{r.eligible ? '✓' : '✗'}</span>{' '}
                          {localizeReason(x, lang)}
                        </p>
                      ))}
                    </div>

                    {/* Papers + more */}
                    {r.eligible && (
                      <div className="mt-3 border-t border-[#C9A24B]/15 pt-3">
                        <button
                          type="button"
                          onClick={() => setOpen(isOpen ? null : s.id)}
                          className="cursor-pointer text-sm font-semibold text-[#0B1E33] hover:underline"
                        >
                          {isOpen ? t('yk_hide_papers') : t('yk_show_papers').replace('{n}', String(docs.length))}
                        </button>
                        {isOpen && (
                          <div className="mt-2 space-y-2">
                            {docs.length === 0 && <p className="text-sm text-[#0B1E33]/60">{t('yk_no_papers')}</p>}
                            {docs.map((d, i) => {
                              const key = `${s.id}:${i}`;
                              return (
                                <label key={key} className="flex items-center gap-2.5 text-sm cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(ticked[key])}
                                    onChange={() => setTicked((prev) => ({ ...prev, [key]: !prev[key] }))}
                                    className="h-4 w-4 accent-[#C9A24B]"
                                  />
                                  <span className={ticked[key] ? 'line-through text-[#0B1E33]/50' : ''}>{d}</span>
                                </label>
                              );
                            })}
                            {s.sponsoring_body && (
                              <p className="text-xs text-[#0B1E33]/50 pt-1">
                                {t('yk_run_by')} {s.sponsoring_body.replace(/^🏛️\s*/, '')}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

const inputCls =
  'w-full bg-white text-[#0B1E33] px-3.5 py-2.5 border-[1.5px] border-[#0B1E33]/60 rounded-2xl text-sm focus:outline-none focus:border-[#0B1E33]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold mb-1">{label}</span>
      {children}
    </label>
  );
}

function Money({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-2.5 text-sm font-bold">₹</span>
      <input
        type="number"
        min="0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
        className={`${inputCls} pl-8`}
      />
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer px-3 py-2.5 rounded-2xl text-sm font-semibold border transition-colors ${
        active ? 'bg-[#0B1E33] text-[#F5F1E6] border-[#0B1E33]' : 'bg-white border-[#0B1E33]/50 hover:bg-[#EDE9DA]'
      }`}
    >
      {children}
    </button>
  );
}

export default function YojanaKendraPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F1E6] flex items-center justify-center">
          <span className="text-3xl animate-spin block">🏛️</span>
        </div>
      }
    >
      <YojanaKendraContent />
    </Suspense>
  );
}
