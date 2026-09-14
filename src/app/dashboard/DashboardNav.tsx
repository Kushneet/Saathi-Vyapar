'use client';

/**
 * src/app/dashboard/DashboardNav.tsx
 *
 * Section navigation for the dashboard: a thin rail beside the content on
 * wide screens, a bar along the bottom on phones. Plain links to the
 * section ids; the current section is underlined as the page scrolls.
 * Nothing here is a card or a widget — it is the kind of side navigation
 * an ordinary website has, and it stays out of the content's way.
 */

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const SECTIONS = ['add', 'overview', 'trend', 'entries', 'schemes'] as const;
type SectionId = (typeof SECTIONS)[number];

export default function DashboardNav() {
  const { t } = useLanguage();
  const [active, setActive] = useState<SectionId>('add');

  useEffect(() => {
    // Whichever section occupies the upper part of the viewport is current.
    // At the very bottom the last section may never reach the top band, so
    // it is marked current explicitly there.
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 8) setActive('schemes');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    const observer = new IntersectionObserver(
      (entries) => {
        if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 8) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id as SectionId);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 }
    );
    SECTIONS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  function go(id: SectionId) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
  }

  const labels: Record<SectionId, string> = {
    add: t('nav_add'),
    overview: t('nav_overview'),
    trend: t('nav_trend'),
    entries: t('nav_entries'),
    schemes: t('nav_schemes'),
  };

  return (
    <>
      {/* Wide screens: a rail to the left of the content column */}
      <nav
        aria-label={t('nav_sections')}
        className="hidden xl:block fixed left-6 top-1/2 -translate-y-1/2 z-20"
      >
        <ul className="space-y-1 border-l border-[#0B1E33]/15">
          {SECTIONS.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={active === id ? 'true' : undefined}
                className={`cursor-pointer -ml-px block pl-4 pr-3 py-1.5 text-sm border-l-2 transition-colors ${
                  active === id
                    ? 'border-[#0B1E33] text-[#0B1E33] font-semibold'
                    : 'border-transparent text-[#0B1E33]/55 hover:text-[#0B1E33]'
                }`}
              >
                {labels[id]}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Phones and tablets: a bar along the bottom, above the chat launcher */}
      <nav
        aria-label={t('nav_sections')}
        className="xl:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-[#0B1E33]/10"
      >
        <ul className="grid grid-cols-5">
          {SECTIONS.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={active === id ? 'true' : undefined}
                className={`cursor-pointer w-full py-2.5 text-[11px] leading-tight font-semibold border-t-2 transition-colors ${
                  active === id ? 'border-[#0B1E33] text-[#0B1E33]' : 'border-transparent text-[#0B1E33]/55'
                }`}
              >
                {labels[id]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
