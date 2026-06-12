export const PREPROCESSOR_NO_DIRECTIVE_SENTINEL = "<NO_DIRECTIVE>";

export const PREPROCESS_OUTCOME_DIRECTIVE = "directive";
export const PREPROCESS_OUTCOME_NO_DIRECTIVE = "no_directive";
export const PREPROCESS_OUTCOME_UNKNOWN = "unknown";

type PreprocessorClassification =
  | typeof PREPROCESS_OUTCOME_DIRECTIVE
  | typeof PREPROCESS_OUTCOME_NO_DIRECTIVE
  | typeof PREPROCESS_OUTCOME_UNKNOWN;

type PreprocessorValidationResult = {
  classification: PreprocessorClassification;
  output: string | null;
};

type PreprocessorSourceOptions = {
  source_input?: string;
  sourceInput?: string;
};

const CANONICAL_DIRECTIVE_PATTERNS: RegExp[] = [
  /^set premise (?!to\b)\S(?:.*\S)?$/,
  /^change premise to \S(?:.*\S)?$/,
  /^use \S(?:.*\S)? instead of \S(?:.*\S)?$/,
  /^use (?!.*\sinstead of(?:\s|$))\S(?:.*\S)?$/,
  /^prohibit \S(?:.*\S)?$/,
  /^remove policy \S(?:.*\S)?$/
];

const CANONICAL_DIRECTIVE_EXACT = new Set(["clear premise", "reset policies", "clear state"]);
const MULTI_CANDIDATE_DIRECTIVE_PATTERN =
  /(?:\band\b|\bthen\b|;|,)\s*(?:set premise\b|change premise\b|use\b|prohibit\b|remove policy\b|clear premise\b|reset policies\b|clear state\b)/;
const SET_PREMISE_TO_NEAR_MISS_PATTERN = /^set premise to\s+(.+\S)\s*$/;
const CHANGE_PREMISE_MISSING_TO_NEAR_MISS_PATTERN = /^change premise\s+(?!to\b)(.+\S)\s*$/;
const DIRECTIVE_CUE_PATTERN =
  /\b(set premise|change premise|use|prohibit|remove policy|clear premise|reset policies|clear state)\b/;
const META_PREFIX_PATTERN =
  /^\s*(?:example:|for example\b|the command is\b|(?:i|he|she|they|docs?|documentation)\s+(?:say|says|said)\b)/;
const MULTI_SEGMENT_PATTERN =
  /^\s*(?:use|prohibit|remove policy|set premise|change premise to|clear premise|reset policies|clear state)\b.*\b(?:because|then continue|and)\b/;
const SENTENCE_ADJACENT_DIRECTIVE_PATTERN =
  /^[^!?]*\.\s*(?:set premise|change premise|use|prohibit|remove policy|clear premise|reset policies|clear state)\b/;
const PUNCTUATION_TRIM_PATTERN = /[.!]+\s*$/;
const REPORTED_SPEECH_QUOTE_PATTERN = /\b(?:say|says|said|docs?|documentation)\b/;
const WRAPPER_PAIRS = new Set(["()", "[]"]);

function unknown(): PreprocessorValidationResult {
  return { classification: PREPROCESS_OUTCOME_UNKNOWN, output: null };
}

function directive(output: string): PreprocessorValidationResult {
  return { classification: PREPROCESS_OUTCOME_DIRECTIVE, output };
}

function noDirective(): PreprocessorValidationResult {
  return { classification: PREPROCESS_OUTCOME_NO_DIRECTIVE, output: null };
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function isAllowedDirective(text: string): boolean {
  if (CANONICAL_DIRECTIVE_EXACT.has(text)) {
    return true;
  }
  return CANONICAL_DIRECTIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function containsMultipleCandidateDirectives(text: string): boolean {
  return MULTI_CANDIDATE_DIRECTIVE_PATTERN.test(normalizeWhitespace(text));
}

function stripTerminalPunctuation(message: string): string {
  return message.replace(PUNCTUATION_TRIM_PATTERN, "").trim();
}

function stripExactWrapper(message: string): string {
  const stripped = message.trim();
  if (stripped.length < 2) {
    return stripped;
  }

  const pair = `${stripped[0]}${stripped[stripped.length - 1]}`;
  if (!WRAPPER_PAIRS.has(pair)) {
    return stripped;
  }

  const inner = stripped.slice(1, -1).trim();
  return inner === "" ? stripped : inner;
}

function normalizeSourceCandidate(sourceInput: string): string {
  const noPunct = stripTerminalPunctuation(sourceInput.trim());
  const unwrapped = stripExactWrapper(noPunct);
  return normalizeWhitespace(unwrapped);
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

  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !("classification" in record) || !("output" in record)) {
    return false;
  }

  return (
    record.classification === PREPROCESS_OUTCOME_DIRECTIVE &&
    typeof record.output === "string" &&
    record.output.trim().toLowerCase() === directiveOutput.trim().toLowerCase()
  );
}

function isBoundaryUnsafeSourceInput(sourceInput: string): boolean {
  const lower = sourceInput.toLowerCase();
  const normalized = normalizeWhitespace(sourceInput);

  if (sourceInput.includes("\n") || sourceInput.includes("\r")) {
    return true;
  }
  if (sourceInput.includes("```") || sourceInput.includes("~~~")) {
    return true;
  }
  if (sourceInput.includes("`") && DIRECTIVE_CUE_PATTERN.test(normalized)) {
    return true;
  }
  if (META_PREFIX_PATTERN.test(normalized)) {
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
  if (SENTENCE_ADJACENT_DIRECTIVE_PATTERN.test(normalized)) {
    return true;
  }
  if (sourceInput.includes('"') && REPORTED_SPEECH_QUOTE_PATTERN.test(lower)) {
    return true;
  }

  return DIRECTIVE_CUE_PATTERN.test(normalized) && !isAllowedDirective(normalizeSourceCandidate(sourceInput));
}

function isSafeFallbackDirectiveRewrite(sourceInput: string, directiveOutput: string): boolean {
  const source = normalizeWhitespace(sourceInput);
  const directiveText = normalizeWhitespace(directiveOutput);

  if (sourceInputIsStructuredContractDirective(sourceInput, directiveOutput)) {
    return true;
  }

  const setPremiseToMatch = SET_PREMISE_TO_NEAR_MISS_PATTERN.exec(source);
  if (setPremiseToMatch != null) {
    const payload = setPremiseToMatch[1]?.trim();
    if (payload == null) {
      return false;
    }
    if (directiveText === `set premise ${payload}`) {
      return false;
    }
  }

  const changePremiseMissingToMatch = CHANGE_PREMISE_MISSING_TO_NEAR_MISS_PATTERN.exec(source);
  if (changePremiseMissingToMatch != null) {
    const payload = changePremiseMissingToMatch[1]?.trim();
    if (payload == null) {
      return false;
    }
    if (directiveText === `change premise to ${payload}`) {
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

  const record = rawOutput as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes("classification") || !keys.includes("output")) {
    return unknown();
  }

  const classification = record.classification;
  const output = record.output;

  if (classification === PREPROCESS_OUTCOME_DIRECTIVE) {
    if (typeof output !== "string") {
      return unknown();
    }
    const normalizedOutput = output.trim();
    if (normalizedOutput === "" || containsMultipleCandidateDirectives(normalizedOutput)) {
      return unknown();
    }
    if (!isAllowedDirective(normalizedOutput)) {
      return unknown();
    }
    return directive(normalizedOutput);
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
      return validateStructuredOutput(JSON.parse(stripped) as unknown);
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
