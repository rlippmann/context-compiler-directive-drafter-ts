import { CanonicalDirective, decomposeDirective, getDirectiveMetadata } from "@rlippmann/context-compiler/grammar";
import { canonicalFormFromMetadata, renderCanonicalFormsFromMetadata } from "./grammar-derivation.js";
import {
  FALLBACK_FREE_TEXT_PROMPT,
  FALLBACK_RESTRICTED_STRUCTURED_USE_ITEM_PROMPT,
  FALLBACK_RESTRICTED_USE_ITEM_PROMPT,
  FALLBACK_STRUCTURED_PROMPT
} from "./fallback-prompts.js";

export type DraftFallback = (userInput: string) => string | null;
export type AsyncDraftFallback = (userInput: string) => Promise<string | null>;

export class InvalidFallbackResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFallbackResponseError";
  }
}

type FallbackProfileOptions = {
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

function promptTemplate(structuredOutput: boolean, restrictedUseItem: boolean): string {
  if (restrictedUseItem) return structuredOutput ? FALLBACK_RESTRICTED_STRUCTURED_USE_ITEM_PROMPT : FALLBACK_RESTRICTED_USE_ITEM_PROMPT;
  return structuredOutput ? FALLBACK_STRUCTURED_PROMPT : FALLBACK_FREE_TEXT_PROMPT;
}

function directiveCategory(prompt: string, form: string): string {
  const line = prompt.split("\n").find((candidate) => candidate.startsWith(`- \`${form}\` (`));
  return line?.match(/\(([^()]*)\)$/u)?.[1] ?? "Policy";
}

function renderCanonicalForms(prompt: string, allowed: readonly string[] | null): string {
  const metadata = getDirectiveMetadata().filter((item) => allowed === null || allowed.includes(item.kind));
  const categoryByKind = Object.fromEntries(metadata.map((item) => {
    const form = canonicalFormFromMetadata(item);
    return [item.kind, directiveCategory(prompt, form)];
  }));
  const forms = renderCanonicalFormsFromMetadata(metadata, categoryByKind);
  const start = prompt.indexOf("Canonical directive forms:");
  const end = prompt.indexOf("\n\nWhat premise vs policy means:", start);
  if (start < 0 || end < 0) throw new Error("fallback prompt is missing canonical directive forms");
  return `${prompt.slice(0, start)}${forms}${prompt.slice(end)}`;
}

function filterExamples(prompt: string, heading: string, nextHeading: string, allowed: readonly string[]): string {
  const start = prompt.indexOf(heading);
  const end = prompt.indexOf(nextHeading, start);
  if (start < 0 || end < 0) throw new Error(`fallback prompt is missing ${heading}`);
  const section = prompt.slice(start, end);
  const blocks = section.slice(heading.length).split("\n\n");
  const kept = blocks.filter((block) => {
    const output = block.match(/^(?:Source:|User:)[\s\S]*?\n(?:Correct candidate:|Output:) (.+)$/u)?.[1];
    if (output === undefined) return block.trim() === "";
    const directive = decomposeDirective(output);
    return directive instanceof CanonicalDirective && allowed.includes(directive.kind);
  });
  return `${prompt.slice(0, start)}${heading}${kept.length ? `\n\n${kept.join("\n\n")}` : ""}${prompt.slice(end)}`;
}

function renderDynamicRestrictedPrompt(structuredOutput: boolean, allowed: readonly string[]): string {
  let prompt = promptTemplate(structuredOutput, false);
  prompt = renderCanonicalForms(prompt, allowed);
  prompt = filterExamples(prompt, "Scope and payload contrast examples:", "Examples of user requests that may be drafted as directives:", allowed);
  prompt = filterExamples(prompt, "Examples of user requests that may be drafted as directives:", structuredOutput ? "Contrastive examples:": "Examples of ordinary conversation that must not become directives:", allowed);
  const restriction = `Directive-kind restriction (hard boundary):\n- Only these directive kinds may be proposed: ${allowed.map((kind) => `\`${kind}\``).join(", ") || "none"}.\n- If the user request cannot be represented by exactly one of these kinds, abstain using the output contract below.\n- Never propose a directive of any other kind, even if the request would be representable by that kind or general guidance mentions it.`;
  const marker = structuredOutput ? "\n\nScope and payload contrast examples:" : "\n\nScope and payload contrast examples:";
  return prompt.replace(marker, `\n\n${restriction}${marker}`);
}

export function getFallbackProfile(options: FallbackProfileOptions = {}): FallbackProfile {
  const structuredOutput = options.structuredOutput ?? false;
  const allowed = options.allowedDirectiveKinds == null ? null : [...new Set(options.allowedDirectiveKinds)].sort();
  if (allowed !== null) {
    const known = new Set<string>(getDirectiveMetadata().map((metadata) => metadata.kind));
    const unknown = allowed.filter((kind) => !known.has(kind));
    if (unknown.length > 0) throw new Error(`Unknown directive kinds: ${JSON.stringify(unknown)}`);
  }
  const mode = structuredOutput ? "structured" : "free_text";
  const restrictedUseItem = allowed !== null && allowed.length === 1 && allowed[0] === "use_item";
  let prompt = promptTemplate(structuredOutput, restrictedUseItem);
  prompt = renderCanonicalForms(prompt, allowed);
  if (allowed !== null && !restrictedUseItem) prompt = renderDynamicRestrictedPrompt(structuredOutput, allowed);
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
