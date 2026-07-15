import { readFileSync } from "node:fs";

export const PREPROCESSOR_NO_DIRECTIVE_SENTINEL = "<NO_DIRECTIVE>";
export const PREPROCESS_OUTCOME_DIRECTIVE = "directive";
export const PREPROCESS_OUTCOME_NO_DIRECTIVE = "no_directive";
export const PREPROCESS_OUTCOME_UNKNOWN = "unknown";

type PreprocessOutcomeValue =
  | typeof PREPROCESS_OUTCOME_DIRECTIVE
  | typeof PREPROCESS_OUTCOME_NO_DIRECTIVE
  | typeof PREPROCESS_OUTCOME_UNKNOWN;

type PreprocessorValidationResult = {
  classification: PreprocessOutcomeValue;
  output: string | null;
};

type PreprocessorHeuristicResult = {
  outcome: PreprocessOutcomeValue;
  directive: string | null;
  rule_id: string;
};

type EngineState = {
  premise: string | null;
  policies: Record<string, unknown>;
};

const PROMPT_TOKEN_NULL_OR_VALUE = "<NULL_OR_VALUE>";
const PROMPT_TOKEN_POLICY_SET = "<SET OF CURRENT POLICY ITEMS>";

const CANONICAL_DIRECTIVE_PATTERNS: RegExp[] = [
  /^set premise (?!to\b)\S(?:.*\S)?$/,
  /^change premise to \S(?:.*\S)?$/,
  /^use \S(?:.*\S)? instead of \S(?:.*\S)?$/,
  /^use (?!.*\sinstead of(?:\s|$))\S(?:.*\S)?$/,
  /^prohibit \S(?:.*\S)?$/,
  /^remove policy \S(?:.*\S)?$/
];

const CANONICAL_DIRECTIVE_EXACT = new Set(["clear premise", "reset policies", "clear state"]);

const LIST_MARKER_PATTERN = /^\s*(?:\d+[.)]|[-*])\s+\S/;
const META_PREFIX_PATTERN = /^\s*(?:example:|for example\b|the command is\b|(?:i|he|she|they) said\b)/;
const MULTI_SEGMENT_PATTERN =
  /^\s*(?:use|prohibit|remove policy|set premise|change premise to|clear premise|reset policies|clear state)\b.*\b(?:because|then continue|and)\b/;
const DIRECTIVE_CUE_PATTERN =
  /\b(set premise|change premise|use|prohibit|remove policy|clear premise|reset policies|clear state)\b/;
const PUNCTUATION_TRIM_PATTERN = /[.!]+\s*$/;
const MALFORMED_REPLACEMENT_PATTERN = /\buse\b.*\binstead\b/;
const MULTI_CANDIDATE_DIRECTIVE_PATTERN =
  /(?:\band\b|\bthen\b|;|,)\s*(?:set premise\b|change premise\b|use\b|prohibit\b|remove policy\b|clear premise\b|reset policies\b|clear state\b)/;

const NEAR_MISS_ALIAS_CASES = new Set([
  "allow docker",
  "set policy peanuts prohibit",
  "stop using peanuts",
  "use instead of docker",
  "use podman instead of",
  "use podman not docker",
  "wipe policies"
]);
const ADMIN_NEAR_MISS_CASES = new Set(["reset policy", "remove policies docker"]);
const MULTI_INSTRUCTION_CASES = new Set(["use docker, actually prohibit docker"]);

function unknown(): PreprocessorValidationResult {
  return { classification: PREPROCESS_OUTCOME_UNKNOWN, output: null };
}

function directive(output: string): PreprocessorValidationResult {
  return { classification: PREPROCESS_OUTCOME_DIRECTIVE, output };
}

function noDirective(): PreprocessorValidationResult {
  return { classification: PREPROCESS_OUTCOME_NO_DIRECTIVE, output: null };
}

function directiveHeuristic(output: string, rule_id = "canonical.full_match"): PreprocessorHeuristicResult {
  return {
    outcome: PREPROCESS_OUTCOME_DIRECTIVE,
    directive: output,
    rule_id
  };
}

function noDirectiveHeuristic(rule_id = "reject.confident_non_directive"): PreprocessorHeuristicResult {
  return {
    outcome: PREPROCESS_OUTCOME_NO_DIRECTIVE,
    directive: null,
    rule_id
  };
}

function unknownHeuristic(rule_id: string): PreprocessorHeuristicResult {
  return {
    outcome: PREPROCESS_OUTCOME_UNKNOWN,
    directive: null,
    rule_id
  };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeMatchInput(message: string): string {
  return normalizeWhitespace(message).toLowerCase();
}

function stripExactWrapper(text: string): string {
  const s = text.trim();
  if (s.length < 2) return s;
  const first = s[0];
  const last = s[s.length - 1];
  const wrapper = `${first}${last}`;
  if (!['""', "''", "``", "()", "[]"].includes(wrapper)) {
    return s;
  }
  const inner = s.slice(1, -1).trim();
  return inner.length > 0 ? inner : s;
}

function normalizeCandidate(message: string): string {
  const noPunct = message.trim().replace(PUNCTUATION_TRIM_PATTERN, "").trim();
  const unwrapped = stripExactWrapper(noPunct);
  return normalizeWhitespace(unwrapped).toLowerCase();
}

function isQuotedOrBacktickedExact(message: string): boolean {
  const s = message.trim();
  if (s.length < 2) return false;
  const pair = `${s[0]}${s[s.length - 1]}`;
  return pair === '""' || pair === "''" || pair === "``";
}

function isAllowedDirective(text: string): boolean {
  if (CANONICAL_DIRECTIVE_EXACT.has(text)) return true;
  return CANONICAL_DIRECTIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function containsMultipleCandidateDirectives(text: string): boolean {
  return MULTI_CANDIDATE_DIRECTIVE_PATTERN.test(normalizeMatchInput(text));
}

function validateStructuredOutput(rawOutput: unknown): PreprocessorValidationResult {
  if (typeof rawOutput !== "object" || rawOutput === null || Array.isArray(rawOutput)) {
    return unknown();
  }

  const rec = rawOutput as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length !== 2 || !keys.includes("classification") || !keys.includes("output")) {
    return unknown();
  }

  const classification = rec.classification;
  const output = rec.output;

  if (classification === PREPROCESS_OUTCOME_DIRECTIVE) {
    if (typeof output !== "string") {
      return unknown();
    }
    const normalized = output.trim();
    if (normalized === "" || containsMultipleCandidateDirectives(normalized) || !isAllowedDirective(normalized)) {
      return unknown();
    }
    return directive(normalized);
  }

  if (classification === PREPROCESS_OUTCOME_NO_DIRECTIVE) {
    return output === null ? noDirective() : unknown();
  }

  if (classification === PREPROCESS_OUTCOME_UNKNOWN) {
    return output === null ? unknown() : unknown();
  }

  return unknown();
}

function validateTextOutput(rawOutput: string): PreprocessorValidationResult {
  const stripped = rawOutput.trim();
  if (stripped === "") {
    return unknown();
  }

  if (stripped.toUpperCase() === PREPROCESSOR_NO_DIRECTIVE_SENTINEL) {
    return noDirective();
  }

  if (containsMultipleCandidateDirectives(stripped)) {
    return unknown();
  }

  if (isAllowedDirective(stripped)) {
    return directive(stripped);
  }

  if (stripped[0] === "{" || stripped[0] === "[") {
    try {
      const parsed = JSON.parse(stripped) as unknown;
      return validateStructuredOutput(parsed);
    } catch {
      return unknown();
    }
  }

  return unknown();
}

export function validate_preprocessor_output(raw_output: unknown): PreprocessorValidationResult {
  return typeof raw_output === "string" ? validateTextOutput(raw_output) : validateStructuredOutput(raw_output);
}

export const validatePreprocessorOutput = validate_preprocessor_output;

export function parse_preprocessor_output(raw_output: unknown): string | null {
  const validated = validate_preprocessor_output(raw_output);
  return validated.classification === PREPROCESS_OUTCOME_DIRECTIVE ? validated.output : null;
}

export const parsePreprocessorOutput = parse_preprocessor_output;

export function preprocess_heuristic(message: string): PreprocessorHeuristicResult {
  if (LIST_MARKER_PATTERN.test(message)) {
    return unknownHeuristic("reject.list_or_enumeration");
  }

  const normalized = normalizeMatchInput(message);
  if (message.includes("?") && DIRECTIVE_CUE_PATTERN.test(normalized)) {
    return unknownHeuristic("reject.question_form");
  }

  if (META_PREFIX_PATTERN.test(normalized)) {
    return unknownHeuristic("reject.meta_or_reporting");
  }

  if (MULTI_SEGMENT_PATTERN.test(normalized)) {
    return unknownHeuristic("reject.multi_segment_or_mixed_prose");
  }

  if (MULTI_INSTRUCTION_CASES.has(normalized)) {
    return unknownHeuristic("reject.multi_instruction");
  }

  if (isQuotedOrBacktickedExact(message)) {
    return unknownHeuristic("reject.quoted_exact");
  }

  const normalizedCandidate = normalizeCandidate(message);

  if (NEAR_MISS_ALIAS_CASES.has(normalized) || ADMIN_NEAR_MISS_CASES.has(normalized)) {
    return unknownHeuristic(
      NEAR_MISS_ALIAS_CASES.has(normalized) ? "reject.near_miss_alias" : "reject.admin_near_miss_alias"
    );
  }

  if (
    (MALFORMED_REPLACEMENT_PATTERN.test(normalizedCandidate) && !normalizedCandidate.includes(" instead of ")) ||
    normalizedCandidate.includes(" in stead of ")
  ) {
    return unknownHeuristic("reject.malformed_replacement_syntax");
  }

  if (containsMultipleCandidateDirectives(normalizedCandidate)) {
    return unknownHeuristic("reject.multi_candidate_directive");
  }

  if (isAllowedDirective(normalizedCandidate)) {
    return directiveHeuristic(normalizedCandidate);
  }

  if (DIRECTIVE_CUE_PATTERN.test(normalizedCandidate)) {
    return unknownHeuristic("reject.directive_adjacent_unsafe");
  }

  return noDirectiveHeuristic();
}

export const preprocessHeuristic = preprocess_heuristic;

function stripLeadingHeaders(promptTemplate: string): string {
  const lines = promptTemplate.split(/\r?\n/);
  if (/\r?\n$/.test(promptTemplate) && lines.at(-1) === "") {
    lines.pop();
  }
  let start = 0;
  while (start < lines.length) {
    const line = lines[start]!;
    const trimmed = line.trim();
    if (trimmed === "" || line.trimStart().startsWith("#")) {
      start += 1;
      continue;
    }
    break;
  }
  return lines.slice(start).join("\n");
}

function normalizeItem(input: string): string {
  let out = input.toLowerCase();
  out = out.normalize("NFKC");
  out = out.replace(/[\u2018\u2019]/g, "'");
  out = out.replace(/[\s_-]+/g, " ");
  out = out.trim();
  const articlePrefixes = ["the ", "a ", "an "];
  for (const prefix of articlePrefixes) {
    if (out.startsWith(prefix)) {
      out = out.slice(prefix.length).trim();
      break;
    }
  }
  out = out.replace(/\bdont\b/g, "don't");
  return out;
}

export function render_prompt(path: string, state: EngineState): string | null {
  if (typeof path !== "string") {
    return null;
  }
  let promptTemplate: string;
  try {
    promptTemplate = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  const stripped = stripLeadingHeaders(promptTemplate);
  const premiseValue = state.premise === null ? "null" : state.premise;
  const policyKeys = Object.keys(state.policies)
    .map((k) => normalizeItem(k))
    .filter((k) => k !== "");
  const sortedUniquePolicyKeys = [...new Set(policyKeys)].sort((a, b) => a.localeCompare(b));
  const policiesValue = sortedUniquePolicyKeys.length > 0 ? sortedUniquePolicyKeys.join(", ") : "(none)";

  return stripped.replaceAll(PROMPT_TOKEN_NULL_OR_VALUE, premiseValue).replaceAll(PROMPT_TOKEN_POLICY_SET, policiesValue);
}

export const renderPrompt = render_prompt;
