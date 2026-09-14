'use client';

/**
 * src/app/page.tsx
 *
 * Homepage.
 *
 * Rewritten for the person the product is for: someone running a small shop
 * who may be opening a website for the first time. The previous page had
 * twelve sections, competition metadata in the hero, a 580px dark panel
 * showing a fabricated "live deployment", four persona tabs that only moved a
 * border, and section headings like "Core Advisory Architecture". None of that
 * tells a shopkeeper what they can do here.
 *
 * What replaced it:
 *   - one plain headline and one plain paragraph
 *   - a worked example of the actual product moment: a notebook page and the
 *     entries it becomes, marked as an example rather than dressed up as live
 *     data
 *   - capabilities written as the questions a shop owner would ask
 *   - three steps, in order
 *   - schemes, explained without naming a single internal component
 *
 * Dark navy is now used for the nav bar and primary buttons only; the page
 * itself stays on the warm cream ground.
 *
 * The primary call to action points at /onboarding, which is where the
 * assistant experience begins — so when the chat panel lands it can take over
 * this button without the page changing shape.
 */

import Link from 'next/link';
import LanguageToggleButton from '@/components/LanguageToggleButton';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * The worked example, labelled as an example on the page.
 *
 * Written in the reader's own script: a Hindi reader is shown a notebook page
 * in Devanagari, because that is what their notebook looks like. These are the
 * same four lines the parser handles, so the totals shown are the totals the
 * product would actually produce.
 */
const EXAMPLE_LINES = {
  en: [
    { raw: 'Bikri 2400', label: 'Bikri', amount: 2400, kind: 'in' as const },
    { raw: 'Sabzi bikri 1850', label: 'Sabzi bikri', amount: 1850, kind: 'in' as const },
    { raw: 'Maal kharid 1200', label: 'Maal kharid', amount: 1200, kind: 'out' as const },
    { raw: 'Bijli bill 340', label: 'Bijli bill', amount: 340, kind: 'out' as const },
  ],
  hi: [
    { raw: 'बिक्री 2400', label: 'बिक्री', amount: 2400, kind: 'in' as const },
    { raw: 'सब्ज़ी बिक्री 1850', label: 'सब्ज़ी बिक्री', amount: 1850, kind: 'in' as const },
    { raw: 'माल खरीद 1200', label: 'माल खरीद', amount: 1200, kind: 'out' as const },
    { raw: 'बिजली बिल 340', label: 'बिजली बिल', amount: 340, kind: 'out' as const },
  ],
};

export default function HomePage() {
  const { t, language } = useLanguage();

  const exampleLines = EXAMPLE_LINES[language];

  const moneyIn = exampleLines.filter((l) => l.kind === 'in').reduce((s, l) => s + l.amount, 0);
  const moneyOut = exampleLines.filter((l) => l.kind === 'out').reduce((s, l) => s + l.amount, 0);

  const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  const helps = [
    { q: t('hp_q1'), a: t('hp_a1'), icon: '₹' },
    { q: t('hp_q2'), a: t('hp_a2'), icon: '📷' },
    { q: t('hp_q3'), a: t('hp_a3'), icon: '🏛️' },
    { q: t('hp_q4'), a: t('hp_a4'), icon: '🎙️' },
  ];

  const steps = [
    { title: t('hp_how_1_title'), body: t('hp_how_1_body') },
    { title: t('hp_how_2_title'), body: t('hp_how_2_body') },
    { title: t('hp_how_3_title'), body: t('hp_how_3_body') },
  ];

  const schemePoints = [
    t('hp_schemes_point1'),
    t('hp_schemes_point2'),
    t('hp_schemes_point3'),
    t('hp_schemes_point4'),
  ];

  return (
    <div className="min-h-screen bg-[#F5F1E6] text-[#0B1E33] font-['Open_Sans',sans-serif]">
      {/* ── Navigation ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-[#0B1E33] text-[#F5F1E6]">
        <nav className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          {/* The logo is dark on a dark bar, so it sits on a light chip rather
              than disappearing into the navy. */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="bg-[#F5F1E6] rounded-xl px-2 py-1.5 flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/Logo.png" alt="Saathi Vyapar" className="h-7 w-auto object-contain" />
            </span>
            <span className="hidden sm:inline font-['Roboto',sans-serif] font-bold text-[#F5F1E6]">
              {t('brand_name')}
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-sm">
            <a href="#help" className="hover:text-[#C9A24B] transition-colors">{t('hp_nav_help')}</a>
            <a href="#how" className="hover:text-[#C9A24B] transition-colors">{t('hp_nav_how')}</a>
            <a href="#schemes" className="hover:text-[#C9A24B] transition-colors">{t('hp_nav_schemes')}</a>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <LanguageToggleButton className="!border-[#F5F1E6]/30 !bg-[#F5F1E6]/10 !text-[#F5F1E6]" />
            <Link href="/login" className="hidden sm:inline text-sm px-3 py-2 hover:text-[#C9A24B] transition-colors">
              {t('hp_login')}
            </Link>
            <Link
              href="/onboarding"
              className="bg-[#C9A24B] hover:bg-[#B8912A] text-[#0B1E33] font-bold text-sm px-4 py-2.5 rounded-full transition-colors"
            >
              {t('hp_try')}
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-14 pb-12 sm:pt-20 sm:pb-16">
          <div className="max-w-3xl">
            <h1 className="font-['Roboto',sans-serif] text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.15] tracking-tight">
              {t('hp_hero_title')}
            </h1>
            <p className="mt-5 text-base sm:text-lg leading-relaxed text-[#0B1E33]/75 max-w-2xl">
              {t('hp_hero_sub')}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/onboarding"
                className="bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] font-bold px-7 py-4 rounded-full transition-colors"
              >
                {t('hp_hero_cta')} →
              </Link>
              <Link
                href="/login"
                className="px-5 py-4 font-semibold text-[#0B1E33]/75 hover:text-[#0B1E33] transition-colors"
              >
                {t('hp_hero_secondary')}
              </Link>
            </div>
          </div>
        </section>

        {/* ── Worked example: notebook page → entries ───────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
          <div className="bg-white border border-[#C9A24B]/25 rounded-3xl p-5 sm:p-8">
            <span className="inline-block text-[11px] font-bold tracking-wide text-[#0B1E33]/45 border border-[#0B1E33]/15 rounded-full px-2.5 py-1">
              {t('hp_demo_label')}
            </span>

            <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              {/* Left: the notebook as written */}
              <div className="bg-[#FDFAF2] border border-[#C9A24B]/25 rounded-2xl p-4">
                <p className="text-xs font-bold text-[#0B1E33]/50 mb-3">{t('hp_demo_book')}</p>
                <ul className="space-y-2 font-mono text-[15px] text-[#0B1E33]/85">
                  {exampleLines.map((line) => (
                    <li key={line.raw} className="border-b border-dashed border-[#C9A24B]/30 pb-1.5">
                      {line.raw}
                    </li>
                  ))}
                </ul>
              </div>

              <div aria-hidden="true" className="hidden sm:block text-2xl text-[#C9A24B]">→</div>

              {/* Right: what it becomes */}
              <div className="bg-[#FDFAF2] border border-[#C9A24B]/25 rounded-2xl p-4">
                <p className="text-xs font-bold text-[#0B1E33]/50 mb-3">{t('hp_demo_result')}</p>
                <ul className="space-y-2">
                  {exampleLines.map((line) => (
                    <li key={line.raw} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-[#0B1E33]/70 truncate">{line.label}</span>
                      <span
                        className={`font-bold shrink-0 ${
                          line.kind === 'in' ? 'text-emerald-700' : 'text-[#B8912A]'
                        }`}
                      >
                        {line.kind === 'in' ? '+' : '−'}{rupees(line.amount)}
                      </span>
                    </li>
                  ))}
                </ul>

                <dl className="mt-4 pt-3 border-t border-[#C9A24B]/25 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-[#0B1E33]/60">{t('hp_demo_in')}</dt>
                    <dd className="font-semibold text-emerald-700">{rupees(moneyIn)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#0B1E33]/60">{t('hp_demo_out')}</dt>
                    <dd className="font-semibold text-[#B8912A]">{rupees(moneyOut)}</dd>
                  </div>
                  <div className="flex justify-between text-base">
                    <dt className="font-bold">{t('hp_demo_left')}</dt>
                    <dd className="font-bold">{rupees(moneyIn - moneyOut)}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <p className="mt-5 text-xs text-[#0B1E33]/50 leading-relaxed max-w-2xl">{t('hp_demo_note')}</p>
          </div>
        </section>

        {/* ── What can it help you with ─────────────────────────────── */}
        <section id="help" className="bg-white border-y border-[#C9A24B]/20 scroll-mt-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <h2 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold">{t('hp_help_title')}</h2>

            <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {helps.map((item) => (
                <div key={item.q} className="flex gap-4">
                  <span aria-hidden="true" className="text-xl shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <h3 className="font-bold text-[17px] leading-snug">{item.q}</h3>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[#0B1E33]/70">{item.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────── */}
        <section id="how" className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20 scroll-mt-16">
          <h2 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold">{t('hp_how_title')}</h2>

          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-4 sm:flex-col sm:gap-3">
                <span className="shrink-0 h-9 w-9 rounded-full bg-[#0B1E33] text-[#F5F1E6] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-bold text-[17px]">{step.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-[#0B1E33]/70">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Government schemes ───────────────────────────────────── */}
        <section id="schemes" className="bg-white border-y border-[#C9A24B]/20 scroll-mt-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid gap-10 md:grid-cols-2 md:items-start">
            <div>
              <h2 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold">{t('hp_schemes_title')}</h2>
              <p className="mt-4 text-[15px] sm:text-base leading-relaxed text-[#0B1E33]/75">
                {t('hp_schemes_body')}
              </p>
            </div>

            <ul className="space-y-3">
              {schemePoints.map((point) => (
                <li key={point} className="flex gap-3 text-[15px] leading-relaxed">
                  <span aria-hidden="true" className="text-emerald-700 font-bold shrink-0">✓</span>
                  <span className="text-[#0B1E33]/80">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Final call to action ─────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h2 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold">{t('hp_final_title')}</h2>
          <p className="mt-3 text-[15px] sm:text-base text-[#0B1E33]/70">{t('hp_final_body')}</p>

          <Link
            href="/onboarding"
            className="mt-7 inline-block bg-[#0B1E33] hover:bg-[#162D59] text-[#F5F1E6] font-bold px-8 py-4 rounded-full transition-colors"
          >
            {t('hp_hero_cta')} →
          </Link>

          <p className="mt-6 text-xs text-[#0B1E33]/50">🔒 {t('hp_privacy')}</p>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="bg-[#0B1E33] text-[#F5F1E6]/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <p className="font-['Roboto',sans-serif] font-bold text-[#F5F1E6]">{t('brand_name')}</p>
            <p className="text-sm mt-1 max-w-sm">{t('hp_footer_tagline')}</p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/onboarding" className="hover:text-[#C9A24B] transition-colors">{t('hp_try')}</Link>
            <Link href="/login" className="hover:text-[#C9A24B] transition-colors">{t('hp_login')}</Link>
            <Link href="/dashboard/schemes" className="hover:text-[#C9A24B] transition-colors">{t('hp_nav_schemes')}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
