import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  canonicalStartsFromMetadata,
  isIncompleteCanonicalDirective,
  renderCanonicalCandidate,
  renderCanonicalFormsFromMetadata,
  type GrammarMetadata
} from "../src/grammar-derivation.js";

const FIXTURE = fileURLToPath(new URL("./fixtures/drafter/grammar/grammar-derivation-v1.json", import.meta.url));
const contract = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
  cases: Array<{
    name: string;
    metadata: Array<GrammarMetadata & { category: string }>;
    canonical_starts: string[];
    prompt_forms: string[];
    incomplete: Record<string, boolean>;
    rewrite: { kind: string; operands: string[]; expected: string };
  }>;
};

describe("Python grammar derivation contract", () => {
  it.each(contract.cases)("matches every fixture case: $name", (fixture) => {
    const metadata = fixture.metadata satisfies Array<GrammarMetadata & { category: string }>;
    const categories = Object.fromEntries(metadata.map((item) => [item.kind, item.category]));

    expect(canonicalStartsFromMetadata(metadata)).toEqual(fixture.canonical_starts);
    expect(renderCanonicalFormsFromMetadata(metadata, categories).split("\n").slice(1)).toEqual(fixture.prompt_forms);

    for (const [message, expected] of Object.entries(fixture.incomplete)) {
      expect(isIncompleteCanonicalDirective(message, metadata)).toBe(expected);
    }

    expect(renderCanonicalCandidate(fixture.rewrite.kind, fixture.rewrite.operands, metadata)).toBe(fixture.rewrite.expected);
  });

  it("exercises the synthetic added-directive case through metadata only", () => {
    const fixture = contract.cases.find((item) => item.name === "added_directive");
    expect(fixture).toBeDefined();
    const added = fixture!.metadata.find((item) => item.kind === "adopt_rule");
    expect(added).toBeDefined();
    expect(canonicalStartsFromMetadata(fixture!.metadata)).toContain("adopt");
    expect(renderCanonicalFormsFromMetadata(fixture!.metadata, { adopt_rule: "Policy" })).toContain("`adopt <rule>` (Policy)");
    expect(isIncompleteCanonicalDirective("adopt", fixture!.metadata)).toBe(true);
    expect(renderCanonicalCandidate("adopt_rule", ["strictness"], fixture!.metadata)).toBe("adopt strictness");
  });
});
