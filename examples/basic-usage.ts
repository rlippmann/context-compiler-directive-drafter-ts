import {
  parsePreprocessorOutput,
  preprocessHeuristic,
  validatePreprocessorOutput
} from "../src/preprocessor.js";

const sourceInput = "Please use Docker for container examples.";

export type BasicUsageExampleResult = {
  sourceInput: string;
  heuristic: ReturnType<typeof preprocessHeuristic>;
  parsedDirective: string | null;
  modelOutput: string;
  validation: ReturnType<typeof validatePreprocessorOutput>;
};

export function runBasicUsageExample(): BasicUsageExampleResult {
  const heuristic = preprocessHeuristic(sourceInput);
  const parsedDirective = heuristic.directive === null ? null : parsePreprocessorOutput(heuristic.directive.text);
  const modelOutput = "use docker";
  const validation = validatePreprocessorOutput(modelOutput);

  return {
    sourceInput,
    heuristic,
    parsedDirective,
    modelOutput,
    validation
  };
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  console.log(JSON.stringify(runBasicUsageExample(), null, 2));
}
