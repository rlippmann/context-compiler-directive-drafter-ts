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
const typingOnlyNames = ["PreprocessOutcome", "PreprocessResult"] as const;
const expectedPythonRuntimeExports = [
  "PREPROCESSOR_NO_DIRECTIVE_SENTINEL",
  "PREPROCESS_OUTCOME_DIRECTIVE",
  "PREPROCESS_OUTCOME_NO_DIRECTIVE",
  "PREPROCESS_OUTCOME_UNKNOWN",
  "parse_preprocessor_output",
  "preprocess_heuristic",
  "render_prompt",
  "validate_preprocessor_output"
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

  it("keeps contract fixture entries unique", () => {
    expect(new Set(apiContract.required_exports).size).toBe(apiContract.required_exports.length);
  });

  it("matches the hardened Python runtime export contract exactly", () => {
    expect([...apiContract.required_exports].sort()).toEqual([...expectedPythonRuntimeExports].sort());
  });

  it("excludes typing-only names from the contract fixture and runtime module", () => {
    for (const name of typingOnlyNames) {
      expect(apiContract.required_exports).not.toContain(name);
      expect(Object.prototype.hasOwnProperty.call(preprocessor, name)).toBe(false);
      expect(Object.keys(preprocessor)).not.toContain(name);
    }
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

describe("render_prompt", () => {
  it("returns null for non-string template input", () => {
    const rendered = preprocessor.render_prompt(123 as unknown as string, {
      premise: null,
      policies: {}
    });

    expect(rendered).toBeNull();
  });

  it("renders null premise and empty policies without placeholder tokens", () => {
    const rendered = preprocessor.render_prompt(
      "# Heading\n\n* premise: <NULL_OR_VALUE>\n* policies: <SET OF CURRENT POLICY ITEMS>",
      { premise: null, policies: {} }
    );

    expect(rendered).toBe("* premise: null\n* policies: (none)");
    expect(rendered).not.toContain("<NULL_OR_VALUE>");
    expect(rendered).not.toContain("<SET OF CURRENT POLICY ITEMS>");
  });

  it("deduplicates and sorts normalized policy names", () => {
    const rendered = preprocessor.render_prompt("* policies: <SET OF CURRENT POLICY ITEMS>", {
      premise: null,
      policies: {
        "shared": true,
        "Shared": true,
        "the zeta": true,
        "beta_item": true,
        "an alpha": true
      }
    });

    expect(rendered).toBe("* policies: alpha, beta item, shared, zeta");
    expect(rendered?.match(/shared/g)?.length ?? 0).toBe(1);
  });

  it("normalizes newline premise text deterministically", () => {
    const rendered = preprocessor.render_prompt("* premise: <NULL_OR_VALUE>", {
      premise: "first line\nsecond line!",
      policies: {}
    });

    expect(rendered).toBe("* premise: first line\nsecond line!");
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

describe("validator defensive coverage", () => {
  it("rejects structured directive output when output is non-string", () => {
    expect(
      preprocessor.validate_preprocessor_output({
        classification: "directive",
        output: 123
      })
    ).toEqual({
      classification: "unknown",
      output: null
    });
  });

  it("rejects fenced source-aware fallback rewrites as unknown", () => {
    expect(
      preprocessor.validate_preprocessor_output("use docker", {
        source_input: "~~~ use docker ~~~"
      })
    ).toEqual({
      classification: "unknown",
      output: null
    });
  });

  it("rejects backtick-fenced source-aware fallback rewrites as unknown", () => {
    expect(
      preprocessor.validate_preprocessor_output("use docker", {
        source_input: "```\nuse docker\n```"
      })
    ).toEqual({
      classification: "unknown",
      output: null
    });
  });

  it("rejects sentence-adjacent source-aware fallback rewrites as unknown", () => {
    expect(
      preprocessor.validate_preprocessor_output("prohibit peanuts", {
        source_input: "ok. prohibit peanuts"
      })
    ).toEqual({
      classification: "unknown",
      output: null
    });
  });
});
