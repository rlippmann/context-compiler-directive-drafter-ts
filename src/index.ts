import { readFileSync } from "node:fs";

import { CanonicalDirective, decompose_directive } from "@rlippmann/context-compiler/grammar";

export const PREPROCESSOR_NO_DIRECTIVE_SENTINEL = "<NO_DIRECTIVE>";
export const PREPROCESS_OUTCOME_DIRECTIVE = "directive";
export const PREPROCESS_OUTCOME_REJECTED = "rejected";
export const PREPROCESS_OUTCOME_UNKNOWN = "unknown";

export type PreprocessorValidationResult = { classification: "directive" | "rejected"; output: string | null };
export type PreprocessorReason = "non_directive" | "incomplete" | "multiple_directives" | "invalid_candidate" | "semantic_uncertainty";
export type PreprocessorHeuristicResult =
  | { outcome: "directive"; directive: CanonicalDirective }
  | { outcome: "rejected" | "unknown"; directive: null; reason: PreprocessorReason };
type InternalReason = "ordinary_non_directive" | "question_form" | "quoted_reported" | "incomplete_directive" | "compound_directive" | "multi_sentence" | "malformed_directive" | "unsupported_input" | "semantic_uncertainty";
type EngineState = { premise: string | null; policies: Record<string, unknown> };

const PROMPT_TOKEN_NULL_OR_VALUE = "<NULL_OR_VALUE>";
const PROMPT_TOKEN_POLICY_SET = "<SET OF CURRENT POLICY ITEMS>";
const WRAPPER_PAIRS = new Set(["\"\"", "''", "``", "()", "[]"]);
const LIST_MARKER_PATTERN = /^\s*(?:\d+[.)]|[-*])\s+\S/u;
const META_PREFIX_PATTERN = /^\s*(?:example:|for example\b|the command is\b|(?:i|he|she|they) said\b)/iu;
const REPORTING_QUOTED_PATTERN = /^\s*.+?\s+(?:literally\s+)?(?:say|says?|said|wrote|quoted|told)\b(?:\s+\w+)?\s*[:,]?\s*["'`].+["'`][.!]?\s*$/iu;
const INCOMPLETE_PROHIBIT_PATTERN = /^prohibit\s+\S(?:.*\S)?\s+(?:to|with)$/iu;
const SET_PREMISE_TO_PATTERN = /^set premise to (?<payload>\S(?:.*\S)?)$/iu;
const CHANGE_PREMISE_MISSING_TO_PATTERN = /^change premise (?!to(?:\s|$))(?<payload>\S(?:.*\S)?)$/iu;
const PLEASE_PREFIX_PATTERN = /^please (?<directive>\S(?:.*\S)?)$/iu;
const PREFERENCE_PREFIX_PATTERN = /^i prefer (?<payload>\S(?:.*\S)?)$/iu;
const ALLOW_ALIAS_PATTERN = /^allow (?<item>\S(?:.*\S)?)$/iu;
const PROHIBIT_ALIAS_PATTERN = /^(?:do not|don't) use (?<item>\S(?:.*\S)?)$/iu;
const STOP_USING_ALIAS_PATTERN = /^stop using (?<item>\S(?:.*\S)?)$/iu;
const TRANSPOSED_PROHIBIT_PATTERN = /^set policy (?<item>\S(?:.*\S)?) prohibit$/iu;
const REPLACE_MISSING_OF_PATTERN = /^use (?<newItem>\S(?:.*\S)?) instead (?!of(?:\s|$))(?<oldItem>\S(?:.*\S)?)$/iu;
const REPLACE_SPLIT_OF_PATTERN = /^use (?<newItem>\S(?:.*\S)?) in stead of (?<oldItem>\S(?:.*\S)?)$/iu;
const AMBIGUOUS_ALIAS_PATTERNS = [/^use\s+instead\s+of\s+\S(?:.*\S)?$/iu, /^use\s+\S(?:.*\S)?\s+not\s+\S(?:.*\S)?$/iu];
const UNSUPPORTED_ALIAS_PATTERNS = [/^wipe\s+policies$/iu, /^reset policy$/iu, /^remove policies\s+\S(?:.*\S)?$/iu];
const MALFORMED_LOOKALIKE_PATTERN = /^\s*[^\s]*[^\x00-\x7f][^\s]*\s+\S(?:.*\S)?$/u;
const SENTENCE_BOUNDARY_PATTERN = /(?<!\d)[.!?](?!\d)(?:["')\]]+)?\s+(?=[A-Za-z])/gu;
const CONFIDENT_NON_DIRECTIVE_PATTERN = /^\s*(?:hi|hello|hey|good (?:morning|afternoon|evening)|thank you|thanks(?: for (?:the|your) help(?: today)?| a lot)?)\s*[.!]?\s*$/iu;
const REPORTING_BRACKET_MARKERS = ["in my notes", "notes:", "i wrote down"];

function normalizedForMatch(message: string): string { return message.replace(/\s+/gu, " ").trim().toLowerCase(); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
function directiveStarts(): string[] { return ["change premise to", "set premise", "remove policy", "reset policies", "clear premise", "clear state", "prohibit", "use"]; }
function directiveCues(): string[] { return [...new Set([...directiveStarts(), "change premise"])]; }
function startsPattern(starts: string[]): RegExp { return new RegExp(`(?:${starts.map(escapeRegExp).join("|")})\\b`, "giu"); }
function hasMultipleDirectiveStarts(message: string): boolean { return [...normalizedForMatch(message).matchAll(startsPattern(directiveStarts()))].length > 1; }
function containsDirectiveCue(message: string): boolean { return new RegExp(`\\b(?:${directiveCues().map(escapeRegExp).join("|")})\\b`, "i").test(message); }
function matchesMultiSegment(message: string): boolean { return new RegExp(`^\\s*(?:${directiveStarts().map(escapeRegExp).join("|")})\\b.*\\b(?:because|then continue|and then continue|and explain|and summarize|and find|and tell)\\b`, "i").test(message); }
function hasObviousSentenceBoundary(message: string): boolean {
  for (const match of message.matchAll(SENTENCE_BOUNDARY_PATTERN)) {
    const preceding = message.slice(0, match.index).trim().toLowerCase();
    if (["e.g", "i.e", "mr", "ms", "dr", "etc"].some((suffix) => preceding.endsWith(suffix))) continue;
    const following = message.slice((match.index ?? 0) + match[0].length).trim();
    const words = following.match(/[A-Za-z]+(?:['-][A-Za-z]+)?/gu) ?? [];
    if (words.length >= 2 || /^(?:thanks|thank you)(?:[.!?]|$)/iu.test(following)) return true;
  }
  return false;
}
function containsReportingBracketMention(message: string): boolean { const lower = message.toLowerCase(); return lower.includes("[") && lower.includes("]") && REPORTING_BRACKET_MARKERS.some((marker) => lower.includes(marker)); }
function stripTerminalPunctuation(message: string): string { return message.replace(/[.!]+\s*$/u, "").trim(); }
function stripExactWrapper(message: string): string { const stripped = message.trim(); if (stripped.length < 2 || !WRAPPER_PAIRS.has(`${stripped[0]}${stripped.at(-1)}`)) return stripped; return stripped.slice(1, -1).trim(); }
function normalizeCandidate(message: string): string { return normalizedForMatch(stripExactWrapper(stripTerminalPunctuation(message))); }
function isQuotedOrBacktickWrapped(message: string): boolean { const stripped = message.trim(); return stripped.length >= 2 && new Set(["\"\"", "''", "``"]).has(`${stripped[0]}${stripped.at(-1)}`); }
function isIncompleteDirective(message: string): boolean { return new Set(["use", "prohibit", "remove policy", "change premise", "change premise to", "set premise", "set premise to"]).has(message) || message.endsWith(" instead of") || message.startsWith("use instead of ") || INCOMPLETE_PROHIBIT_PATTERN.test(message); }
function rewriteBoundedCandidate(message: string): string {
  let current = message;
  const rewrites: [RegExp, (match: RegExpMatchArray) => string][] = [
    [PLEASE_PREFIX_PATTERN, (m) => m.groups?.directive ?? ""],
    [PREFERENCE_PREFIX_PATTERN, (m) => /\bi prefer\b/iu.test(m.groups?.payload ?? "") ? current : `use ${m.groups?.payload ?? ""}`],
    [SET_PREMISE_TO_PATTERN, (m) => `set premise ${m.groups?.payload ?? ""}`],
    [CHANGE_PREMISE_MISSING_TO_PATTERN, (m) => `change premise to ${m.groups?.payload ?? ""}`],
    [ALLOW_ALIAS_PATTERN, (m) => `use ${m.groups?.item ?? ""}`],
    [PROHIBIT_ALIAS_PATTERN, (m) => `prohibit ${m.groups?.item ?? ""}`],
    [STOP_USING_ALIAS_PATTERN, (m) => `prohibit ${m.groups?.item ?? ""}`],
    [TRANSPOSED_PROHIBIT_PATTERN, (m) => `prohibit ${m.groups?.item ?? ""}`],
    [REPLACE_MISSING_OF_PATTERN, (m) => `use ${m.groups?.newItem ?? ""} instead of ${m.groups?.oldItem ?? ""}`],
    [REPLACE_SPLIT_OF_PATTERN, (m) => `use ${m.groups?.newItem ?? ""} instead of ${m.groups?.oldItem ?? ""}`]
  ];
  for (const [pattern, replacement] of rewrites) { const match = current.match(pattern); if (match) current = replacement(match); }
  return current;
}
function publicReason(reason: InternalReason): PreprocessorReason { if (reason === "semantic_uncertainty") return reason; if (reason === "incomplete_directive") return "incomplete"; if (reason === "compound_directive" || reason === "unsupported_input") return "multiple_directives"; if (reason === "malformed_directive") return "invalid_candidate"; return "non_directive"; }
function rejected(reason: InternalReason): PreprocessorHeuristicResult { return { outcome: "rejected", directive: null, reason: publicReason(reason) }; }
function unknown(reason: InternalReason): PreprocessorHeuristicResult { return { outcome: "unknown", directive: null, reason: publicReason(reason) }; }

export function preprocess_heuristic(message: string): PreprocessorHeuristicResult {
  if (LIST_MARKER_PATTERN.test(message)) return rejected("unsupported_input");
  const normalized = normalizedForMatch(message);
  if (message.includes("?") && (containsDirectiveCue(normalized) || /^(?:please|allow|(?:do not|don't) use|stop using|set premise|change premise|use)\b/i.test(normalized) || normalized.startsWith("i prefer"))) return rejected("question_form");
  if (message.includes("?")) return rejected("ordinary_non_directive");
  if (CONFIDENT_NON_DIRECTIVE_PATTERN.test(message)) return rejected("ordinary_non_directive");
  if (META_PREFIX_PATTERN.test(normalized)) return rejected("quoted_reported");
  if (matchesMultiSegment(normalized)) return rejected("compound_directive");
  if (containsReportingBracketMention(message) || isQuotedOrBacktickWrapped(message) || REPORTING_QUOTED_PATTERN.test(message)) return rejected("quoted_reported");
  if (![...message].some((character) => /\p{L}/u.test(character))) return rejected("ordinary_non_directive");
  if (MALFORMED_LOOKALIKE_PATTERN.test(message)) return rejected("malformed_directive");
  if (hasObviousSentenceBoundary(message)) return rejected("multi_sentence");
  let candidate = normalizeCandidate(message);
  if (candidate.startsWith("i prefer ") && (candidate.includes(" because ") || candidate.includes(" and i prefer "))) return unknown("semantic_uncertainty");
  candidate = rewriteBoundedCandidate(candidate);
  if (candidate.length >= 2 && /^["'`([].*["'`)]$/u.test(candidate) && !WRAPPER_PAIRS.has(`${candidate[0]}${candidate.at(-1)}`)) return rejected("malformed_directive");
  if (matchesMultiSegment(candidate)) return rejected("compound_directive");
  if (AMBIGUOUS_ALIAS_PATTERNS.some((pattern) => pattern.test(candidate))) return rejected("compound_directive");
  if (isIncompleteDirective(candidate)) return rejected("incomplete_directive");
  if (UNSUPPORTED_ALIAS_PATTERNS.some((pattern) => pattern.test(candidate))) return rejected("malformed_directive");
  if (hasMultipleDirectiveStarts(candidate)) return rejected("compound_directive");
  const decomposed = decompose_directive(candidate);
  if (decomposed instanceof CanonicalDirective) return { outcome: "directive", directive: decomposed };
  if (decomposed !== null) return rejected(isIncompleteDirective(candidate) ? "incomplete_directive" : "malformed_directive");
  if (/^\s*(?:please|allow|(?:do not|don't) use|stop using|set premise|change premise|use)\b/i.test(candidate)) return rejected("malformed_directive");
  return unknown("semantic_uncertainty");
}
export const preprocessHeuristic = preprocess_heuristic;

function rejectedResult(): PreprocessorValidationResult { return { classification: "rejected", output: null }; }
function validateStructuredOutput(rawOutput: unknown): PreprocessorValidationResult {
  if (typeof rawOutput !== "object" || rawOutput === null || Array.isArray(rawOutput)) return rejectedResult();
  const record = rawOutput as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !Object.hasOwn(record, "classification") || !Object.hasOwn(record, "output")) return rejectedResult();
  if (record.classification === "directive" && typeof record.output === "string") { const parsed = decompose_directive(record.output.trim()); return parsed instanceof CanonicalDirective ? { classification: "directive", output: parsed.text } : rejectedResult(); }
  return rejectedResult();
}
function validateTextOutput(rawOutput: string): PreprocessorValidationResult {
  const stripped = rawOutput.trim();
  if (!stripped || stripped.toUpperCase() === PREPROCESSOR_NO_DIRECTIVE_SENTINEL) return rejectedResult();
  const parsed = decompose_directive(stripped);
  if (parsed instanceof CanonicalDirective) return { classification: "directive", output: parsed.text };
  if (stripped[0] === "{" || stripped[0] === "[") { try { return validateStructuredOutput(JSON.parse(stripped) as unknown); } catch { return rejectedResult(); } }
  return rejectedResult();
}
export function validate_preprocessor_output(raw_output: unknown): PreprocessorValidationResult { return typeof raw_output === "string" ? validateTextOutput(raw_output) : validateStructuredOutput(raw_output); }
export const validatePreprocessorOutput = validate_preprocessor_output;
export function parse_preprocessor_output(raw_output: unknown): string | null { const result = validate_preprocessor_output(raw_output); return result.classification === "directive" ? result.output : null; }
export const parsePreprocessorOutput = parse_preprocessor_output;

function stripLeadingHeaders(promptTemplate: string): string { const lines = promptTemplate.split(/\r?\n/); if (/\r?\n$/.test(promptTemplate) && lines.at(-1) === "") lines.pop(); let start = 0; while (start < lines.length && (lines[start]!.trim() === "" || lines[start]!.trimStart().startsWith("#"))) start += 1; return lines.slice(start).join("\n"); }
function normalizeItem(input: string): string { let out = input.toLowerCase().normalize("NFKC").replace(/[\u2018\u2019]/gu, "'").replace(/[\s_-]+/gu, " ").trim(); for (const prefix of ["the ", "a ", "an "]) if (out.startsWith(prefix)) { out = out.slice(prefix.length).trim(); break; } return out.replace(/\bdont\b/gu, "don't"); }
export function render_prompt(path: string, state: EngineState): string | null { if (typeof path !== "string") return null; let template: string; try { template = readFileSync(path, "utf8"); } catch { return null; } const premise = state.premise === null ? "null" : state.premise; const policies = [...new Set(Object.keys(state.policies).map(normalizeItem).filter(Boolean))].sort((a, b) => a.localeCompare(b)); return stripLeadingHeaders(template).replaceAll(PROMPT_TOKEN_NULL_OR_VALUE, premise).replaceAll(PROMPT_TOKEN_POLICY_SET, policies.length ? policies.join(", ") : "(none)"); }
export const renderPrompt = render_prompt;
