'use client';

/**
 * src/lib/hooks/useSpeechSupported.ts
 *
 * Whether this browser can do speech recognition.
 *
 * Written with useSyncExternalStore rather than the obvious alternatives,
 * both of which are wrong here:
 *
 *   useState(() => 'SpeechRecognition' in window)  reads window while
 *     rendering, so the server says false and the client says true, and React
 *     throws a hydration error — this is what the onboarding voice button was
 *     actually doing.
 *
 *   useState(false) + useEffect(() => setSupported(...))  fixes hydration but
 *     sets state synchronously inside an effect, which the React compiler
 *     flags as a cascading render.
 *
 * useSyncExternalStore is built for exactly this: a server snapshot of false,
 * a client snapshot read once, and no render-time access to window.
 */

import { useSyncExternalStore } from 'react';

/** Capability never changes during a session, so nothing to subscribe to. */
const subscribe = () => () => {};

const getSnapshot = () =>
  'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

const getServerSnapshot = () => false;

export function useSpeechSupported(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
