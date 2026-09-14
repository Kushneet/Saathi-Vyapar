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
import Reveal from '@/components/Reveal';

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

  // A Hindi reader's notebook has Devanagari numerals, so the sample page
  // and its totals are shown that way in Hindi mode.
  const digits = (text: string) =>
    language === 'hi' ? text.replace(/[0-9]/g, (d) => '०१२३४५६७८९'[Number(d)]) : text;
  const rupees = (n: number) => digits(`₹${n.toLocaleString('en-IN')}`);

  const helps = [
    { q: t('hp_q1'), a: t('hp_a1') },
    { q: t('hp_q2'), a: t('hp_a2') },
    { q: t('hp_q3'), a: t('hp_a3') },
    { q: t('hp_q4'), a: t('hp_a4') },
  ];

  const strip = [
    { title: t('hp_strip1_title'), sub: t('hp_strip1_sub') },
    { title: t('hp_strip2_title'), sub: t('hp_strip2_sub') },
    { title: t('hp_strip3_title'), sub: t('hp_strip3_sub') },
    { title: t('hp_strip4_title'), sub: t('hp_strip4_sub') },
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
    <div className="min-h-screen bg-[#FAF7EF] text-[#1B4332] font-['Open_Sans',sans-serif]">
      {/* ── Navigation ─────────────────────────────────────────────── */}
      {/* A light pill that floats over the page. The dark full-width bar made
          the first thing on screen a slab of navy. */}
      <header className="sticky top-0 z-40 px-3 sm:px-6 pt-3 sm:pt-5">
        <nav className="max-w-6xl mx-auto bg-white/90 backdrop-blur rounded-full shadow-[0_2px_20px_rgba(20,60,40,0.07)] border border-[#1B4332]/8 h-14 sm:h-16 flex items-center justify-between gap-3 pl-3 pr-3 sm:pl-5 sm:pr-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/Logo.png" alt="" className="h-8 w-auto object-contain" />
            <span className="font-['Roboto',sans-serif] font-bold text-[#1B4332] text-[15px] hidden xs:inline sm:inline">
              {t('brand_name')}
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-7 text-[15px] text-[#1B4332]/75">
            <a href="#help" className="hover:text-[#1B4332] transition-colors">{t('hp_nav_help')}</a>
            <a href="#how" className="hover:text-[#1B4332] transition-colors">{t('hp_nav_how')}</a>
            <a href="#schemes" className="hover:text-[#1B4332] transition-colors">{t('hp_nav_schemes')}</a>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <LanguageToggleButton className="!border-[#1B4332]/15 !bg-transparent !text-[#1B4332]" />
            <Link href="/login" className="hidden sm:inline text-[15px] text-[#1B4332]/75 hover:text-[#1B4332] px-2 transition-colors">
              {t('hp_login')}
            </Link>
            <Link
              href="/onboarding"
              className="bg-[#C9A227] hover:bg-[#B8912A] text-white font-bold text-sm px-4 sm:px-5 py-2.5 rounded-full transition-colors whitespace-nowrap"
            >
              {t('hp_try')}
            </Link>
          </div>
        </nav>
      </header>

      <main>
        {/* ── Hero: words left, the worked example right ─────────────── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-12 sm:pt-16 sm:pb-14">
          <div className="grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
            <Reveal>
              <p className="text-[13px] font-semibold tracking-[0.12em] uppercase text-[#3F6B52]">
                {t('hp_eyebrow')}
              </p>

              <h1 className="mt-4 font-['Roboto',sans-serif] text-[2.5rem] sm:text-[3.4rem] font-bold text-[#1B4332] leading-[1.1] tracking-tight">
                {t('hp_hero_title_a')}
                <br />
                {t('hp_hero_title_b')}
              </h1>

              <p className="mt-5 text-[17px] leading-relaxed text-[#1B4332]/70 max-w-xl">
                {t('hp_hero_sub')}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
                <Link
                  href="/onboarding"
                  className="bg-[#C9A227] hover:bg-[#B08A1E] text-white font-bold text-[17px] px-8 py-4 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(201,162,39,0.30)]"
                >
                  {t('hp_hero_cta')} →
                </Link>
                <Link href="/login" className="font-semibold text-[#1B4332]/70 hover:text-[#1B4332] transition-colors">
                  {t('hp_hero_secondary')}
                </Link>
              </div>
            </Reveal>

            {/* The worked example. One soft disc behind it for depth — no
                handwriting, no drawn arrows: this goes in front of judges. */}
            <Reveal delay={2} className="relative">
              <span
                aria-hidden="true"
                className="hidden lg:block absolute -top-8 -right-4 w-[24rem] h-[24rem] rounded-full bg-[#BFCFB4]/45"
              />

              <div className="relative bg-white rounded-3xl shadow-[0_14px_44px_rgba(20,60,40,0.09)] border border-[#1B4332]/8 p-5 sm:p-6">
                <span className="inline-block text-[11px] font-semibold text-[#1B4332]/50 border border-[#1B4332]/12 rounded-full px-3 py-1">
                  {t('hp_demo_label')}
                </span>

                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto_1.1fr] sm:items-center">
                  <div className="bg-[#FBF8EF] border border-[#1B4332]/10 rounded-2xl p-4">
                    <p className="text-xs font-semibold text-[#1B4332]/55 mb-3">{t('hp_demo_book')}</p>
                    <ul className="space-y-2.5 font-mono text-[15px] text-[#1B4332]/85">
                      {exampleLines.map((line) => (
                        <li key={line.raw}>{digits(line.raw)}</li>
                      ))}
                    </ul>
                  </div>

                  <div aria-hidden="true" className="hidden sm:block text-xl text-[#C9A227]">→</div>

                  <div className="bg-[#F3F6F0] rounded-2xl p-4">
                    <p className="text-xs font-semibold text-[#1B4332]/55 mb-3">{t('hp_demo_result')}</p>
                    <ul className="space-y-2">
                      {exampleLines.map((line) => (
                        <li key={line.raw} className="flex items-center justify-between gap-3 text-sm">
                          <span className="text-[#1B4332]/75 truncate">{line.label}</span>
                          <span className={`font-bold shrink-0 ${line.kind === 'in' ? 'text-[#1B7F4B]' : 'text-[#C62828]'}`}>
                            {line.kind === 'in' ? '+' : '−'}{rupees(line.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>

                    <dl className="mt-4 pt-3 border-t border-[#1B4332]/10 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-[#1B4332]/60">{t('hp_demo_in')}</dt>
                        <dd className="font-semibold text-[#1B7F4B]">{rupees(moneyIn)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-[#1B4332]/60">{t('hp_demo_out')}</dt>
                        <dd className="font-semibold text-[#C62828]">{rupees(moneyOut)}</dd>
                      </div>
                      <div className="flex justify-between text-[15px]">
                        <dt className="font-bold text-[#1B4332]">{t('hp_demo_left')}</dt>
                        <dd className="font-bold text-[#1B4332]">{rupees(moneyIn - moneyOut)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-[#1B4332]/50">{t('hp_demo_note')}</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── What you can do, at a glance ───────────────────────────── */}
        <section className="bg-[#F3EFE2]/70 border-y border-[#1B4332]/8">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid gap-8 sm:gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {strip.map((item, i) => (
              <Reveal key={item.title} delay={((i % 4) + 1) as 1 | 2 | 3 | 4} className="transition-transform duration-300 hover:-translate-y-0.5">
                <h3 className="font-semibold text-[15px] leading-snug text-[#1B4332]">{item.title}</h3>
                <p className="text-[13px] text-[#1B4332]/55 mt-1.5">{item.sub}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── What can it help you with ─────────────────────────────── */}
        <section id="help" className="bg-white border-y border-[#1B4332]/8 scroll-mt-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
            <h2 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold text-[#1B4332]">{t('hp_help_title')}</h2>

            <div className="mt-8 max-w-3xl divide-y divide-[#1B4332]/10">
              {helps.map((item, i) => (
                <Reveal key={item.q} delay={((i % 4) + 1) as 1 | 2 | 3 | 4}>
                  <div className="py-5 first:pt-0">
                    <h3 className="font-bold text-[19px] leading-snug text-[#1B4332]">{item.q}</h3>
                    <p className="mt-2 text-[16px] leading-relaxed text-[#1B4332]/70">{item.a}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────── */}
        <section id="how" className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20 scroll-mt-16">
          <h2 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold text-[#1B4332]">{t('hp_how_title')}</h2>

          <ol className="mt-8 grid gap-8 sm:gap-10 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title}>
                <Reveal delay={((i % 4) + 1) as 1 | 2 | 3 | 4}>
                  <h3 className="font-bold text-[17px] text-[#1B4332]">
                    <span className="text-[#C9A227] mr-2">{i + 1}.</span>
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#1B4332]/70">{step.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Government schemes ───────────────────────────────────── */}
        <section id="schemes" className="bg-white border-y border-[#1B4332]/8 scroll-mt-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid gap-10 md:grid-cols-2 md:items-start">
            <div>
              <h2 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold text-[#1B4332]">{t('hp_schemes_title')}</h2>
              <p className="mt-4 text-[15px] sm:text-base leading-relaxed text-[#1B4332]/72">
                {t('hp_schemes_body')}
              </p>
            </div>

            <ul className="space-y-3">
              {schemePoints.map((point) => (
                <li key={point} className="flex gap-3 text-[15px] leading-relaxed">
                  <span aria-hidden="true" className="mt-2 h-1 w-1 rounded-full bg-[#C9A227] shrink-0" />
                  <span className="text-[#1B4332]/78">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Final call to action ─────────────────────────────────── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
          <h2 className="font-['Roboto',sans-serif] text-2xl sm:text-3xl font-bold text-[#1B4332]">{t('hp_final_title')}</h2>
          <p className="mt-3 text-[15px] sm:text-base text-[#1B4332]/70">{t('hp_final_body')}</p>

          <Link
            href="/onboarding"
            className="mt-7 inline-block bg-[#C9A227] hover:bg-[#B08A1E] text-white font-bold px-8 py-4 rounded-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(201,162,39,0.30)]"
          >
            {t('hp_hero_cta')} →
          </Link>

          <p className="mt-6 text-xs text-[#1B4332]/55">{t('hp_privacy')}</p>
        </section>
      </main>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="bg-[#1B4332] text-white/75">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <p className="font-['Roboto',sans-serif] font-bold text-white">{t('brand_name')}</p>
            <p className="text-sm mt-1 max-w-sm">{t('hp_footer_tagline')}</p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/onboarding" className="hover:text-[#E8C766] transition-colors">{t('hp_try')}</Link>
            <Link href="/login" className="hover:text-[#E8C766] transition-colors">{t('hp_login')}</Link>
            <Link href="/dashboard/schemes" className="hover:text-[#E8C766] transition-colors">{t('hp_nav_schemes')}</Link>
          </div>
        </div>
      </footer>

      {/* Offered here too. Someone deciding whether to sign up can ask what
          this does before committing to a form. */}
    </div>
  );
}
