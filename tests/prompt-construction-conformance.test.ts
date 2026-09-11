import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { renderPromptFromConstruction } from "../src/fallback-prompts.js";

type FixtureCase = {
  name: string;
  mode: "free_text" | "structured";
  metadata: Array<{ kind: string; canonical_start: string; operand_names: string[]; category: string }>;
  allowed_directive_kinds?: string[] | null;
  positive_examples: Array<{ kind: string; user_input: string; operand_values: string[] }>;
  scope_payload_contrasts: Array<{ kind: string; user_input: string; operand_values: string[]; truncated_operand_values: string[] }>;
  expected: { canonical_forms: string[]; positive_examples: string[]; scope_payload_contrasts: string[]; kind_restriction: string[] | null; required_substrings: string[]; forbidden_substrings: string[] };
};

const fixturePath = fileURLToPath(new URL("./fixtures/drafter/prompts/prompt-construction-v1.json", import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { id: string; cases: FixtureCase[] };

describe("Python prompt-construction contract", () => {
  it.each(fixture.cases)("matches synthetic case $name", (testCase) => {
    const metadata = testCase.metadata;
    const categories = Object.fromEntries(metadata.map((item) => [item.kind, item.category]));
    const prompt = renderPromptFromConstruction(
      testCase.mode,
      metadata,
      categories,
      testCase.positive_examples.map((example) => ({ kind: example.kind, userInput: example.user_input, operandValues: example.operand_values })),
      testCase.scope_payload_contrasts.map((example) => ({
        kind: example.kind,
        userInput: example.user_input,
        operandValues: example.operand_values,
        truncatedOperandValues: example.truncated_operand_values
      })),
      testCase.allowed_directive_kinds ?? null
    );

    for (const expected of testCase.expected.canonical_forms) expect(prompt).toContain(expected);
    for (const expected of testCase.expected.positive_examples) expect(prompt).toContain(expected);
    for (const expected of testCase.expected.scope_payload_contrasts) expect(prompt).toContain(expected);
    for (const expected of testCase.expected.kind_restriction ?? []) expect(prompt).toContain(expected);
    for (const expected of testCase.expected.required_substrings) expect(prompt).toContain(expected);
    for (const forbidden of testCase.expected.forbidden_substrings) expect(prompt).not.toContain(forbidden);
  });

  it("derives synthetic canonical forms, examples, and contrasts instead of using the current inventory", () => {
    const testCase = fixture.cases[0]!;
    const metadata = testCase.metadata;
    const prompt = renderPromptFromConstruction(
      "free_text",
      metadata,
      Object.fromEntries(metadata.map((item) => [item.kind, item.category])),
      testCase.positive_examples.map((example) => ({ kind: example.kind, userInput: example.user_input, operandValues: example.operand_values })),
      testCase.scope_payload_contrasts.map((example) => ({ kind: example.kind, userInput: example.user_input, operandValues: example.operand_values, truncatedOperandValues: example.truncated_operand_values }))
    );

    expect(prompt).toContain("`adopt <rule>` (Policy)");
    expect(prompt).toContain("User: please adopt strictness");
    expect(prompt).toContain("Correct candidate: adopt strictness for release");
  });
});
