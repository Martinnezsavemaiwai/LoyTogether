import { createLocalBackend } from './localBackend';
import { createSupabaseBackend } from './supabaseBackend';
import type { Backend } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// `npm run dev:demo` forces the offline backend even when .env.local has keys.
const forceLocal = import.meta.env.VITE_FORCE_LOCAL === 'true';

export const isSupabaseConfigured = Boolean(url && anonKey) && !forceLocal;

export const backend: Backend =
  url && anonKey && !forceLocal ? createSupabaseBackend(url, anonKey) : createLocalBackend();

export * from './types';
