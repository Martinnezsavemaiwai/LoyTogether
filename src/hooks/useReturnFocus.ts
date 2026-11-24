import { useEffect } from 'react';

/**
 * Remembers what had focus when a sheet opened and puts focus back there when it
 * closes, so keyboard and screen-reader users are not dropped at the top of the page.
 */
export function useReturnFocus() {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
}
