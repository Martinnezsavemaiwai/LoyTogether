const SEEN_KEY = 'loynamkan:support-asked';

/** Ask at most once per browser session, so floating a second krathong is never nagged. */
export function shouldAskForSupport(): boolean {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Private mode without storage: asking once per page load is still fine.
  }
  return true;
}
