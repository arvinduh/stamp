/**
 * @fileoverview Build-time settings read from `.env.local`; see `.env.example`.
 */

interface ImportMetaEnv {
  /** Project URL from Supabase: Project Settings → API. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's publishable (anon) key; safe to ship to browsers. */
  readonly VITE_SUPABASE_KEY?: string;
}
