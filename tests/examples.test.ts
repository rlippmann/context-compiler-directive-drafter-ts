import { describe, expect, it } from "vitest";

import { runBasicUsageExample } from "../examples/basic-usage.js";
import { runPromptRenderingExample } from "../examples/prompt-rendering.js";

describe("package-owned examples", () => {
  it("keeps the basic usage example aligned with the public API", () => {
    const result = runBasicUsageExample();
    expect(result.sourceInput).toBe("Please use Docker for container examples.");
    expect(result.heuristic.outcome).toBe("directive");
    expect(result.heuristic.directive).toMatchObject({
      text: "use docker for container examples",
      kind: "use_item",
      operands: { item: "docker for container examples" }
    });
    expect(result.parsedDirective).toBe("use docker for container examples");
    expect(result.validation).toEqual({ classification: "directive", output: "use docker" });
  });

  it("keeps the prompt rendering example aligned with the shipped default prompt", () => {
    const result = runPromptRenderingExample();

    expect(result.promptPath.endsWith("/prompts/default.txt")).toBe(true);
    expect(result.renderedPrompt).toContain("concise replies");
    expect(result.renderedPrompt).toContain("docker, podman");
    expect(result.renderedPrompt).not.toContain("<NULL_OR_VALUE>");
    expect(result.renderedPrompt).not.toContain("<SET OF CURRENT POLICY ITEMS>");
  });
});
