import { describe, expect, it } from "vitest";

import * as preprocessor from "../src/index.js";
import { loadPreprocessorApiContractFixture, loadPreprocessorFixtures } from "./harness/fixtures.js";

type PreprocessorLike = {
  preprocess_heuristic?: (message: string) => unknown;
  validate_preprocessor_output?: (raw: unknown, opts?: { source_input?: string; sourceInput?: string }) => unknown;
  parse_preprocessor_output?: (raw: unknown, opts?: { source_input?: string; sourceInput?: string }) => string | null;
};

const fixtures = await loadPreprocessorFixtures();
const apiContract = await loadPreprocessorApiContractFixture();
const pre = preprocessor as PreprocessorLike & Record<string, unknown>;
const approvedTsRuntimeAliases = [
  "validatePreprocessorOutput",
  "parsePreprocessorOutput",
  "preprocessHeuristic",
  "renderPrompt"
] as const;

function sourceInputOptions(sourceInput?: string): { source_input?: string } {
  return sourceInput == null ? {} : { source_input: sourceInput };
}

function normalizeValidatorResult(result: unknown): { classification: string; output: string | null } {
  if (typeof result !== "object" || result === null) {
    throw new Error("validate_preprocessor_output returned non-object result");
  }

  const record = result as Record<string, unknown>;
  if (typeof record.classification !== "string") {
    throw new Error("validate_preprocessor_output result missing classification");
  }

  return {
    classification: record.classification,
    output: typeof record.output === "string" ? record.output : null
  };
}

function normalizeHeuristicResult(result: unknown): {
  outcome: string;
  directive: string | null;
  rule_id: string | null;
} {
  if (typeof result !== "object" || result === null) {
    throw new Error("preprocess_heuristic returned non-object result");
  }

  const record = result as Record<string, unknown>;
  expect(Object.prototype.hasOwnProperty.call(record, "outcome")).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(record, "directive")).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(record, "rule_id")).toBe(true);

  const outcome = record.outcome;
  const directive = record.directive;
  const ruleId = record.rule_id;
  if (typeof outcome === "string") {
    if (directive !== null && typeof directive !== "string") {
      throw new Error("preprocess_heuristic directive must be string or explicit null");
    }
    if (ruleId !== null && typeof ruleId !== "string") {
      throw new Error("preprocess_heuristic rule_id must be string or explicit null");
    }
    return {
      outcome,
      directive,
      rule_id: ruleId
    };
  }

  throw new Error("preprocess_heuristic result missing expected Python public shape");
}

describe("preprocessor api contract", () => {
  it("tracks the synced Python api-contract fixture while allowing only package-name differences", () => {
    expect(apiContract.kind).toBe("api-contract");
    expect(apiContract.module).toBe("context_compiler_directive_drafter");

    for (const name of apiContract.required_exports) {
      expect(name in preprocessor).toBe(true);
    }

    const expectedRuntimeExports = [...apiContract.required_exports, ...approvedTsRuntimeAliases].sort();
    const actualRuntimeExports = Object.keys(preprocessor).sort();
    expect(actualRuntimeExports).toEqual(expectedRuntimeExports);
  });

  it("adds camelCase aliases for snake_case validator/parser exports", () => {
    expect(preprocessor.validatePreprocessorOutput).toBe(preprocessor.validate_preprocessor_output);
    expect(preprocessor.parsePreprocessorOutput).toBe(preprocessor.parse_preprocessor_output);
  });

  it("supports both source_input and sourceInput options with identical behavior", () => {
    const rawOutput = "use docker";
    const sourceInput = "can you use docker?";

    expect(preprocessor.validatePreprocessorOutput(rawOutput, { source_input: sourceInput })).toEqual(
      preprocessor.validatePreprocessorOutput(rawOutput, { sourceInput })
    );
    expect(preprocessor.parsePreprocessorOutput(rawOutput, { source_input: sourceInput })).toEqual(
      preprocessor.parsePreprocessorOutput(rawOutput, { sourceInput })
    );
  });

  it("returns the Python public heuristic shape", () => {
    if (typeof preprocessor.preprocess_heuristic !== "function") {
      throw new Error("Missing preprocess_heuristic export");
    }

    const result = normalizeHeuristicResult(preprocessor.preprocess_heuristic("use docker"));
    expect(result).toEqual({
      outcome: "directive",
      directive: "use docker",
      rule_id: null
    });
  });
});

describe("preprocessor fixtures", () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      if (fixture.payload.kind === "heuristic") {
        if (typeof pre.preprocess_heuristic !== "function") {
          throw new Error("Missing preprocess_heuristic export");
        }

        const actual = normalizeHeuristicResult(pre.preprocess_heuristic(fixture.payload.input as string));
        expect(actual).toEqual({
          outcome: fixture.payload.expected?.classification,
          directive: fixture.payload.expected?.output ?? null,
          rule_id: null
        });
        return;
      }

      if (fixture.payload.kind === "validator") {
        if (typeof pre.validate_preprocessor_output !== "function") {
          throw new Error("Missing validate_preprocessor_output export");
        }

        const actual = normalizeValidatorResult(
          pre.validate_preprocessor_output(fixture.payload.raw_output, {
            ...sourceInputOptions(fixture.payload.source_input)
          })
        );
        expect(actual).toEqual(fixture.payload.expected);
        return;
      }

      if (typeof pre.parse_preprocessor_output !== "function") {
        throw new Error("Missing parse_preprocessor_output export");
      }

      const parsed = pre.parse_preprocessor_output(fixture.payload.raw_output, {
        ...sourceInputOptions(fixture.payload.source_input)
      });
      expect(parsed).toEqual(fixture.payload.expected_parsed);
    });
  }
});
