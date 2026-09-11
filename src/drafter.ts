import { CanonicalDirective, decomposeDirective } from "@rlippmann/context-compiler/grammar";

import {
  InvalidFallbackResponseError,
  type AsyncDraftFallback,
  type DraftFallback
} from "./fallbacks.js";
import {
  parse_preprocessor_output,
  preprocess_heuristic,
  validate_preprocessor_output,
  type PreprocessorReason
} from "./preprocessor.js";

export type RejectedReason = "non_directive" | "incomplete" | "multiple_directives" | "invalid_candidate";
export const REASON_NON_DIRECTIVE = "non_directive" as const;
export const REASON_INCOMPLETE = "incomplete" as const;
export const REASON_MULTIPLE_DIRECTIVES = "multiple_directives" as const;
export const REASON_INVALID_CANDIDATE = "invalid_candidate" as const;

export class UnknownDirective {
  readonly reason = "semantic_uncertainty" as const;
  constructor(reason: "semantic_uncertainty") { this.reason = reason; Object.freeze(this); }
}

export class RejectedDirective {
  readonly reason: RejectedReason;
  constructor(reason: RejectedReason) { this.reason = reason; Object.freeze(this); }
}

export type DraftedDirective = CanonicalDirective | RejectedDirective | UnknownDirective;

export class DraftResult {
  readonly source: string;
  readonly result: DraftedDirective;
  constructor(source: string, result: DraftedDirective) { this.source = source; this.result = result; Object.freeze(this); }
}

function rejectedReason(reason: PreprocessorReason): RejectedReason {
  if (reason === "incomplete") return REASON_INCOMPLETE;
  if (reason === "multiple_directives") return REASON_MULTIPLE_DIRECTIVES;
  return reason === "invalid_candidate" ? REASON_INVALID_CANDIDATE : REASON_NON_DIRECTIVE;
}

function fromHeuristic(userInput: string): DraftResult {
  const heuristic = preprocess_heuristic(userInput);
  if (heuristic.outcome === "directive") return new DraftResult("heuristic", heuristic.directive);
  if (heuristic.outcome === "unknown") return new DraftResult("heuristic", new UnknownDirective("semantic_uncertainty"));
  return new DraftResult("heuristic", new RejectedDirective(rejectedReason(heuristic.reason)));
}

function fromFallbackOutput(output: string | null, source: string): DraftResult {
  if (output === null || output.trim().toUpperCase() === "<NO_DIRECTIVE>") return new DraftResult(source, new RejectedDirective(REASON_NON_DIRECTIVE));
  const validated = validate_preprocessor_output(output);
  if (validated.classification !== "directive" || validated.output === null) return new DraftResult(source, new RejectedDirective(REASON_INVALID_CANDIDATE));
  const parsed = parse_preprocessor_output(validated.output);
  if (parsed === null) return new DraftResult(source, new RejectedDirective(REASON_INVALID_CANDIDATE));
  const parsedDirective = decomposeDirective(parsed);
  if (!(parsedDirective instanceof CanonicalDirective)) return new DraftResult(source, new RejectedDirective(REASON_INVALID_CANDIDATE));
  return new DraftResult(source, parsedDirective);
}

export class DirectiveDrafter {
  #fallback: DraftFallback | null = null;
  #fallbackSource = "fallback";
  #asyncFallback: AsyncDraftFallback | null = null;
  #asyncFallbackSource = "fallback";

  constructor(fallback: DraftFallback | null = null, fallbackSource = "fallback", asyncFallback: AsyncDraftFallback | null = null, asyncFallbackSource = "fallback") {
    if (fallback !== null) this.configure_fallback(fallback, fallbackSource);
    if (asyncFallback !== null) this.configure_async_fallback(asyncFallback, asyncFallbackSource);
  }
  get fallback(): boolean { return this.#fallback !== null; }
  get async_fallback(): boolean { return this.#asyncFallback !== null; }
  configure_fallback(fallback: DraftFallback, source: string): void { this.#fallback = fallback; this.#fallbackSource = source; }
  clear_fallback(): void { this.#fallback = null; }
  configure_async_fallback(fallback: AsyncDraftFallback, source: string): void { this.#asyncFallback = fallback; this.#asyncFallbackSource = source; }
  clear_async_fallback(): void { this.#asyncFallback = null; }
  draft_directive(userInput: string): DraftResult {
    const heuristic = fromHeuristic(userInput);
    if (!(heuristic.result instanceof UnknownDirective) || this.#fallback === null) return heuristic;
    try { return fromFallbackOutput(this.#fallback(userInput), this.#fallbackSource); }
    catch (error) { if (error instanceof InvalidFallbackResponseError) return new DraftResult(this.#fallbackSource, new RejectedDirective(REASON_INVALID_CANDIDATE)); throw error; }
  }
  async async_draft_directive(userInput: string): Promise<DraftResult> {
    const heuristic = fromHeuristic(userInput);
    if (!(heuristic.result instanceof UnknownDirective) || this.#asyncFallback === null) return heuristic;
    try { return fromFallbackOutput(await this.#asyncFallback(userInput), this.#asyncFallbackSource); }
    catch (error) { if (error instanceof InvalidFallbackResponseError) return new DraftResult(this.#asyncFallbackSource, new RejectedDirective(REASON_INVALID_CANDIDATE)); throw error; }
  }
}
