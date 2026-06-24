import { fileURLToPath } from "node:url";

import { renderPrompt } from "../src/index.js";

const defaultPromptPath = fileURLToPath(new URL("../prompts/default.txt", import.meta.url));

export type PromptRenderingExampleResult = {
  promptPath: string;
  renderedPrompt: string | null;
};

export function runPromptRenderingExample(): PromptRenderingExampleResult {
  // Render the shipped drafting prompt using the current compiler state.
  const renderedPrompt = renderPrompt(defaultPromptPath, {
    premise: "concise replies",
    policies: {
      docker: true,
      podman: true
    }
  });

  return {
    promptPath: defaultPromptPath,
    renderedPrompt
  };
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  console.log(runPromptRenderingExample().renderedPrompt);
}
