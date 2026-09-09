"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import parse, { DOMNode, Element, domToReact } from "html-react-parser";
import { useLanguage } from '@/contexts/LanguageContext';
import { STITCH_PANELS, STITCH_PROJECT } from "@/lib/stitchPanelsData";
import PlatesGallery from "./PlatesGallery";

export default function StitchFolio() {
  const { t } = useLanguage();
  const [activePanel, setActivePanel] = useState<string>("01-hero");
  const [viewMode, setViewMode] = useState<"interactive" | "plates">("interactive");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Smooth scroll handler
  const scrollTo = (panelId: string) => {
    setViewMode("interactive");
    setMobileMenuOpen(false);
    const elem = document.getElementById(panelId);
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth", block: "start" });
      setActivePanel(panelId);
    }
  };

  // Track active section via IntersectionObserver
  useEffect(() => {
    if (viewMode !== "interactive") return;

    const handleScroll = () => {
      setScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActivePanel(entry.target.id);
          }
        }
      },
      {
        rootMargin: "-20% 0px -60% 0px",
        threshold: 0.1,
      }
    );

    STITCH_PANELS.forEach((p) => {
      const el = document.getElementById(p.id);
      if (el) observer.observe(el);
    });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      observer.disconnect();
    };
  }, [viewMode]);

  // Current active panel index (1-based)
  const currentIdx = STITCH_PANELS.findIndex((p) => p.id === activePanel);
  const currentNum = currentIdx >= 0 ? currentIdx + 1 : 1;
  const nextPanel = STITCH_PANELS[(currentIdx + 1) % STITCH_PANELS.length];

  // Parser transform options
  const parserOptions = {
    replace: (domNode: DOMNode) => {
      if (domNode instanceof Element && domNode.tagName === "a") {
        const href = domNode.attribs?.href;
        if (href === "#channels" || href === "#access" || href === "/login") {
          return (
            <Link
              href="/login"
              className={domNode.attribs?.class || ""}
            >
              {domToReact(domNode.children as DOMNode[])}
            </Link>
          );
        }
        if (href && href.startsWith("#")) {
          const targetId = href.replace("#", "");
          return (
            <a
              href={href}
              className={domNode.attribs?.class || ""}
              onClick={(e) => {
                e.preventDefault();
                scrollTo(targetId);
              }}
            >
              {domToReact(domNode.children as DOMNode[])}
            </a>
          );
        }
      }
      return undefined;
    },
  };

  return (
    <div className="w-full min-h-screen bg-surface text-on-surface flex flex-col selection:bg-primary selection:text-on-primary font-serif">
      {/* Sticky Institutional Folio Header */}
      <header
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
          scrolled
            ? "bg-surface-container-lowest/95 backdrop-blur-md shadow-2xl border-b border-surface-container-highest/60"
            : "bg-surface-container-lowest/85 backdrop-blur-sm border-b border-surface-container-highest/30"
        }`}
      >
        <div className="h-20 max-w-[1440px] mx-auto px-4 md:px-6 lg:px-10 flex items-center justify-between gap-3">
          {/* Brand Wordmark & Classical Pantheon SVG Emblem */}
          <div
            onClick={() => scrollTo("01-hero")}
            className="flex items-center shrink-0 cursor-pointer group"
          >
            <img src="/Logo.png" alt="Saathi Vyapar Logo" className="h-10 w-auto object-contain group-hover:scale-105 transition-transform" />
          </div>

          {/* Center Navigation: 9 Folio Panels (Visible on Large/Medium Viewports) */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto py-1 text-[11px] font-mono tracking-wider uppercase max-w-2xl scrollbar-none">
            {STITCH_PANELS.map((p) => {
              const isActive = viewMode === "interactive" && activePanel === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => scrollTo(p.id)}
                  className={`px-2 py-1 rounded transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-primary text-on-primary font-semibold shadow-sm"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {t(`folio_p${p.num}_title`)}
                </button>
              );
            })}
          </nav>

          {/* Right Controls: View Switcher & Gateway Button */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-surface-container p-0.5 rounded-lg border border-surface-container-highest">
              <button
                type="button"
                onClick={() => setViewMode("interactive")}
                className={`px-2.5 py-1 rounded text-xs font-mono tracking-wider transition-colors flex items-center gap-1.5 ${
                  viewMode === "interactive"
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-outline hover:text-on-surface"
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="3" y1="9" x2="21" y2="9" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                </svg>
                <span>{t('folio_canvas')}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("plates")}
                className={`px-2.5 py-1 rounded text-xs font-mono tracking-wider transition-colors flex items-center gap-1.5 ${
                  viewMode === "plates"
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-outline hover:text-on-surface"
                }`}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="16" height="16" rx="2" />
                  <path d="M6 18v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
                </svg>
                <span>{t('folio_plates')}</span>
              </button>
            </div>

            {/* Launch App / Login Gateway */}
            <Link
              href="/login"
              className="px-3.5 py-1.5 bg-primary hover:bg-primary-fixed text-on-primary text-xs font-mono font-semibold tracking-wider uppercase rounded shadow hover:shadow-primary/20 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span className="hidden sm:inline">{t('folio_gateway')}</span>
              <span className="sm:hidden">{t('folio_signin')}</span>
            </Link>

            {/* Mobile / Compact Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              className="lg:hidden p-2 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface border border-surface-container-highest flex items-center justify-center"
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-surface-container-lowest/98 border-b border-surface-container-highest px-4 py-4 space-y-2 shadow-2xl">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs font-mono">
              {STITCH_PANELS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => scrollTo(p.id)}
                  className={`p-2 rounded text-left truncate transition-colors ${
                    activePanel === p.id
                      ? "bg-primary text-on-primary font-semibold"
                      : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
                  }`}
                >
                  {t(`folio_p${p.num}_title`)}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="w-full pt-20">
        {viewMode === "plates" ? (
          <PlatesGallery onSelectPanel={scrollTo} />
        ) : (
          <div className="flex flex-col w-full">
            {STITCH_PANELS.map((panel) => (
              <section
                key={panel.id}
                id={panel.id}
                className="w-full relative scroll-mt-20 border-b border-surface-container-highest/30 overflow-hidden"
              >
                {/* Panel Anchor Identifier Bar */}
                <div className="w-full max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12 pt-6 pb-2 flex items-center justify-between text-[11px] font-mono text-outline">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-primary/60" />
                    <span className="text-primary font-semibold uppercase">
                      FOLIO SPECIMEN {panel.num < 10 ? `0${panel.num}` : panel.num} / 09
                    </span>
                    <span className="hidden sm:inline text-outline-variant">•</span>
                    <span className="hidden sm:inline text-on-surface-variant">
                      {t(`folio_p${panel.num}_full`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={panel.image}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <span>{t('folio_screenshot')}</span>
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  </div>
                </div>

                {/* Rendered HTML Panel with Tailwind & Neoclassical Styling */}
                <div className="w-full">
                  {parse(panel.html, parserOptions)}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Floating Navigator Bar (Bottom Right) */}
      <aside aria-label="Folio Quick Navigation" className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-surface-container-lowest/95 backdrop-blur-md border border-surface-container-highest/80 rounded-full px-4 py-2 shadow-2xl">
        <div className="flex items-center gap-2 pr-2 border-r border-surface-container-highest text-xs font-mono">
          <span className="text-primary font-bold">
            {currentNum < 10 ? `0${currentNum}` : currentNum}
          </span>
          <span className="text-outline">/ 09</span>
        </div>

        {/* Jump Next */}
        <button
          type="button"
          onClick={() => scrollTo(nextPanel.id)}
          title={`${t('folio_jump')}: ${t(`folio_p${nextPanel.num}_title`)}`}
          aria-label="Next panel"
          className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </button>

        {/* Scroll Top */}
        <button
          type="button"
          onClick={() => scrollTo("01-hero")}
          title="Back to Top"
          aria-label="Back to top"
          className="p-1.5 rounded-full hover:bg-surface-container text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
            <line x1="4" y1="2" x2="20" y2="2" />
          </svg>
        </button>
      </aside>

      {/* Institutional Archival Footer */}
      <footer className="w-full bg-surface-container-lowest border-t border-surface-container-highest/50 py-12 px-4 md:px-8 lg:px-12 text-center text-on-surface-variant">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
          <img src="/Logo.png" alt="Saathi Vyapar Logo" className="w-8 h-8 object-contain" />
          <h4 className="text-2xl font-serif text-on-surface font-normal">
            Saathi Vyapar · साथी व्यापार
          </h4>
          <p className="text-sm font-serif max-w-xl text-on-surface-variant">
            Ministry of Social Justice & Empowerment · Smart India Hackathon (SIH26091).
            Engineered by Team Pantheon Eternal.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-outline pt-2">
            <Link href="/login" className="hover:text-primary transition-colors">
              Access Web Terminal
            </Link>
            <span>•</span>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === "interactive" ? "plates" : "interactive")}
              className="hover:text-primary transition-colors"
            >
              Toggle Stitch Plates
            </button>
            <span>•</span>
            <a
              href="https://wa.me/?text=Hi%20Saathi%20Vyapar"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              WhatsApp Conduit
            </a>
          </div>
          <p className="text-[11px] font-mono text-outline/60 pt-4">
            Stitch MCP Repository: projects/{STITCH_PROJECT.id} · 9 Certified Archival Plates
          </p>
        </div>
      </footer>
    </div>
  );
}
