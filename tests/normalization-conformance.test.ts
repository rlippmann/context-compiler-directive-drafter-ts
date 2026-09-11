import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parsePreprocessorOutput, preprocessHeuristic, validatePreprocessorOutput } from "../src/preprocessor.js";

type Case = { name: string; surface: "heuristic" | "validator"; input: string; expected: Record<string, unknown> };
const fixturePath = fileURLToPath(new URL("./fixtures/drafter/normalization-v1.json", import.meta.url));
const cases = (JSON.parse(readFileSync(fixturePath, "utf8")) as { cases: Case[] }).cases;

function serializeHeuristic(input: string): Record<string, unknown> {
  const result = preprocessHeuristic(input);
  if (result.outcome !== "directive") return { outcome: result.outcome, directive: null, reason: result.reason };
  return { outcome: result.outcome, directive: { text: result.directive.text, kind: result.directive.kind, operands: result.directive.operands } };
}

function portableExpected(expected: Record<string, unknown>): Record<string, unknown> {
  if (expected.reason === "quoted_reported") return { ...expected, reason: "non_directive" };
  if (expected.reason === "malformed_directive") return { ...expected, reason: "invalid_candidate" };
  return expected;
}

describe("Python normalization contract", () => {
  it.each(cases)("matches $name", (fixture) => {
    if (fixture.surface === "heuristic") {
      const actual = serializeHeuristic(fixture.input);
      expect(actual).toEqual(portableExpected(fixture.expected));
      if (actual.outcome === "directive") expect(parsePreprocessorOutput((actual.directive as { text: string }).text)).toBe((actual.directive as { text: string }).text);
      return;
    }
    expect(validatePreprocessorOutput(fixture.input)).toEqual(fixture.expected);
  });
});
