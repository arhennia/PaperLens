/**
 * LLM access for answer hints and mock papers (D-023).
 *
 * ---------------------------------------------------------------------------
 * Server-only. `LLM_API_KEY` must never reach the browser.
 *
 * Five controls gate every call, in this order. They are here rather than in
 * each route because the order matters and duplicating it per route would mean
 * four chances to get it wrong:
 *
 *   1. Cache first        — `llm_cache`, keyed by content fingerprint.
 *   2. Rate limit         — per user, per feature, per minute.
 *   3. Daily token budget — `llm_usage`, server-incremented only.
 *   4. Token cap per call — `LLM_MAX_TOKENS` bounds output.
 *   5. One retry, ever    — retry a 5xx or timeout once; never retry a 4xx.
 *
 * Why this matters more than it looks: a folder holds hundreds of questions and
 * a share link can be opened by an unbounded number of classmates. Without the
 * cache, one popular shared folder is a bill multiplier. Public share viewers
 * therefore read cached hints but can never trigger generation — there is no
 * authenticated user to bill or rate-limit, so the public path calls
 * `readCachedOnly` and never `generate`.
 *
 * Deterministic analytics never call this module. Repetition, weightage and
 * priority stay pure functions of stored data (D-014), so an outage or an
 * exhausted budget degrades study tools while leaving the three core
 * differentiators fully working.
 * ---------------------------------------------------------------------------
 */

import "server-only";

import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.generated";

/** Which AI feature is calling. Part of the cache key. */
export type LlmFeature = "answer_hint" | "mock_paper";

/** Bumped when a prompt changes, so new output does not mix with old (D-023). */
const PROMPT_VERSION = 1;

/** Requests per user per feature per minute. */
const RATE_LIMIT_PER_MINUTE = 5;

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function model(): string {
  return process.env.LLM_MODEL || "claude-sonnet-5";
}

function maxTokens(): number {
  const parsed = Number(process.env.LLM_MAX_TOKENS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 1024;
}

function dailyTokenBudget(): number {
  const parsed = Number(process.env.LLM_DAILY_TOKEN_BUDGET);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 100_000;
}

/**
 * The outcome of an LLM request.
 *
 * A discriminated union rather than a value-or-throw, because "you have hit your
 * daily limit" is a normal state the UI must render clearly, not an exception
 * (D-023). Only genuine faults throw.
 */
export type LlmResult<T> =
  | { status: "ok"; payload: T; cached: boolean }
  | { status: "budget_exhausted" }
  | { status: "rate_limited" }
  | { status: "unavailable"; message: string }
  | { status: "not_configured" };

/**
 * Generates a response for the development preview without persistence.
 *
 * The preview folder has no database row by design, so it cannot use the normal
 * cached path. This helper is intentionally only used by preview actions; real
 * folders must use generateCached so budgets and cache invalidation apply.
 */
export async function generatePreview<T>({
  prompt,
  system,
  jsonSchema,
}: {
  prompt: string;
  system: string;
  jsonSchema?: Record<string, unknown>;
}): Promise<LlmResult<T>> {
  if (!process.env.LLM_API_KEY) return { status: "not_configured" };

  try {
    const response = await callAnthropic({ prompt, system, jsonSchema });
    const text = extractText(response);
    if (!text) {
      return { status: "unavailable", message: "The AI returned an empty response." };
    }
    return {
      status: "ok",
      payload: (jsonSchema ? JSON.parse(text) : { text }) as T,
      cached: false,
    };
  } catch (error) {
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "The AI service is unavailable.",
    };
  }
}

/** Hashes the inputs a generation depends on, so a change misses the cache. */
export function fingerprintInput(parts: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex");
}

/**
 * Reads a cached payload without ever generating.
 *
 * This is the only entry point the public share route may use: it cannot spend
 * the owner's budget, so a share link is not a way to run up their bill
 * (D-023). Uses the admin client because a public viewer has no session.
 */
export async function readCachedOnly<T>(
  folderId: string,
  feature: LlmFeature,
  inputFingerprint: string,
): Promise<T | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("llm_cache")
    .select("payload")
    .eq("folder_id", folderId)
    .eq("feature", feature)
    .eq("model", model())
    .eq("prompt_version", PROMPT_VERSION)
    .eq("input_fingerprint", inputFingerprint)
    .maybeSingle();

  return (data?.payload as T | undefined) ?? null;
}

/**
 * Returns a cached payload, or generates and caches one.
 *
 * The caller must have already verified that `userId` owns `folderId`.
 */
export async function generateCached<T>({
  userId,
  folderId,
  feature,
  inputFingerprint,
  prompt,
  system,
  jsonSchema,
}: {
  userId: string;
  folderId: string;
  feature: LlmFeature;
  inputFingerprint: string;
  prompt: string;
  system: string;
  /** When set, the model is constrained to this shape, so parsing cannot fail. */
  jsonSchema?: Record<string, unknown>;
}): Promise<LlmResult<T>> {
  // 1. Cache first. A hit costs nothing and is not rate-limited or budgeted —
  //    it is the same answer the owner already paid for.
  const cached = await readCachedOnly<T>(folderId, feature, inputFingerprint);
  if (cached !== null) {
    return { status: "ok", payload: cached, cached: true };
  }

  if (!process.env.LLM_API_KEY) {
    return { status: "not_configured" };
  }

  const admin = createAdminClient();

  // 2. Rate limit. Counts this user's cache rows for this feature in the last
  //    minute — an approximation of request rate that needs no extra table, and
  //    errs on the permissive side since a failed call writes no row.
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await admin
    .from("llm_cache")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", oneMinuteAgo);

  if ((recent ?? 0) >= RATE_LIMIT_PER_MINUTE) {
    return { status: "rate_limited" };
  }

  // 3. Daily budget. Read before spending, so the limit is a limit rather than
  //    a report. Users cannot write this table (D-036), so they cannot reset it.
  const today = new Date().toISOString().slice(0, 10);
  const { data: usageRows } = await admin
    .from("llm_usage")
    .select("tokens_in, tokens_out")
    .eq("user_id", userId)
    .eq("usage_date", today);

  const spent = (usageRows ?? []).reduce(
    (total, row) => total + (row.tokens_in ?? 0) + (row.tokens_out ?? 0),
    0,
  );
  if (spent >= dailyTokenBudget()) {
    return { status: "budget_exhausted" };
  }

  // 4 and 5. Token-capped call with exactly one retry.
  let response: AnthropicResponse;
  try {
    response = await callAnthropic({ prompt, system, jsonSchema });
  } catch (error) {
    const message =
      error instanceof LlmUnavailableError
        ? error.message
        : "The AI service is unavailable. Please try again.";
    return { status: "unavailable", message };
  }

  const text = extractText(response);
  if (!text) {
    // A refusal or an empty completion. Reported rather than cached: caching it
    // would make one bad response permanent for this folder.
    return {
      status: "unavailable",
      message:
        response.stop_reason === "refusal"
          ? "The AI declined to answer this question."
          : "The AI returned an empty response. Please try again.",
    };
  }

  let payload: T;
  try {
    payload = (jsonSchema ? JSON.parse(text) : { text }) as T;
  } catch {
    return {
      status: "unavailable",
      message: "The AI response could not be read. Please try again.",
    };
  }

  await recordUsage(userId, feature, response);

  // Cache last, so only a genuinely usable response is stored. `upsert` rather
  // than `insert` because two concurrent requests for the same hint would
  // otherwise collide on the unique key.
  await admin.from("llm_cache").upsert(
    {
      folder_id: folderId,
      user_id: userId,
      feature,
      model: model(),
      prompt_version: PROMPT_VERSION,
      input_fingerprint: inputFingerprint,
      payload: payload as Json,
      tokens_in: response.usage?.input_tokens ?? null,
      tokens_out: response.usage?.output_tokens ?? null,
    },
    { onConflict: "folder_id,feature,model,prompt_version,input_fingerprint" },
  );

  return { status: "ok", payload, cached: false };
}

/** Increments the per-user daily counters that the budget check reads. */
async function recordUsage(
  userId: string,
  feature: LlmFeature,
  response: AnthropicResponse,
): Promise<void> {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const tokensIn = response.usage?.input_tokens ?? 0;
  const tokensOut = response.usage?.output_tokens ?? 0;

  const { data: existing } = await admin
    .from("llm_usage")
    .select("id, calls, tokens_in, tokens_out")
    .eq("user_id", userId)
    .eq("usage_date", today)
    .eq("feature", feature)
    .maybeSingle();

  if (existing) {
    await admin
      .from("llm_usage")
      .update({
        calls: existing.calls + 1,
        tokens_in: existing.tokens_in + tokensIn,
        tokens_out: existing.tokens_out + tokensOut,
      })
      .eq("id", existing.id);
    return;
  }

  await admin.from("llm_usage").insert({
    user_id: userId,
    usage_date: today,
    feature,
    calls: 1,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  });
}

/** Thrown when the provider is unreachable or failing. Retryable. */
class LlmUnavailableError extends Error {}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * One call to the Messages API, with a single retry.
 *
 * Retries a 429, a 5xx, or a timeout exactly once, then gives up (D-023). A 4xx
 * is never retried: a malformed request will fail identically the second time,
 * and retrying it just doubles the cost of a bug.
 */
async function callAnthropic({
  prompt,
  system,
  jsonSchema,
}: {
  prompt: string;
  system: string;
  jsonSchema?: Record<string, unknown>;
}): Promise<AnthropicResponse> {
  if (model().toLowerCase().startsWith("gemini")) {
    return callGemini({ prompt, system, jsonSchema });
  }

  const body: Record<string, unknown> = {
    model: model(),
    max_tokens: maxTokens(),
    system,
    messages: [{ role: "user", content: prompt }],
  };

  // Constrains the response to the schema, so a mock paper cannot come back as
  // prose that fails to parse. Cheaper than a defensive parser and a retry.
  if (jsonSchema) {
    body.output_config = {
      format: { type: "json_schema", schema: jsonSchema },
    };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.LLM_API_KEY as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
    } catch {
      // Network failure or timeout. Retryable.
      if (attempt === 0) continue;
      throw new LlmUnavailableError(
        "The AI service did not respond. Please try again.",
      );
    }

    if (response.ok) {
      return (await response.json()) as AnthropicResponse;
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt === 0) continue;

    if (retryable) {
      throw new LlmUnavailableError(
        "The AI service is busy. Please try again in a moment.",
      );
    }

    // A 4xx: our bug, or a bad key. Logged server-side; the caller gets a
    // generic message, since the provider's error text is not for end users.
    console.error(
      `Anthropic API returned ${response.status} for feature request.`,
    );
    throw new LlmUnavailableError("The AI request was rejected.");
  }

  throw new LlmUnavailableError("The AI service is unavailable.");
}

/** Calls Gemini and normalizes its response to the internal provider shape. */
async function callGemini({
  prompt,
  system,
  jsonSchema,
}: {
  prompt: string;
  system: string;
  jsonSchema?: Record<string, unknown>;
}): Promise<AnthropicResponse> {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: maxTokens(),
  };

  if (jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = jsonSchema;
  }

  const response = await fetch(
    `${GEMINI_API_URL}/${encodeURIComponent(model())}:generateContent?key=${encodeURIComponent(process.env.LLM_API_KEY as string)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable) {
      throw new LlmUnavailableError("The Gemini service is busy. Please try again.");
    }
    console.error(`Gemini API returned ${response.status} for feature request.`);
    throw new LlmUnavailableError("The AI request was rejected. Check the Gemini model and API key.");
  }

  const body = (await response.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const candidate = body.candidates?.[0];
  return {
    content: [{
      type: "text",
      text: candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "",
    }],
    stop_reason: candidate?.finishReason,
    usage: {
      input_tokens: body.usageMetadata?.promptTokenCount,
      output_tokens: body.usageMetadata?.candidatesTokenCount,
    },
  };
}

/** Concatenates the text blocks of a response, ignoring any other block type. */
function extractText(response: AnthropicResponse): string {
  return (response.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text as string)
    .join("")
    .trim();
}
