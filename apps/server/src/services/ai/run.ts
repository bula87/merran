import {
  catalogModel,
  PROVIDER_NAMES,
  type AiProvider,
  type AiTask,
  type ModelAbility,
  type Unavailable,
} from "@merran/shared"
import type { EntityManager } from "@mikro-orm/sql"
import {
  APICallError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  RetryError,
  type LanguageModel,
  type LanguageModelUsage,
  type ToolSet,
} from "ai"
import type { AppDeps } from "../../core/context.ts"
import { AppError } from "../../core/errors.ts"
import {
  clearOutOfCredit,
  isOutOfCredit,
  markOutOfCredit,
  outOfCreditError,
} from "./credit.ts"
import { targetOf } from "./keys.ts"
import { webSearchTools, type AiTarget } from "./providers.ts"
import { resolveTask } from "./status.ts"
import { recordUsage } from "./usage.ts"

// The one way a feature calls AI: whose key pays is worked out, the limits
// are checked against a rough estimate first, and what the call took and
// cost is recorded after, against the household, the person, the task and
// the key. A key its provider says is out of credit is noted, and the call
// goes to the next key there is.

/** What calling AI takes: settings for whose key pays, and the models. */
export type AiDeps = Pick<AppDeps, "settings" | "fetcher" | "ai"> & {
  logger?: AppDeps["logger"]
}

function errorDetail(error: unknown): Record<string, unknown> {
  if (APICallError.isInstance(error)) {
    return {
      message: error.message,
      statusCode: error.statusCode,
      url: error.url,
      responseBody:
        typeof error.responseBody === "string"
          ? error.responseBody.slice(0, 2000)
          : undefined,
      isRetryable: error.isRetryable,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    }
  }
  if (RetryError.isInstance(error)) {
    return { message: error.message, lastError: errorDetail(error.lastError) }
  }
  if (error instanceof Error) {
    const any = error as Error & {
      statusCode?: unknown
      responseBody?: unknown
      cause?: unknown
    }
    return {
      name: error.name,
      message: error.message,
      statusCode:
        typeof any.statusCode === "number" ? any.statusCode : undefined,
      responseBody:
        typeof any.responseBody === "string"
          ? any.responseBody.slice(0, 2000)
          : undefined,
      cause: any.cause instanceof Error ? any.cause.message : undefined,
    }
  }
  return { message: String(error) }
}

/** Why a feature can't use AI, said so someone can fix it. */
const UNAVAILABLE: Record<
  Unavailable,
  { kind: "forbidden" | "rate_limited"; message: string }
> = {
  noKey: {
    kind: "forbidden",
    message:
      "There's no AI key for this. A household admin can add one in Settings, Household, AI.",
  },
  notCovered: {
    kind: "forbidden",
    message:
      "The server's AI keys don't cover this. A household admin can add a key of the household's own in Settings, Household, AI.",
  },
  overLimit: {
    kind: "rate_limited",
    message:
      "This month's AI on the server's keys is used up. It's back next month, or a household admin can add a key of the household's own.",
  },
  ownLimit: {
    kind: "rate_limited",
    message:
      "This month's limit on the household's own AI keys is reached. A household admin can raise it in Settings, Household, AI.",
  },
}

export function aiUnavailable(why: Unavailable) {
  const { kind, message } = UNAVAILABLE[why]
  return new AppError(kind, `ai_${why}`, message)
}

/** What a model that can't do something can't do, in words. */
const ABILITY_WORDS: Record<ModelAbility, string> = {
  images: "read photos",
  pdfs: "read PDFs",
  structured: "fill in a form",
  tools: "use tools",
  webSearch: "search the web",
}

/** Who answered, in words: "Claude", or "The AI at your address". */
const whoAnswered = (provider: AiProvider) =>
  provider === "openai-compatible"
    ? "The AI at your address"
    : PROVIDER_NAMES[provider]

/**
 * A call that failed, said plainly: the provider's error, or an answer
 * that wasn't what was asked for. Anything else is Merran's own, and stays
 * as it is.
 */
function callFailed(error: unknown, provider: AiProvider) {
  const cause = RetryError.isInstance(error) ? error.lastError : error
  const who = whoAnswered(provider)
  if (
    NoObjectGeneratedError.isInstance(cause) ||
    NoOutputGeneratedError.isInstance(cause)
  ) {
    return new AppError(
      "upstream",
      "ai_answer_unreadable",
      `${who}'s answer couldn't be read. Try again, or pick another model in Settings, Household, AI.`
    )
  }
  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 429) {
      return new AppError(
        "rate_limited",
        "ai_busy",
        `${who} is busy, or the key's reached its provider's rate limit. Try again in a minute.`
      )
    }
    if (cause.statusCode === undefined) {
      return new AppError(
        "upstream",
        "ai_unreachable",
        `${who} couldn't be reached. Try again in a moment.`
      )
    }
    return new AppError(
      "upstream",
      "ai_failed",
      `${who} answered with an error (${cause.statusCode}). Try again in a moment.`
    )
  }
  return error
}

/** What a call can use besides the model. */
export type AiExtras = {
  target: AiTarget
  /** The provider's web search, when the model can search; else none. */
  webSearch: ToolSet | null
}

function extrasFor(target: AiTarget, model: string): AiExtras {
  const known = catalogModel(target.provider, model)
  return {
    target,
    webSearch: known?.abilities.includes("webSearch")
      ? webSearchTools(target)
      : null,
  }
}

/**
 * A model for a household's task that streams, like the assistant: whose
 * key pays is worked out and the limits checked first, as `useAi` does,
 * and `finished` records what the stream took when it's done. A key out
 * of credit is noted by `failed`, for the next message to go elsewhere.
 */
function summarizeAiValue(value: unknown, depth = 4): unknown {
  if (value == null) return value
  if (typeof value === "string")
    return value.length > 6000
      ? `${value.slice(0, 6000)}… [${value.length} chars]`
      : value
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Error)
    return { name: value.name, message: value.message }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return `[binary ${(value as Uint8Array).byteLength ?? value.length} bytes]`
  if (Array.isArray(value)) {
    if (depth <= 0) return `[array ${value.length}]`
    return value
      .slice(0, 30)
      .map((item) => {
        if (item && typeof item === "object") {
          const part = item as Record<string, unknown>
          if (part.type === "image")
            return {
              type: "image",
              mediaType: part.mediaType,
              size: Buffer.isBuffer(part.image)
                ? part.image.length
                : typeof part.image === "string"
                  ? part.image.length
                  : undefined,
            }
          if (part.type === "file")
            return {
              type: "file",
              mediaType: part.mediaType,
              size: Buffer.isBuffer(part.data)
                ? part.data.length
                : typeof part.data === "string"
                  ? part.data.length
                  : undefined,
            }
        }
        return summarizeAiValue(item, depth - 1)
      })
      .concat(value.length > 30 ? [`… ${value.length - 30} more`] : [])
  }
  if (typeof value === "object") {
    if (depth <= 0) return "[object]"
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/key|token|secret|password|authorization|cookie/i.test(k))
        out[k] = "[redacted]"
      else out[k] = summarizeAiValue(v, depth - 1)
    }
    return out
  }
  return String(value)
}

export async function prepareAi(
  deps: AiDeps,
  em: EntityManager,
  options: {
    householdId: string
    userId: string | null
    task: AiTask
    needs?: readonly ModelAbility[]
    aiLog?: { input?: unknown }
  }
) {
  const started = Date.now()
  const resolution = await resolveTask(
    deps,
    em,
    options.householdId,
    options.task
  )
  if (!resolution.ok) throw aiUnavailable(resolution.why)
  const { key, model } = resolution
  const known = catalogModel(key.provider, model)
  const cant = options.needs?.find(
    (ability) => known && !known.abilities.includes(ability)
  )
  if (known && cant) {
    throw new AppError(
      "unprocessable",
      "ai_model_cant",
      `${known.name} can't ${ABILITY_WORDS[cant]}. Pick a model that can in Settings, Household, AI.`
    )
  }
  const target = await targetOf(deps, em, key.id, model)
  deps.logger?.info(
    {
      ai: {
        event: "prepared",
        task: options.task,
        provider: key.provider,
        model,
        source: key.source,
        householdId: options.householdId,
        userId: options.userId,
        input: summarizeAiValue(options.aiLog?.input),
      },
    },
    "AI prepared"
  )
  return {
    model: deps.ai(target),
    ...extrasFor(target, model),
    async finished(usage: LanguageModelUsage, output?: unknown) {
      await clearOutOfCredit(deps, em, key.id)
      await recordUsage(em, {
        householdId: options.householdId,
        userId: options.userId,
        task: options.task,
        provider: key.provider,
        model,
        source: key.source,
        keyId: key.id,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      })
      deps.logger?.info(
        {
          ai: {
            event: "finished",
            ok: true,
            task: options.task,
            provider: key.provider,
            model,
            source: key.source,
            householdId: options.householdId,
            userId: options.userId,
            ms: Date.now() - started,
            inputTokens: usage.inputTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
            output: summarizeAiValue(output),
          },
        },
        "AI finished"
      )
    },
    async failed(error: unknown) {
      if (isOutOfCredit(error)) await markOutOfCredit(deps, em, key.id)
      deps.logger?.warn(
        {
          ai: {
            event: "failed",
            ok: false,
            task: options.task,
            provider: key.provider,
            model,
            source: key.source,
            householdId: options.householdId,
            userId: options.userId,
            ms: Date.now() - started,
            ...errorDetail(error),
          },
        },
        "AI failed"
      )
      return callFailed(error, key.provider)
    },
    /** What went wrong, in words to show. */
    explain(error: unknown) {
      const failure = callFailed(error, key.provider)
      return failure instanceof AppError
        ? failure.message
        : "Something went wrong. Try again in a moment."
    },
  }
}

/**
 * Runs an AI call for a household's task. `call` gets the model to use and
 * returns what AI SDK did, its usage included.
 */
export async function useAi<T extends { usage: LanguageModelUsage }>(
  deps: AiDeps,
  em: EntityManager,
  options: {
    householdId: string
    /** Who asked; none for background work. */
    userId: string | null
    task: AiTask
    /** A rough cost, in US dollars, checked against the limits first. */
    estimate?: number
    /**
     * What the model must be able to do, like read photos. Checked for the
     * models Merran knows; an address's are tried as they are.
     */
    needs?: readonly ModelAbility[]
    /** Use this model instead of the task's resolved model, when set. */
    modelRef?: string
    /** Input/output to include in AI processing logs (sanitized). */
    aiLog?: {
      input?: unknown
      output?: (result: any) => unknown
      /** Full request payload/messages sent to the model for debugging. */
      rawRequest?: unknown
    }
  },
  call: (model: LanguageModel, extras: AiExtras) => Promise<T>
): Promise<T> {
  // A key that turns out to be out of credit is noted, and the next tried:
  // a few at most.
  const started = Date.now()
  const outOfCredit: string[] = []
  for (let tries = 0; tries < 5; tries++) {
    const resolution = await resolveTask(
      deps,
      em,
      options.householdId,
      options.task,
      options.estimate,
      options.modelRef
    )
    if (!resolution.ok) {
      if (outOfCredit.length > 0) throw outOfCreditError(outOfCredit[0]!)
      throw aiUnavailable(resolution.why)
    }
    const { key, model } = resolution
    const known = catalogModel(key.provider, model)
    const cant = options.needs?.find(
      (ability) => known && !known.abilities.includes(ability)
    )
    if (known && cant) {
      throw new AppError(
        "unprocessable",
        "ai_model_cant",
        `${known.name} can't ${ABILITY_WORDS[cant]}. Pick a model that can in Settings, Household, AI.`
      )
    }
    const target = await targetOf(deps, em, key.id, model)
    deps.logger?.info(
      {
        ai: {
          event: "call",
          task: options.task,
          provider: key.provider,
          model,
          source: key.source,
          modelRef: options.modelRef ?? null,
          householdId: options.householdId,
          userId: options.userId,
          input: summarizeAiValue(options.aiLog?.input),
          rawRequest: options.aiLog?.rawRequest,
        },
      },
      "AI call"
    )
    let result: T
    try {
      result = await call(deps.ai(target), extrasFor(target, model))
    } catch (error) {
      deps.logger?.warn(
        {
          ai: {
            event: "error",
            ok: false,
            task: options.task,
            provider: key.provider,
            model,
            source: key.source,
            ms: Date.now() - started,
            ...errorDetail(error),
          },
        },
        "AI error"
      )
      if (!isOutOfCredit(error)) throw callFailed(error, key.provider)
      await markOutOfCredit(deps, em, key.id)
      outOfCredit.push(PROVIDER_NAMES[key.provider])
      continue
    }
    await clearOutOfCredit(deps, em, key.id)
    await recordUsage(em, {
      householdId: options.householdId,
      userId: options.userId,
      task: options.task,
      provider: key.provider,
      model,
      source: key.source,
      keyId: key.id,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    })
    const rawResponse = (() => {
      try {
        const r = result as Record<string, unknown>
        const body: Record<string, unknown> = {}
        const read = (key: string) => {
          try {
            return r[key]
          } catch {
            return undefined
          }
        }
        const text = read("text")
        if (typeof text === "string") body.text = text
        const reasoningText = read("reasoningText")
        if (typeof reasoningText === "string")
          body.reasoningText = reasoningText
        const output = read("output")
        if (output !== undefined) body.output = output
        const object = read("object")
        if (object !== undefined) body.object = object
        const response = read("response")
        if (response && typeof response === "object") {
          const res = response as Record<string, unknown>
          body.responseBody = res.body
          body.responseId = res.id
          body.responseModelId = res.modelId
          body.headers = res.headers
        }
        const request = read("request")
        if (request && typeof request === "object") body.request = request
        const warnings = read("warnings")
        if (Array.isArray(warnings) && warnings.length > 0)
          body.warnings = warnings
        const finishReason = read("finishReason")
        if (finishReason) body.finishReason = finishReason
        const steps = read("steps")
        if (Array.isArray(steps) && steps.length > 0)
          body.stepCount = steps.length
        return Object.keys(body).length > 0 ? body : undefined
      } catch {
        return undefined
      }
    })()
    deps.logger?.info(
      {
        ai: {
          event: "result",
          ok: true,
          task: options.task,
          provider: key.provider,
          model,
          source: key.source,
          ms: Date.now() - started,
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          output: summarizeAiValue(
            (() => {
              try {
                return options.aiLog?.output?.(result)
              } catch {
                return undefined
              }
            })()
          ),
          rawResponse,
        },
      },
      "AI result"
    )
    return result
  }
  throw outOfCreditError(outOfCredit[0] ?? "The provider")
}
