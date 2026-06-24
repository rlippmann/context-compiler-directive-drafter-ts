import { describe, expect, it } from "vitest";

import { runBasicUsageExample } from "../examples/basic-usage.js";
import { runPromptRenderingExample } from "../examples/prompt-rendering.js";

describe("package-owned examples", () => {
  it("keeps the basic usage example aligned with the public API", () => {
    expect(runBasicUsageExample()).toEqual({
      sourceInput: "Use Docker.",
      heuristic: {
        outcome: "directive",
        directive: "use docker",
        rule_id: "canonical.full_match"
      },
      parsedDirective: "use docker",
      validation: {
        classification: "directive",
        output: "use docker"
      }
    });
  });

  it("keeps the prompt rendering example aligned with the shipped default prompt", () => {
    const result = runPromptRenderingExample();

    expect(result.promptPath.endsWith("/prompts/default.txt")).toBe(true);
    expect(result.renderedPrompt).toContain("concise replies");
    expect(result.renderedPrompt).toContain("docker, shell");
    expect(result.renderedPrompt).not.toContain("<NULL_OR_VALUE>");
    expect(result.renderedPrompt).not.toContain("<SET OF CURRENT POLICY ITEMS>");
  });
});
