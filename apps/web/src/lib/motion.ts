import type React from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** GSAP's match for --ease-out in index.css (a quint ease-out), so CSS and GSAP motion feel like one system. */
export const EASE_OUT = 'power4.out';

export { gsap, ScrollTrigger, useGSAP };

/**
 * Motion for a component: `setup` runs inside a GSAP context scoped to `scope`, so
 * selector strings only match inside it, and only when the user has not asked for
 * reduced motion. Everything it creates is reverted on unmount or when a dependency changes.
 */
export function useMotion(
  setup: () => void,
  { scope, dependencies = [] }: { scope: React.RefObject<HTMLElement | null>; dependencies?: unknown[] },
) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', setup, scope.current ?? undefined);
      return () => mm.revert();
    },
    { scope, dependencies, revertOnUpdate: true },
  );
}
