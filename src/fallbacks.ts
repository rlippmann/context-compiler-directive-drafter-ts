import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { get_directive_metadata } from "@rlippmann/context-compiler/grammar";

export type DraftFallback = (userInput: string) => string | null;
export type AsyncDraftFallback = (userInput: string) => Promise<string | null>;

export class InvalidFallbackResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFallbackResponseError";
  }
}

export type FallbackProfileOptions = {
  structuredOutput?: boolean;
  allowedDirectiveKinds?: readonly string[] | null;
};

export class FallbackProfile {
  readonly systemPrompt: string;
  readonly mode: "free_text" | "structured";
  readonly responseSchema: Readonly<Record<string, unknown>> | null;
  readonly abstentionSentinel: string | null;

  constructor(systemPrompt: string, mode: "free_text" | "structured", responseSchema: Readonly<Record<string, unknown>> | null, abstentionSentinel: string | null) {
    this.systemPrompt = systemPrompt;
    this.mode = mode;
    this.responseSchema = responseSchema;
    this.abstentionSentinel = abstentionSentinel;
    Object.freeze(this);
  }
}

const STRUCTURED_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    classification: { type: "string", enum: ["directive", "rejected"] },
    output: { anyOf: [{ type: "string" }, { type: "null" }] }
  },
  required: ["classification", "output"],
  additionalProperties: false
} as const;

function promptPath(name: string): string {
  return fileURLToPath(new URL(`../prompts/${name}`, import.meta.url));
}

function readPrompt(name: string): string {
  return readFileSync(promptPath(name), "utf8").replace(/\n$/u, "");
}

function restrictedPromptName(structuredOutput: boolean, allowed: readonly string[]): string {
  if (allowed.length === 1 && allowed[0] === "use_item") {
    return structuredOutput ? "fallback-restricted-structured-use-item-v1.txt" : "fallback-restricted-use-item-v1.txt";
  }
  return structuredOutput ? "fallback-structured-v1.txt" : "fallback-free-text-v1.txt";
}

export function getFallbackProfile(options: FallbackProfileOptions = {}): FallbackProfile {
  const structuredOutput = options.structuredOutput ?? false;
  const allowed = options.allowedDirectiveKinds == null ? null : [...new Set(options.allowedDirectiveKinds)].sort();
  if (allowed !== null) {
    const known = new Set<string>(get_directive_metadata().map((metadata) => metadata.kind));
    const unknown = allowed.filter((kind) => !known.has(kind));
    if (unknown.length > 0) throw new Error(`Unknown directive kinds: ${JSON.stringify(unknown)}`);
  }
  const mode = structuredOutput ? "structured" : "free_text";
  const prompt = allowed === null
    ? readPrompt(structuredOutput ? "fallback-structured-v1.txt" : "fallback-free-text-v1.txt")
    : readPrompt(restrictedPromptName(structuredOutput, allowed));
  return new FallbackProfile(
    prompt,
    mode,
    structuredOutput ? structuredResponseSchema() : null,
    structuredOutput ? null : "<NO_DIRECTIVE>"
  );
}

function structuredResponseSchema(): Readonly<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(STRUCTURED_RESPONSE_SCHEMA)) as Readonly<Record<string, unknown>>;
}

export function parseStructuredResponse(content: string): string | null {
  let envelope: unknown;
  try { envelope = JSON.parse(content) as unknown; } catch (error) { throw new InvalidFallbackResponseError("structured fallback response is not JSON"); }
  if (typeof envelope !== "object" || envelope === null || Array.isArray(envelope)) throw new InvalidFallbackResponseError("structured fallback response has an invalid envelope");
  const record = envelope as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !Object.hasOwn(record, "classification") || !Object.hasOwn(record, "output")) throw new InvalidFallbackResponseError("structured fallback response has an invalid envelope");
  if (record.classification === "directive" && typeof record.output === "string") return record.output;
  if (record.classification === "rejected" && record.output === null) return null;
  throw new InvalidFallbackResponseError("structured fallback response is inconsistent");
}
