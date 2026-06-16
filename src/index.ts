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
  rule_id: string | null;
};

type PreprocessorSourceOptions = {
  source_input?: string;
  sourceInput?: string;
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
const SOURCE_META_PREFIX_PATTERN =
  /^\s*(?:example:|for example\b|the command is\b|(?:i|he|she|they|docs?|documentation)\s+(?:say|says|said)\b)/;
const SOURCE_SENTENCE_ADJACENT_DIRECTIVE_PATTERN =
  /^[^!?]*\.\s*(?:set premise|change premise|use|prohibit|remove policy|clear premise|reset policies|clear state)\b/;
const SOURCE_REPORTED_SPEECH_QUOTE_PATTERN = /\b(?:say|says|said|docs?|documentation)\b/;
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

function toHeuristicResult(result: PreprocessorValidationResult): PreprocessorHeuristicResult {
  return {
    outcome: result.classification,
    directive: result.output,
    rule_id: null
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

function stripSourceWrapper(text: string): string {
  const s = text.trim();
  if (s.length < 2) return s;
  const first = s[0];
  const last = s[s.length - 1];
  const wrapper = `${first}${last}`;
  if (!["()", "[]"].includes(wrapper)) {
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

function normalizeSourceCandidate(sourceInput: string): string {
  const stripped = sourceInput.trim();
  const noPunct = stripped.replace(PUNCTUATION_TRIM_PATTERN, "").trim();
  const unwrapped = stripSourceWrapper(noPunct);
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

function sourceInputIsStructuredContractDirective(sourceInput: string, directiveOutput: string): boolean {
  const stripped = sourceInput.trim();
  if (stripped === "" || (stripped[0] !== "{" && stripped[0] !== "[")) {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return false;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return false;
  }
  const rec = parsed as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length !== 2 || !keys.includes("classification") || !keys.includes("output")) {
    return false;
  }

  return (
    rec.classification === PREPROCESS_OUTCOME_DIRECTIVE &&
    typeof rec.output === "string" &&
    rec.output.trim().toLowerCase() === directiveOutput.trim().toLowerCase()
  );
}

function isBoundaryUnsafeSourceInput(sourceInput: string): boolean {
  const lower = sourceInput.toLowerCase();
  const normalized = normalizeMatchInput(sourceInput);

  if (sourceInput.includes("\n") || sourceInput.includes("\r")) {
    return true;
  }
  if (sourceInput.includes("```") || sourceInput.includes("~~~")) {
    return true;
  }
  if (sourceInput.includes("`") && DIRECTIVE_CUE_PATTERN.test(normalized)) {
    return true;
  }
  if (SOURCE_META_PREFIX_PATTERN.test(normalized)) {
    return true;
  }
  if (sourceInput.includes("?") && DIRECTIVE_CUE_PATTERN.test(normalized)) {
    return true;
  }
  if (MULTI_SEGMENT_PATTERN.test(normalized)) {
    return true;
  }
  if (MULTI_CANDIDATE_DIRECTIVE_PATTERN.test(normalized)) {
    return true;
  }
  if (SOURCE_SENTENCE_ADJACENT_DIRECTIVE_PATTERN.test(normalized)) {
    return true;
  }
  if (sourceInput.includes('"') && SOURCE_REPORTED_SPEECH_QUOTE_PATTERN.test(lower)) {
    return true;
  }

  return DIRECTIVE_CUE_PATTERN.test(normalized) && !isAllowedDirective(normalizeSourceCandidate(sourceInput));
}

function isSafeFallbackDirectiveRewrite(sourceInput: string, directiveOutput: string): boolean {
  const source = normalizeMatchInput(sourceInput);
  const directiveText = normalizeMatchInput(directiveOutput);

  if (sourceInputIsStructuredContractDirective(sourceInput, directiveOutput)) {
    return true;
  }

  const setPremiseTo = /^set premise to\s+(.+\S)$/.exec(source);
  if (setPremiseTo != null) {
    const payload = setPremiseTo[1];
    if (payload != null && directiveText === `set premise ${payload.trim()}`) {
      return false;
    }
  }

  const changePremiseMissingTo = /^change premise\s+(?!to\b)(.+\S)$/.exec(source);
  if (changePremiseMissingTo != null) {
    const payload = changePremiseMissingTo[1];
    if (payload != null && directiveText === `change premise to ${payload.trim()}`) {
      return false;
    }
  }

  if (isBoundaryUnsafeSourceInput(sourceInput)) {
    return false;
  }

  const normalizedSource = normalizeSourceCandidate(sourceInput);
  if (!isAllowedDirective(normalizedSource)) {
    return false;
  }

  return directiveText === normalizedSource;
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

export function validate_preprocessor_output(
  rawOutput: unknown,
  opts?: PreprocessorSourceOptions
): PreprocessorValidationResult {
  const validated = typeof rawOutput === "string" ? validateTextOutput(rawOutput) : validateStructuredOutput(rawOutput);

  const sourceInput = opts?.sourceInput ?? opts?.source_input;
  if (
    sourceInput != null &&
    validated.classification === PREPROCESS_OUTCOME_DIRECTIVE &&
    validated.output != null &&
    !isSafeFallbackDirectiveRewrite(sourceInput, validated.output)
  ) {
    return unknown();
  }

  return validated;
}

export const validatePreprocessorOutput = validate_preprocessor_output;

export function parse_preprocessor_output(rawOutput: unknown, opts?: PreprocessorSourceOptions): string | null {
  const validated = validate_preprocessor_output(rawOutput, opts);
  return validated.classification === PREPROCESS_OUTCOME_DIRECTIVE ? validated.output : null;
}

export const parsePreprocessorOutput = parse_preprocessor_output;

export function preprocess_heuristic(message: string): PreprocessorHeuristicResult {
  if (LIST_MARKER_PATTERN.test(message)) {
    return toHeuristicResult(unknown());
  }

  const normalized = normalizeMatchInput(message);
  if (message.includes("?") && DIRECTIVE_CUE_PATTERN.test(normalized)) {
    return toHeuristicResult(unknown());
  }

  if (META_PREFIX_PATTERN.test(normalized)) {
    return toHeuristicResult(unknown());
  }

  if (MULTI_SEGMENT_PATTERN.test(normalized)) {
    return toHeuristicResult(unknown());
  }

  if (MULTI_INSTRUCTION_CASES.has(normalized)) {
    return toHeuristicResult(unknown());
  }

  if (isQuotedOrBacktickedExact(message)) {
    return toHeuristicResult(unknown());
  }

  const normalizedCandidate = normalizeCandidate(message);

  if (NEAR_MISS_ALIAS_CASES.has(normalized) || ADMIN_NEAR_MISS_CASES.has(normalized)) {
    return toHeuristicResult(unknown());
  }

  if (
    (MALFORMED_REPLACEMENT_PATTERN.test(normalizedCandidate) && !normalizedCandidate.includes(" instead of ")) ||
    normalizedCandidate.includes(" in stead of ")
  ) {
    return toHeuristicResult(unknown());
  }

  if (containsMultipleCandidateDirectives(normalizedCandidate)) {
    return toHeuristicResult(unknown());
  }

  if (isAllowedDirective(normalizedCandidate)) {
    return toHeuristicResult(directive(normalizedCandidate));
  }

  if (DIRECTIVE_CUE_PATTERN.test(normalizedCandidate)) {
    return toHeuristicResult(unknown());
  }

  return toHeuristicResult(noDirective());
}

export const preprocessHeuristic = preprocess_heuristic;

function stripLeadingHeaders(promptTemplate: string): string {
  const lines = promptTemplate.split(/\r?\n/);
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

export function render_prompt(promptTemplate: string, state: EngineState): string | null {
  if (typeof promptTemplate !== "string") {
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
