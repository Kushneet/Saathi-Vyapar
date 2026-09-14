'use client';

/**
 * src/lib/hooks/useInView.ts
 *
 * Fires once when an element first scrolls into view.
 *
 * Used to reveal sections as you reach them. IntersectionObserver rather than
 * a scroll listener, so nothing runs on every frame, and it disconnects after
 * the first hit — the animation is a greeting, not a loop that keeps pulling
 * the eye back while someone is trying to read.
 */

import { useEffect, useRef, useState } from 'react';

export function useInView<T extends HTMLElement = HTMLDivElement>(rootMargin = '-10% 0px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Without the API, show everything rather than leaving content invisible.
    // Queued rather than set straight away: a synchronous setState inside an
    // effect triggers a cascading render, and the React compiler rejects it.
    if (typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => setInView(true));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold: 0.05 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return { ref, inView };
}
