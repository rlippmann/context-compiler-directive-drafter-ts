import { readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export interface PreprocessorFixtureCase {
  kind: "heuristic" | "validator" | "parse";
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
  required_exports: string[];
}

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
      return {
        name: basename(path, ".json"),
        path,
        payload
      };
    })
  ).then((loaded) => loaded.filter((fixture) => fixture.payload.kind === "validator" || fixture.payload.kind === "parse"));
}

export async function loadPreprocessorApiContractFixture(): Promise<PreprocessorApiContractFixture> {
  const path = join(PREPROCESSOR_FIXTURE_ROOT, "public-api-v1.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as PreprocessorApiContractFixture;
}
