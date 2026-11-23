/**
 * Cloudflare Turnstile token for Supabase anonymous sign-in.
 *
 * Only used when VITE_TURNSTILE_SITE_KEY is set. The widget uses
 * `appearance: 'interaction-only'`, so most visitors never see it; it shows up
 * near the bottom of the screen only when Cloudflare wants a click.
 */

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance?: 'always' | 'execute' | 'interaction-only';
      language?: string;
      callback?: (token: string) => void;
      'error-callback'?: (code: string) => void;
      'expired-callback'?: () => void;
      'timeout-callback'?: () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TOKEN_TIMEOUT_MS = 60_000;

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || null;

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_missing')));
    script.onerror = () => reject(new Error('turnstile_load_failed'));
    document.head.appendChild(script);
  }).catch((err: unknown) => {
    scriptPromise = null;
    throw err;
  });
  return scriptPromise;
}

/** Resolves with a one-time token. Each token is good for a single sign-in. */
export async function getCaptchaToken(siteKey: string): Promise<string> {
  const turnstile = await loadScript();
  const container = document.createElement('div');
  container.setAttribute('data-turnstile', '');
  container.style.cssText =
    'position:fixed;left:50%;bottom:max(1.5rem,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:1000;';
  document.body.appendChild(container);

  return new Promise<string>((resolve, reject) => {
    let widgetId: string | null = null;
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (widgetId) turnstile.remove(widgetId);
      container.remove();
      fn();
    };
    const timer = window.setTimeout(() => finish(() => reject(new Error('turnstile_timeout'))), TOKEN_TIMEOUT_MS);

    widgetId = turnstile.render(container, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      language: 'th',
      callback: (token) => finish(() => resolve(token)),
      'error-callback': (code) => finish(() => reject(new Error(`turnstile_error_${code}`))),
      'expired-callback': () => finish(() => reject(new Error('turnstile_expired'))),
      'timeout-callback': () => finish(() => reject(new Error('turnstile_timeout'))),
    });
    // A cached pass can call back inside render(), before widgetId was set.
    if (done && widgetId) turnstile.remove(widgetId);
  });
}
