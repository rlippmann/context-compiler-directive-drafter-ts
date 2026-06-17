import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export interface PreprocessorFixtureCase {
  kind?: "heuristic" | "validator" | "parse";
  input?: string;
  raw_output: unknown;
  source_input?: string;
  expected?: {
    classification: string;
    output: string | null;
  };
  expected_parsed?: string | null;
}

export interface PreprocessorApiContractFixture {
  id: string;
  kind: "api-contract";
  module: string;
  forbid_additional_public_exports?: boolean;
  required_exports: string[];
  forbidden_exports?: string[];
  exports?: Record<string, PreprocessorApiExportSpec>;
}

export interface PreprocessorApiContractParameterSpec {
  name: string;
  kind: "positional_only" | "positional_or_keyword" | "var_positional" | "keyword_only" | "var_keyword";
  required: boolean;
}

export interface PreprocessorApiContractShape {
  any_of?: PreprocessorApiContractShape[];
  type?: string | string[];
  required_keys?: string[];
  properties?: Record<string, PreprocessorApiContractShape>;
  enum?: unknown[];
}

export interface PreprocessorApiCallableProbe {
  kwargs: Record<string, unknown>;
}

export interface PreprocessorApiRenderPromptFromFileBehaviorProbe {
  kind: "render_prompt_from_file";
  path: string;
  template: string;
  state_steps: string[];
  expect_result: string;
  reject_substrings?: string[];
}

export interface PreprocessorApiConstantExportSpec {
  kind: "constant";
  value: unknown;
}

export interface PreprocessorApiCallableExportSpec {
  kind: "callable";
  parameters: PreprocessorApiContractParameterSpec[];
  return_shape?: PreprocessorApiContractShape;
  shape_probes?: PreprocessorApiCallableProbe[];
  behavior_probes?: PreprocessorApiRenderPromptFromFileBehaviorProbe[];
}

export type PreprocessorApiExportSpec = PreprocessorApiConstantExportSpec | PreprocessorApiCallableExportSpec;

export interface NamedFixture<T> {
  name: string;
  path: string;
  payload: T;
}

const PREPROCESSOR_FIXTURE_ROOT = resolve(process.cwd(), "tests", "fixtures", "preprocessor");

export async function loadPreprocessorFixtures(): Promise<Array<NamedFixture<PreprocessorFixtureCase>>> {
  const entries = await readdir(PREPROCESSOR_FIXTURE_ROOT, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("public-api-"))
    .map((entry) => join(PREPROCESSOR_FIXTURE_ROOT, entry.name))
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(
    files.map(async (path) => {
      const raw = await readFile(path, "utf8");
      const payload = JSON.parse(raw) as PreprocessorFixtureCase;
      const kind =
        payload.kind ??
        (Object.prototype.hasOwnProperty.call(payload, "expected_parsed")
          ? "parse"
          : Object.prototype.hasOwnProperty.call(payload, "input")
            ? "heuristic"
            : "validator");
      return {
        name: basename(path, ".json"),
        path,
        payload: {
          ...payload,
          kind
        }
      };
    })
  );
}

export async function loadPreprocessorApiContractFixture(): Promise<PreprocessorApiContractFixture> {
  const path = join(PREPROCESSOR_FIXTURE_ROOT, "public-api-v1.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as PreprocessorApiContractFixture;
}
