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

function normalizedValidatorResult(rawOutput: unknown) {
  const result = preprocessor.validate_preprocessor_output(rawOutput);

  expect(typeof result).toBe("object");
  expect(result).not.toBeNull();
  expect(["directive", "rejected"]).toContain(result.classification);

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
  expect(["directive", "rejected", "unknown"]).toContain(result.outcome);

  if (result.outcome === "directive") {
    expect(result.directive).toMatchObject({ text: expect.any(String), kind: expect.any(String), operands: expect.any(Object) });
    expect(preprocessor.parse_preprocessor_output(result.directive.text)).toBe(result.directive.text);
  } else {
    expect(result.directive).toBeNull();
    expect(typeof result.reason).toBe("string");
  }

  return result;
}

describe("preprocessor property-style invariants", () => {
  it("validator is deterministic and preserves non-directive null outputs", () => {
    for (const rawOutput of rawOutputs) {
      const first = normalizedValidatorResult(rawOutput);
      const second = normalizedValidatorResult(rawOutput);
      expect(second).toEqual(first);
    }
  });

  it("parser is deterministic across representative raw outputs", () => {
    for (const rawOutput of rawOutputs) {
      const first = preprocessor.parse_preprocessor_output(rawOutput);
      const second = preprocessor.parse_preprocessor_output(rawOutput);

      expect(second).toBe(first);
      if (first !== null) {
        expect(preprocessor.parse_preprocessor_output(first)).toBe(first);
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

  it("heuristic distinguishes second directive starts from ordinary payload conjunctions", () => {
    expect(preprocessor.preprocess_heuristic("use bread and butter")).toMatchObject({
      outcome: "directive",
      directive: { text: "use bread and butter", kind: "use_item", operands: { item: "bread and butter" } }
    });

    expect(preprocessor.preprocess_heuristic("remove policy docker\nuse podman")).toEqual({
      outcome: "rejected",
      directive: null,
      reason: "multiple_directives"
    });
  });

  it("public preprocessor APIs do not throw on representative hostile inputs", () => {
    const calls = [
      () => preprocessor.preprocess_heuristic(""),
      () => preprocessor.preprocess_heuristic("example: use docker"),
      () => preprocessor.validate_preprocessor_output(null),
      () => preprocessor.validate_preprocessor_output({ classification: "directive", output: "use docker" }),
      () => preprocessor.parse_preprocessor_output(undefined),
      () => preprocessor.parse_preprocessor_output("use docker")
    ];

    for (const call of calls) {
      expect(call).not.toThrow();
    }
  });
});
