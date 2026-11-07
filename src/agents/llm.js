import { generateObject as aiGenerateObject } from 'ai';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { google, createGoogle } from '@ai-sdk/google';

// Quiet Vercel AI SDK deprecation warnings for scripts without migrating generateObject yet
if (process.env.AI_SDK_LOG_WARNINGS === undefined) {
  process.env.AI_SDK_LOG_WARNINGS = 'false';
}

/**
 * Typed error class for when all live LLM attempts (primary + fallback + retries) fail.
 */
export class LlmUnavailableError extends Error {
  constructor(message = 'Live AI model unavailable', cause) {
    super(message);
    this.name = 'LLM_UNAVAILABLE';
    this.code = 'LLM_UNAVAILABLE';
    if (cause) this.cause = cause;
  }
}

/**
 * Determines whether an error is transient / retryable (503, 429, timeout, network glitch).
 * @param {unknown} err
 * @returns {boolean}
 */
export function isRetryableError(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  const status = err.status ?? err.statusCode;

  if (status === 429 || status === 503 || status === 502 || status === 504 || status === 500) {
    return true;
  }

  if (
    err.name === 'TimeoutError' ||
    err.name === 'AbortError' ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('rate limit') ||
    msg.includes('overloaded') ||
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('fetch failed') ||
    msg.includes('econnreset')
  ) {
    return true;
  }

  return false;
}

/**
 * Returns a configured Vercel AI SDK model instance.
 * @param {object} [options]
 * @param {'anthropic'|'google'} [options.provider]
 * @param {string} [options.modelId]
 * @param {string} [options.apiKey]
 */
export function getModel({
  provider = process.env.LLM_PROVIDER ?? 'anthropic',
  modelId = process.env.LLM_MODEL,
  apiKey,
} = {}) {
  const normProvider = String(provider).trim().toLowerCase();

  if (normProvider === 'anthropic') {
    const id = modelId || 'claude-3-5-haiku-20241022';
    if (apiKey) {
      return createAnthropic({ apiKey })(id);
    }
    return anthropic(id);
  }

  if (normProvider === 'google') {
    const id = modelId || 'gemini-1.5-flash';
    if (apiKey) {
      return createGoogle({ apiKey })(id);
    }
    return google(id);
  }

  throw new Error(`Unsupported LLM provider "${provider}". Supported: 'anthropic', 'google'.`);
}

/**
 * Creates a resilient LLM interface with:
 *  - 5 retries with exponential backoff
 *  - Configurable per-call timeout via LLM_TIMEOUT_MS (default 30,000ms)
 *  - Fallback model switching (LLM_FALLBACK_MODEL) on 503/429/timeout
 *  - Typed LLM_UNAVAILABLE error on failure
 *  - Disables/minimizes background thinking for Google Gemini models for fast turns
 *
 * @param {object} [options]
 * @param {'anthropic'|'google'} [options.provider]
 * @param {string} [options.model]
 * @param {string} [options.fallbackModel]
 * @param {'live'|'scripted'} [options.mode]
 * @param {string} [options.apiKey]
 * @param {number} [options.timeoutMs] - Per-call timeout (default LLM_TIMEOUT_MS or 30000)
 * @param {number} [options.maxRetries] - Max retry attempts (default 5)
 * @param {number} [options.initialBackoffMs] - Initial backoff in ms (default 200ms)
 * @param {object} [options.primaryModelInstance] - Optional injected primary model
 * @param {object} [options.fallbackModelInstance] - Optional injected fallback model
 * @param {Function} [options.generateObjectFn] - Optional injected runner for testing
 */
export function createLlm({
  provider = process.env.LLM_PROVIDER ?? 'anthropic',
  model = process.env.LLM_MODEL,
  fallbackModel = process.env.LLM_FALLBACK_MODEL,
  mode = process.env.NEGOTIATION_MODE ?? 'live',
  apiKey,
  timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 30_000),
  maxRetries = 5,
  initialBackoffMs = 200,
  primaryModelInstance,
  fallbackModelInstance,
  generateObjectFn = aiGenerateObject,
} = {}) {
  const isScripted = mode === 'scripted';

  if (isScripted) {
    return {
      mode: 'scripted',
      provider: 'scripted',
      modelId: 'scripted-mock',
      async generateObject() {
        return {
          object: null,
          isScripted: true,
        };
      },
    };
  }

  // Initialize primary and optional fallback models
  const primaryModel = primaryModelInstance || getModel({ provider, modelId: model, apiKey });
  const primaryId = primaryModel.modelId ?? model;

  const fallback =
    fallbackModelInstance ||
    (fallbackModel ? getModel({ provider, modelId: fallbackModel, apiKey }) : null);
  const fallbackId = fallback?.modelId ?? fallbackModel;

  return {
    mode: 'live',
    provider,
    modelId: primaryId,
    fallbackModelId: fallbackId,
    model: primaryModel,
    fallbackModel: fallback,
    timeoutMs,

    /**
     * Resilient structured output with retries, timeout, and fallback model.
     */
    async generateObject({ schema, system, prompt, schemaName, maxOutputTokens, providerOptions }) {
      const candidates = [
        { model: primaryModel, id: primaryId, label: 'primary' },
      ];
      if (fallback) {
        candidates.push({ model: fallback, id: fallbackId, label: 'fallback' });
      }

      // Default providerOptions to minimize thinking on Google Gemini models
      const defaultProviderOptions =
        provider === 'google'
          ? {
              google: {
                thinkingConfig: { thinkingBudget: 0 },
              },
            }
          : undefined;

      const effectiveProviderOptions = providerOptions ?? defaultProviderOptions;

      let lastError = null;

      for (const candidate of candidates) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => {
              controller.abort(new Error(`LLM call timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            try {
              const res = await generateObjectFn({
                model: candidate.model,
                schema,
                system,
                prompt,
                schemaName,
                maxOutputTokens,
                providerOptions: effectiveProviderOptions,
                abortSignal: controller.signal,
              });
              return res;
            } finally {
              clearTimeout(timer);
            }
          } catch (err) {
            lastError = err;
            const retryable = isRetryableError(err);

            // If retryable and we have attempts remaining on this candidate, back off and retry
            if (retryable && attempt < maxRetries) {
              const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
              if (backoff > 0) {
                await new Promise((r) => setTimeout(r, backoff));
              }
              continue;
            }

            // If not retryable or candidate exhausted retries, break to try fallback candidate
            break;
          }
        }
      }

      // If all candidates and retries failed, throw typed LLM_UNAVAILABLE error
      throw new LlmUnavailableError(
        `Live AI unavailable after attempting primary and fallback models: ${lastError?.message || 'unknown error'}`,
        lastError
      );
    },
  };
}
