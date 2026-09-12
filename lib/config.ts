/**
 * Central, validated access to every environment variable the app uses.
 *
 * Every other server file reads config through here — never `process.env`
 * directly — so there is exactly one place that can get the safety gate
 * wrong. Import-time validation means a missing or invalid var fails fast
 * at boot, not mid-request.
 *
 * See Rules.md §1.1 and §1.6.
 */
import { z } from "zod";

const boolFromString = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.enum(["true", "false"]))
  .transform((v) => v === "true");

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1),
  GEMINI_EMBEDDING_MODEL: z.string().min(1),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be a real secret, not a placeholder"),
  // Phase 11: AES-256 key for lib/crypto.ts, which encrypts every OAuth
  // token before it reaches platform_connections (Rules.md §1.6). Required,
  // not optional — an unset key must fail at boot, never degrade into
  // storing a token in plaintext. Generate with: openssl rand -hex 32
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes) — generate with: openssl rand -hex 32"),
  ALLOWED_FOUNDER_EMAIL: z.email(),
  AUTO_PUBLISH: boolFromString,
  HUMAN_APPROVAL_REQUIRED: boolFromString,
  // Optional: Reddit blocks unauthenticated requests to its public .json
  // endpoints (verified directly — 403 even with a descriptive User-Agent).
  // Without these, services/collector/reddit.ts no-ops rather than emitting
  // a fake "0 results" success. Create a "script" app at
  // reddit.com/prefs/apps to get these.
  REDDIT_CLIENT_ID: z.string().min(1).optional(),
  REDDIT_CLIENT_SECRET: z.string().min(1).optional(),
  // Optional as a group (Phase 11, same pattern as REDDIT_* above): with any
  // of the three unset, connectors/linkedin reports itself unconfigured from
  // validateConnection() instead of half-attempting an OAuth flow. The
  // redirect URI is config rather than derived from the request because
  // LinkedIn matches it byte-for-byte against the developer-portal value.
  LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
  LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
  LINKEDIN_REDIRECT_URI: z.url().optional(),
  // Optional as a group (Phase 12, same pattern as LINKEDIN_* above). The
  // Instagram app is the Meta app's "Instagram" product with Business Login
  // configured; the redirect URI must be HTTPS — Instagram rejects plain
  // HTTP — and match the dashboard value byte-for-byte.
  INSTAGRAM_CLIENT_ID: z.string().min(1).optional(),
  INSTAGRAM_CLIENT_SECRET: z.string().min(1).optional(),
  INSTAGRAM_REDIRECT_URI: z.url().startsWith("https://", "INSTAGRAM_REDIRECT_URI must be an https URL").optional(),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

function parseOrThrow<T extends z.ZodTypeAny>(schema: T, source: Record<string, string | undefined>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

const publicEnv = parseOrThrow(publicEnvSchema, {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

// Server-only vars are parsed lazily behind isServerContext so this module
// stays importable from client components without leaking secrets or
// throwing over vars that were never sent to the browser.
const isServer = typeof window === "undefined";

const serverEnv = isServer
  ? parseOrThrow(serverEnvSchema, {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
      GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL,
      CRON_SECRET: process.env.CRON_SECRET,
      TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
      ALLOWED_FOUNDER_EMAIL: process.env.ALLOWED_FOUNDER_EMAIL,
      AUTO_PUBLISH: process.env.AUTO_PUBLISH,
      HUMAN_APPROVAL_REQUIRED: process.env.HUMAN_APPROVAL_REQUIRED,
      REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID,
      REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET,
      LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID,
      LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET,
      LINKEDIN_REDIRECT_URI: process.env.LINKEDIN_REDIRECT_URI,
      INSTAGRAM_CLIENT_ID: process.env.INSTAGRAM_CLIENT_ID,
      INSTAGRAM_CLIENT_SECRET: process.env.INSTAGRAM_CLIENT_SECRET,
      INSTAGRAM_REDIRECT_URI: process.env.INSTAGRAM_REDIRECT_URI,
    })
  : null;

/**
 * Rules.md §1.1 — "Never publish without human approval." This invariant
 * must never be silently changeable: fully-automated publishing is only
 * legal when the founder has *explicitly* turned the approval requirement
 * off, never as an accidental byproduct of flipping AUTO_PUBLISH alone.
 */
function assertSafetyGate(env: NonNullable<typeof serverEnv>) {
  if (env.AUTO_PUBLISH && env.HUMAN_APPROVAL_REQUIRED) {
    throw new Error(
      "Invalid safety configuration: AUTO_PUBLISH=true while HUMAN_APPROVAL_REQUIRED=true. " +
        "These are contradictory — nothing may auto-publish while approval is still required. " +
        "See Rules.md §1.1.",
    );
  }
}

if (serverEnv) assertSafetyGate(serverEnv);

export const config = {
  supabase: {
    url: publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    get serviceRoleKey() {
      return requireServer().SUPABASE_SERVICE_ROLE_KEY;
    },
  },
  gemini: {
    get apiKey() {
      return requireServer().GEMINI_API_KEY;
    },
    get model() {
      return requireServer().GEMINI_MODEL;
    },
    get embeddingModel() {
      return requireServer().GEMINI_EMBEDDING_MODEL;
    },
  },
  cron: {
    get secret() {
      return requireServer().CRON_SECRET;
    },
  },
  reddit: {
    get clientId() {
      return requireServer().REDDIT_CLIENT_ID;
    },
    get clientSecret() {
      return requireServer().REDDIT_CLIENT_SECRET;
    },
  },
  linkedin: {
    get clientId() {
      return requireServer().LINKEDIN_CLIENT_ID;
    },
    get clientSecret() {
      return requireServer().LINKEDIN_CLIENT_SECRET;
    },
    get redirectUri() {
      return requireServer().LINKEDIN_REDIRECT_URI;
    },
  },
  instagram: {
    get clientId() {
      return requireServer().INSTAGRAM_CLIENT_ID;
    },
    get clientSecret() {
      return requireServer().INSTAGRAM_CLIENT_SECRET;
    },
    get redirectUri() {
      return requireServer().INSTAGRAM_REDIRECT_URI;
    },
  },
  get tokenEncryptionKey() {
    return requireServer().TOKEN_ENCRYPTION_KEY;
  },
  auth: {
    get allowedFounderEmail() {
      return requireServer().ALLOWED_FOUNDER_EMAIL;
    },
  },
  get autoPublish() {
    return requireServer().AUTO_PUBLISH;
  },
  get humanApprovalRequired() {
    return requireServer().HUMAN_APPROVAL_REQUIRED;
  },
};

function requireServer(): NonNullable<typeof serverEnv> {
  if (!serverEnv) {
    throw new Error(
      "Server-only config accessed from the client. This is a bug — move the read into a Server Component, Route Handler, or server action.",
    );
  }
  return serverEnv;
}
