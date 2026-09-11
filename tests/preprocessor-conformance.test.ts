import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parsePreprocessorOutput, preprocessHeuristic, validatePreprocessorOutput } from "../src/preprocessor.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/drafter/preprocessor", import.meta.url));
const paths = readdirSync(FIXTURES).filter((name) => name.endsWith(".json")).sort();

function load(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Record<string, unknown>;
}

function serializeHeuristic(input: string) {
  const result = preprocessHeuristic(input);
  if (result.outcome === "directive") {
    return {
      outcome: result.outcome,
      directive: { text: result.directive.text, kind: result.directive.kind, operands: result.directive.operands }
    };
  }
  return { outcome: result.outcome, directive: null, reason: result.reason };
}

describe("Python drafter acquisition fixtures", () => {
  it.each(paths)("matches %s", (name) => {
    const fixture = load(name);
    const kind = fixture.kind ?? "heuristic";
    if (kind === "heuristic") {
      const expected = { ...(fixture.expected as Record<string, unknown>) };
      delete expected.internal_reason;
      const actual = serializeHeuristic(fixture.input as string);
      expect(actual).toEqual(expected);
      expect(serializeHeuristic(fixture.input as string)).toEqual(actual);
      if (actual.outcome === "directive") expect(parsePreprocessorOutput(actual.directive.text)).toBe(actual.directive.text);
      return;
    }

    expect(kind).toBe("validator");
    expect(validatePreprocessorOutput(fixture.raw_output)).toEqual(fixture.expected);
    expect(validatePreprocessorOutput(fixture.raw_output)).toEqual(fixture.expected);
  });
});
