import { describe, expect, it } from "vitest";

import * as preprocessor from "../src/index.js";

const canonicalDirectives = [
  "set premise concise replies",
  "change premise to formal tone",
  "use docker",
  "prohibit peanuts",
  "remove policy docker",
  "use podman instead of docker",
  "clear premise",
  "reset policies",
  "clear state"
] as const;

const noisyStrings = [
  "",
  "   ",
  "hello world",
  "example: use docker",
  "can you use docker?",
  "`use docker`",
  "\"use docker\"",
  "[use docker]",
  "use docker; clear state",
  "notes: <NO_DIRECTIVE>",
  "{\"classification\":\"directive\",\"output\":\"use docker\",\"extra\":true}",
  "[{\"classification\":\"directive\",\"output\":\"use docker\"}]",
  "~~~\nuse docker\n~~~",
  "first line\nsecond line"
] as const;

const rawOutputs: unknown[] = [
  null,
  undefined,
  0,
  1,
  true,
  false,
  "",
  "   ",
  "<NO_DIRECTIVE>",
  "<NOT_DIRECTIVE>",
  "use docker",
  "use docker; clear state",
  "{\"classification\":\"directive\",\"output\":\"use docker\"}",
  "{\"classification\":\"no_directive\",\"output\":null}",
  "[{\"classification\":\"directive\",\"output\":\"use docker\"}]",
  { classification: "directive", output: "use docker" },
  { classification: "directive", output: "use docker", extra: true },
  { classification: "no_directive", output: null },
  { classification: "no_directive", output: "<NO_DIRECTIVE>" },
  { classification: "unknown", output: null },
  { classification: 123, output: null },
  ["use docker"],
  { nested: { value: "use docker" } }
];

const sourceInputs = [
  undefined,
  "use docker",
  "example: use docker",
  "can you use docker?",
  "docs say \"use docker\"",
  "clear state; reset policies",
  "~~~\nuse docker\n~~~"
] as const;

function normalizedValidatorResult(rawOutput: unknown, sourceInput?: string) {
  const result = preprocessor.validate_preprocessor_output(rawOutput, sourceInput == null ? undefined : { source_input: sourceInput });

  expect(typeof result).toBe("object");
  expect(result).not.toBeNull();
  expect(["directive", "no_directive", "unknown"]).toContain(result.classification);

  if (result.classification === "directive") {
    expect(typeof result.output).toBe("string");
    expect(result.output?.trim()).toBe(result.output);
  } else {
    expect(result.output).toBeNull();
  }

  return result;
}

function normalizedHeuristicResult(message: string) {
  const result = preprocessor.preprocess_heuristic(message);

  expect(typeof result).toBe("object");
  expect(result).not.toBeNull();
  expect(["directive", "no_directive", "unknown"]).toContain(result.outcome);
  expect(typeof result.rule_id).toBe("string");
  expect(result.rule_id.length).toBeGreaterThan(0);

  if (result.outcome === "directive") {
    expect(typeof result.directive).toBe("string");
    expect(preprocessor.parse_preprocessor_output(result.directive)).toBe(result.directive);
  } else {
    expect(result.directive).toBeNull();
  }

  return result;
}

describe("preprocessor property-style invariants", () => {
  it("validator is deterministic and preserves non-directive null outputs", () => {
    for (const rawOutput of rawOutputs) {
      for (const sourceInput of sourceInputs) {
        const first = normalizedValidatorResult(rawOutput, sourceInput);
        const second = normalizedValidatorResult(rawOutput, sourceInput);
        expect(second).toEqual(first);
      }
    }
  });

  it("parser is deterministic across representative raw outputs", () => {
    for (const rawOutput of rawOutputs) {
      for (const sourceInput of sourceInputs) {
        const first = preprocessor.parse_preprocessor_output(
          rawOutput,
          sourceInput == null ? undefined : { source_input: sourceInput }
        );
        const second = preprocessor.parse_preprocessor_output(
          rawOutput,
          sourceInput == null ? undefined : { source_input: sourceInput }
        );

        expect(second).toBe(first);
        if (first !== null) {
          expect(preprocessor.parse_preprocessor_output(first)).toBe(first);
        }
      }
    }
  });

  it("heuristic is deterministic across representative messages", () => {
    const messages = [
      ...canonicalDirectives,
      ...canonicalDirectives.map((directive) => `${directive}!`),
      ...canonicalDirectives.map((directive) => `(${directive})`),
      ...canonicalDirectives.map((directive) => `"${directive}"`),
      ...canonicalDirectives.map((directive) => `${directive}?`),
      ...noisyStrings
    ];

    for (const message of messages) {
      const first = normalizedHeuristicResult(message);
      const second = normalizedHeuristicResult(message);
      expect(second).toEqual(first);
    }
  });

  it("public preprocessor APIs do not throw on representative hostile inputs", () => {
    const calls = [
      () => preprocessor.preprocess_heuristic(""),
      () => preprocessor.preprocess_heuristic("example: use docker"),
      () => preprocessor.validate_preprocessor_output(null),
      () => preprocessor.validate_preprocessor_output({ classification: "directive", output: "use docker" }),
      () =>
        preprocessor.validate_preprocessor_output("use docker", {
          source_input: "docs say \"use docker\""
        }),
      () => preprocessor.parse_preprocessor_output(undefined),
      () =>
        preprocessor.parse_preprocessor_output("use docker", {
          source_input: "clear state; reset policies"
        })
    ];

    for (const call of calls) {
      expect(call).not.toThrow();
    }
  });
});
