/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import { useLanguage } from '@/contexts/LanguageContext';
import { STITCH_PANELS, STITCH_PROJECT, StitchPanel } from "@/lib/stitchPanelsData";

interface PlatesGalleryProps {
  onSelectPanel: (panelId: string) => void;
}

export default function PlatesGallery({ onSelectPanel }: PlatesGalleryProps) {
  const { t } = useLanguage();
  const [selectedPlate, setSelectedPlate] = useState<StitchPanel | null>(null);

  return (
    <div className="w-full min-h-screen bg-surface py-12 px-4 sm:px-6 lg:px-12">
      {/* Gallery Header */}
      <div className="max-w-7xl mx-auto mb-10 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high border border-primary/20 text-primary mb-4">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-mono tracking-widest uppercase">
            STITCH MCP ARCHIVAL REPOSITORY · PROJECT #{STITCH_PROJECT.id}
          </span>
        </div>
        <h2 className="text-3xl md:text-5xl font-serif text-on-surface tracking-tight mb-3">
          {t('folio_plates_title')}
        </h2>
        <p className="text-base md:text-lg text-on-surface-variant max-w-2xl mx-auto font-serif">
          {t('folio_plates_sub')}
        </p>
      </div>

      {/* Grid of 9 Plates */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {STITCH_PANELS.map((panel) => (
          <div
            key={panel.id}
            className="group relative bg-surface-container-low border border-surface-container-highest/60 rounded-xl overflow-hidden shadow-xl hover:border-primary/50 transition-all duration-300 flex flex-col"
          >
            {/* Plate Preview Image */}
            <div
              className="relative w-full aspect-[16/10] bg-surface-container-lowest overflow-hidden cursor-pointer"
              onClick={() => setSelectedPlate(panel)}
            >
              <img
                src={panel.image}
                alt={panel.fullTitle}
                className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent opacity-60 group-hover:opacity-30 transition-opacity" />
              
              <div className="absolute top-3 left-3 px-2 py-1 bg-surface-container-lowest/90 backdrop-blur border border-surface-container-highest rounded text-[11px] font-mono text-primary">
                FOLIO {panel.num < 10 ? `0${panel.num}` : panel.num}
              </div>

              <div className="absolute bottom-3 right-3 px-2.5 py-1 bg-primary/90 text-on-primary rounded text-xs font-mono font-medium shadow flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
                {t('folio_inspect')}
              </div>
            </div>

            {/* Plate Info */}
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-mono text-outline uppercase tracking-wider mb-1">
                  SCREEN ID: {panel.screenId.slice(0, 12)}...
                </div>
                <h3 className="text-lg font-serif font-medium text-on-surface mb-2 group-hover:text-primary transition-colors">
                  {t(`folio_p${panel.num}_full`).replace("Saathi Vyapar — ", "").replace("साथी व्यापार — ", "")}
                </h3>
                <p className="text-sm text-on-surface-variant font-serif line-clamp-2">
                  {t(`folio_p${panel.num}_caption`)}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-4 border-t border-surface-container-highest/40 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSelectPanel(panel.id)}
                  className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary text-xs font-mono uppercase tracking-wider rounded transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  View Live Panel
                </button>
                <a
                  href={panel.image}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-outline hover:text-on-surface transition-colors flex items-center gap-1"
                >
                  Full PNG
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedPlate && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
          onClick={() => setSelectedPlate(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[90vh] bg-surface-container-low border border-primary/30 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-surface-container-highest flex items-center justify-between">
              <div>
                <span className="text-xs font-mono text-primary uppercase">
                  FOLIO {selectedPlate.num < 10 ? `0${selectedPlate.num}` : selectedPlate.num} / 09
                </span>
                <h3 className="text-xl font-serif text-on-surface">
                  {selectedPlate.fullTitle}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPanel(selectedPlate.id)}
                  className="px-3 py-1.5 bg-primary text-on-primary font-mono text-xs uppercase tracking-wider rounded shadow hover:bg-primary-fixed"
                >
                  Go to Live Section
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPlate(null)}
                  className="p-1.5 rounded-full hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Image */}
            <div className="flex-1 overflow-auto p-4 bg-surface-container-lowest flex items-center justify-center">
              <img
                src={selectedPlate.image}
                alt={selectedPlate.fullTitle}
                className="max-h-[70vh] w-auto object-contain rounded border border-surface-container-highest"
              />
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-surface-container-highest bg-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono text-outline">
              <div>Resource: projects/{STITCH_PROJECT.id}/screens/{selectedPlate.screenId}</div>
              <div className="text-on-surface-variant font-serif italic">{t(`folio_p${selectedPlate.num}_caption`)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
