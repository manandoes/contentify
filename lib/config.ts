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
  ALLOWED_FOUNDER_EMAIL: z.email(),
  AUTO_PUBLISH: boolFromString,
  HUMAN_APPROVAL_REQUIRED: boolFromString,
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
      ALLOWED_FOUNDER_EMAIL: process.env.ALLOWED_FOUNDER_EMAIL,
      AUTO_PUBLISH: process.env.AUTO_PUBLISH,
      HUMAN_APPROVAL_REQUIRED: process.env.HUMAN_APPROVAL_REQUIRED,
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
