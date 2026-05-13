import { useEffect } from 'react';
import type { RefObject } from 'react';

type SwipeOpts = {
  onLeft?: () => void;
  onRight?: () => void;
  threshold?: number;
};

// Attaches passive touch listeners that fire onLeft / onRight when the
// user makes a primarily-horizontal swipe past `threshold` pixels.
//
// The hook deliberately bails out of tracking when the gesture starts
// inside an element that "owns" horizontal interaction — text inputs,
// range sliders, or any horizontally scrollable container — so the
// inner control consumes the gesture cleanly.
export function useSwipe(
  ref: RefObject<HTMLElement | null>,
  opts: SwipeOpts,
): void {
  const { onLeft, onRight, threshold = 60 } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dy = 0;
    let tracking = false;

    const shouldBail = (target: EventTarget | null): boolean => {
      let node = target as HTMLElement | null;
      while (node && node !== el) {
        const tag = node.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (node.dataset && node.dataset.noSwipe !== undefined) return true;
        // Inner horizontal scroller — let it own the gesture.
        const style = window.getComputedStyle(node);
        const ox = style.overflowX;
        if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth + 2) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || shouldBail(e.target)) {
        tracking = false;
        return;
      }
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dx = 0;
      dy = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      dx = e.touches[0].clientX - startX;
      dy = e.touches[0].clientY - startY;
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      // Require the swipe to be primarily horizontal — otherwise the
      // user is probably scrolling or doing something else.
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) onLeft?.();
        else onRight?.();
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, onLeft, onRight, threshold]);
}
