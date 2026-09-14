'use client';

/**
 * src/components/Reveal.tsx
 *
 * Shows its children with a short rise as they first come into view.
 *
 * A wrapper rather than a class on every element, so the page markup stays
 * about content and the motion stays in one place. `delay` staggers a row,
 * which is the difference between a row arriving and a row flashing.
 *
 * Everything degrades to plain visible content: without IntersectionObserver,
 * and under prefers-reduced-motion, the children simply appear.
 */

import type { ReactNode } from 'react';
import { useInView } from '@/lib/hooks/useInView';

interface Props {
  children: ReactNode;
  /** 1–4, roughly 70ms apart. */
  delay?: 1 | 2 | 3 | 4;
  className?: string;
}

export default function Reveal({ children, delay, className = '' }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`reveal ${delay ? `reveal-${delay}` : ''} ${inView ? 'is-visible' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
