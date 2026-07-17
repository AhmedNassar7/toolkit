import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Keyed by location.key (react-router's per-history-entry id), so back/forward
// navigation can restore the exact scroll offset the user left each page at.
// The browser's own scroll restoration is unreliable for client-rendered routes,
// so positions are tracked manually instead - continuously via a scroll listener
// rather than read once at unmount, since by the time a route unmounts the DOM
// has already swapped to the new (possibly shorter) page and the browser will
// have already clamped window.scrollY to fit it.
const scrollPositions = new Map<string, number>();

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

export default function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    const key = location.key;
    const recordPosition = () => scrollPositions.set(key, window.scrollY);
    window.addEventListener('scroll', recordPosition, { passive: true });
    return () => window.removeEventListener('scroll', recordPosition);
  }, [location.key]);

  useEffect(() => {
    const savedPosition = scrollPositions.get(location.key);
    if (navigationType === 'POP' && savedPosition !== undefined) {
      window.scrollTo(0, savedPosition);
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.key, navigationType]);

  return null;
}
