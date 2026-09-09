/**
 * Supabase connection values, read from the environment.
 *
 * Both are `NEXT_PUBLIC_*` and therefore ship in browser code — that is
 * deliberate. Access is bounded entirely by the RLS policies in
 * supabase/migrations/, not by keeping these secret. There is intentionally no
 * service-role key in this project; see docs/ai/DECISIONS.md § Auth & Ownership.
 *
 * Values live in .env.local (gitignored). .env.example documents the names only.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in the values ` +
        `from the Supabase dashboard (Project Settings > API).`
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}

/**
 * Whether Supabase is configured in this environment. Lets callers degrade
 * gracefully (e.g. keep the local-draft flow working) instead of throwing,
 * which matters while the project is still being set up.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );
}
