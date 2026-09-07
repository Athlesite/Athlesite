import { normalizeAthleteProfileData, type AthleteProfileData } from "@/lib/athlete-profile";

/**
 * Persistence envelope around AthleteProfileData. Storage metadata
 * (id/timestamps) lives here, not on the domain model itself.
 */
export type StoredAthleteProfile = {
  id: string;
  createdAt: string;
  updatedAt: string;
  profile: AthleteProfileData;
};

const DRAFT_KEY = "athlesite:onboarding:draft";
const DRAFT_STEP_KEY = "athlesite:onboarding:step";
const PROFILE_KEY_PREFIX = "athlesite:athlete:";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readJson<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable (quota exceeded, private browsing, etc).
    // This is a validation prototype — fail silently rather than crash the flow.
  }
}

function generateId(): string {
  if (isBrowser() && "randomUUID" in window.crypto) {
    return window.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function loadDraft(): AthleteProfileData | null {
  const raw = readJson<unknown>(DRAFT_KEY);
  // Distinguish "nothing saved yet" (null — a genuinely new session) from
  // "something was saved, possibly in an older shape" (normalize it rather
  // than losing it or crashing on missing fields).
  if (raw == null) return null;
  return normalizeAthleteProfileData(raw);
}

export function saveDraft(data: AthleteProfileData): void {
  writeJson(DRAFT_KEY, data);
}

/** Raw stored step value — unvalidated. Callers must clamp before use. */
export function loadDraftStep(): unknown {
  return readJson<unknown>(DRAFT_STEP_KEY);
}

export function saveDraftStep(step: number): void {
  writeJson(DRAFT_STEP_KEY, step);
}

export function loadAthleteProfile(slug: string): StoredAthleteProfile | null {
  const raw = readJson<unknown>(PROFILE_KEY_PREFIX + slug);
  if (!raw || typeof raw !== "object") return null;
  const stored = raw as Partial<StoredAthleteProfile>;
  const now = new Date().toISOString();
  return {
    id: typeof stored.id === "string" ? stored.id : generateId(),
    createdAt: typeof stored.createdAt === "string" ? stored.createdAt : now,
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : now,
    profile: normalizeAthleteProfileData(stored.profile),
  };
}

export function isSlugTaken(slug: string): boolean {
  return loadAthleteProfile(slug) !== null;
}

export function saveAthleteProfile(data: AthleteProfileData): StoredAthleteProfile {
  const existing = loadAthleteProfile(data.slug);
  const now = new Date().toISOString();
  const stored: StoredAthleteProfile = {
    id: existing?.id ?? generateId(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    profile: data,
  };
  writeJson(PROFILE_KEY_PREFIX + data.slug, stored);
  return stored;
}
