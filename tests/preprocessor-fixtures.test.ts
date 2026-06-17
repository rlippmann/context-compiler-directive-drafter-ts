import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import * as preprocessor from "../src/index.js";
import {
  loadPreprocessorApiContractFixture,
  loadPreprocessorFixtures,
  type PreprocessorApiCallableExportSpec,
  type PreprocessorApiContractShape,
  type PreprocessorApiExportSpec,
  type PreprocessorApiRenderPromptFromFileBehaviorProbe
} from "./harness/fixtures.js";

type PreprocessorLike = {
  preprocess_heuristic?: (message: string) => unknown;
  validate_preprocessor_output?: (
    raw: unknown,
    source_input?: string | { source_input?: string; sourceInput?: string }
  ) => unknown;
  parse_preprocessor_output?: (
    raw: unknown,
    source_input?: string | { source_input?: string; sourceInput?: string }
  ) => string | null;
};

type RenderPromptState = {
  premise: string | null;
  policies: Record<string, boolean>;
};

const fixtures = await loadPreprocessorFixtures();
const apiContract = await loadPreprocessorApiContractFixture();
const pre = preprocessor as PreprocessorLike & Record<string, unknown>;
const approvedTsRuntimeAliases = [
  "validatePreprocessorOutput",
  "parsePreprocessorOutput",
  "preprocessHeuristic",
  "renderPrompt"
] as const;
const expectedPythonRuntimeExports = [
  "PREPROCESSOR_NO_DIRECTIVE_SENTINEL",
  "PREPROCESS_OUTCOME_DIRECTIVE",
  "PREPROCESS_OUTCOME_NO_DIRECTIVE",
  "PREPROCESS_OUTCOME_UNKNOWN",
  "parse_preprocessor_output",
  "preprocess_heuristic",
  "render_prompt",
  "validate_preprocessor_output"
] as const;

function sourceInputOptions(sourceInput?: string): { source_input?: string } {
  return sourceInput == null ? {} : { source_input: sourceInput };
}

function normalizeValidatorResult(result: unknown): { classification: string; output: string | null } {
  if (typeof result !== "object" || result === null) {
    throw new Error("validate_preprocessor_output returned non-object result");
  }

  const record = result as Record<string, unknown>;
  if (typeof record.classification !== "string") {
    throw new Error("validate_preprocessor_output result missing classification");
  }

  return {
    classification: record.classification,
    output: typeof record.output === "string" ? record.output : null
  };
}

function normalizeHeuristicResult(result: unknown): {
  outcome: string;
  directive: string | null;
  rule_id: string;
} {
  if (typeof result !== "object" || result === null) {
    throw new Error("preprocess_heuristic returned non-object result");
  }

  const record = result as Record<string, unknown>;
  expect(Object.prototype.hasOwnProperty.call(record, "outcome")).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(record, "directive")).toBe(true);
  expect(Object.prototype.hasOwnProperty.call(record, "rule_id")).toBe(true);

  const outcome = record.outcome;
  const directive = record.directive;
  const ruleId = record.rule_id;
  if (typeof outcome === "string" && typeof ruleId === "string") {
    if (directive !== null && typeof directive !== "string") {
      throw new Error("preprocess_heuristic directive must be string or explicit null");
    }
    return {
      outcome,
      directive,
      rule_id: ruleId
    };
  }

  throw new Error("preprocess_heuristic result missing expected Python public shape");
}

function jsonTypeMatches(value: unknown, expected: string): boolean {
  switch (expected) {
    case "null":
      return value === null;
    case "string":
      return typeof value === "string";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    default:
      return false;
  }
}

function assertShape(value: unknown, shape: PreprocessorApiContractShape): void {
  if (shape.any_of != null) {
    for (const variant of shape.any_of) {
      try {
        assertShape(value, variant);
        return;
      } catch {
        continue;
      }
    }
    throw new Error(`Value did not match any allowed shape: ${JSON.stringify(value)}`);
  }

  const expectedTypes = shape.type == null ? [] : Array.isArray(shape.type) ? shape.type : [shape.type];
  if (expectedTypes.length > 0) {
    expect(expectedTypes.some((expectedType) => jsonTypeMatches(value, expectedType))).toBe(true);
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of shape.required_keys ?? []) {
      expect(Object.prototype.hasOwnProperty.call(record, key)).toBe(true);
    }
    for (const [key, propertyShape] of Object.entries(shape.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        assertShape(record[key], propertyShape);
      }
    }
  }

  if (shape.enum != null) {
    expect(shape.enum).toContain(value);
  }
}

function invokeContractCallable(fn: (...args: unknown[]) => unknown, spec: PreprocessorApiCallableExportSpec, probeKwargs: Record<string, unknown>) {
  const args: unknown[] = [];
  const keywordOnly: Record<string, unknown> = {};

  for (const parameter of spec.parameters) {
    if (parameter.kind === "positional_or_keyword") {
      args.push(probeKwargs[parameter.name]);
      continue;
    }
    if (parameter.kind === "keyword_only" && Object.prototype.hasOwnProperty.call(probeKwargs, parameter.name)) {
      keywordOnly[parameter.name] = probeKwargs[parameter.name];
      continue;
    }
    if (parameter.kind === "keyword_only") {
      continue;
    }
    throw new Error(`Unsupported contract parameter kind in TS runner: ${parameter.kind}`);
  }

  if (Object.keys(keywordOnly).length > 0) {
    args.push(keywordOnly);
  }

  return fn(...args);
}

function assertCallableContract(name: string, exported: unknown, spec: PreprocessorApiCallableExportSpec): void {
  expect(typeof exported).toBe("function");
  const callable = exported as (...args: unknown[]) => unknown;
  const requiredParameterCount = spec.parameters.filter((parameter) => parameter.required).length;
  expect(callable.length).toBe(requiredParameterCount);

  for (const probe of spec.shape_probes ?? []) {
    const result = invokeContractCallable(callable, spec, probe.kwargs);
    if (spec.return_shape != null) {
      assertShape(result, spec.return_shape);
    }
  }
}

function applyStateStep(state: RenderPromptState, step: string): RenderPromptState {
  if (step === "clear premise") {
    return { ...state, premise: null };
  }
  if (step === "reset policies") {
    return { ...state, policies: {} };
  }
  if (step === "clear state") {
    return { premise: null, policies: {} };
  }

  const setPremise = /^set premise (.+\S)$/.exec(step);
  if (setPremise != null) {
    return { ...state, premise: setPremise[1] ?? null };
  }

  const changePremise = /^change premise to (.+\S)$/.exec(step);
  if (changePremise != null) {
    return { ...state, premise: changePremise[1] ?? null };
  }

  const useInsteadOf = /^use (.+\S) instead of (.+\S)$/.exec(step);
  if (useInsteadOf != null) {
    const nextPolicies = { ...state.policies };
    delete nextPolicies[useInsteadOf[2] ?? ""];
    nextPolicies[useInsteadOf[1] ?? ""] = true;
    return { ...state, policies: nextPolicies };
  }

  const useItem = /^use (.+\S)$/.exec(step);
  if (useItem != null) {
    return {
      ...state,
      policies: {
        ...state.policies,
        [useItem[1] ?? ""]: true
      }
    };
  }

  const prohibitItem = /^prohibit (.+\S)$/.exec(step);
  if (prohibitItem != null) {
    return {
      ...state,
      policies: {
        ...state.policies,
        [prohibitItem[1] ?? ""]: true
      }
    };
  }

  const removePolicy = /^remove policy (.+\S)$/.exec(step);
  if (removePolicy != null) {
    const nextPolicies = { ...state.policies };
    delete nextPolicies[removePolicy[1] ?? ""];
    return { ...state, policies: nextPolicies };
  }

  throw new Error(`Unsupported render_prompt behavior probe step: ${step}`);
}

function buildRenderPromptState(steps: string[]): RenderPromptState {
  return steps.reduce<RenderPromptState>(
    (state, step) => applyStateStep(state, step),
    { premise: null, policies: {} }
  );
}

async function runRenderPromptBehaviorProbe(
  exported: unknown,
  probe: PreprocessorApiRenderPromptFromFileBehaviorProbe
): Promise<void> {
  expect(typeof exported).toBe("function");
  const renderPrompt = exported as (path: string, state: RenderPromptState) => string | null;
  const tempDir = await mkdtemp(join(tmpdir(), "render-prompt-contract-"));
  const filePath = join(tempDir, probe.path);

  try {
    await writeFile(filePath, probe.template, "utf8");
    const result = renderPrompt(filePath, buildRenderPromptState(probe.state_steps));
    expect(result).toBe(probe.expect_result);
    for (const rejected of probe.reject_substrings ?? []) {
      expect(result).not.toContain(rejected);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function withPromptTemplateFile<T>(template: string, run: (path: string) => Promise<T> | T): Promise<T> {
  const tempDir = await mkdtemp(join(tmpdir(), "render-prompt-test-"));
  const filePath = join(tempDir, "template.txt");

  try {
    await writeFile(filePath, template, "utf8");
    return await run(filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function assertConstantContract(name: string, exported: unknown, spec: Extract<PreprocessorApiExportSpec, { kind: "constant" }>): void {
  expect(typeof exported).not.toBe("function");
  expect(exported).toEqual(spec.value);
}

describe("preprocessor api contract", () => {
  it("tracks the synced Python api-contract fixture while allowing only package-name differences", () => {
    expect(apiContract.kind).toBe("api-contract");
    expect(apiContract.module).toBe("context_compiler_directive_drafter");

    for (const name of apiContract.required_exports) {
      expect(name in preprocessor).toBe(true);
    }

    const expectedRuntimeExports = [...apiContract.required_exports, ...approvedTsRuntimeAliases].sort();
    const actualRuntimeExports = Object.keys(preprocessor).sort();
    expect(actualRuntimeExports).toEqual(expectedRuntimeExports);
  });

  it("keeps contract fixture entries unique", () => {
    expect(new Set(apiContract.required_exports).size).toBe(apiContract.required_exports.length);
    expect(new Set(apiContract.forbidden_exports ?? []).size).toBe((apiContract.forbidden_exports ?? []).length);
  });

  it("matches the hardened Python runtime export contract exactly", () => {
    expect([...apiContract.required_exports].sort()).toEqual([...expectedPythonRuntimeExports].sort());
  });

  it("excludes typing-only names from the contract fixture and runtime module", () => {
    for (const name of apiContract.forbidden_exports ?? []) {
      expect(apiContract.required_exports).not.toContain(name);
      expect(Object.prototype.hasOwnProperty.call(preprocessor, name)).toBe(false);
      expect(Object.keys(preprocessor)).not.toContain(name);
    }
  });

  it("describes every required export in the strengthened fixture schema", () => {
    expect(Object.keys(apiContract.exports ?? {}).sort()).toEqual([...apiContract.required_exports].sort());
  });

  it("enforces export kinds, constant values, probe invocations, return shapes, and behavior probes", async () => {
    for (const [name, spec] of Object.entries(apiContract.exports ?? {})) {
      const exported = pre[name];
      expect(exported).not.toBeUndefined();

      if (spec.kind === "callable") {
        assertCallableContract(name, exported, spec);
        for (const behaviorProbe of spec.behavior_probes ?? []) {
          if (behaviorProbe.kind === "render_prompt_from_file") {
            await runRenderPromptBehaviorProbe(exported, behaviorProbe);
            continue;
          }
          throw new Error(`Unsupported behavior probe for ${name}: ${behaviorProbe.kind}`);
        }
        continue;
      }

      if (spec.kind === "constant") {
        assertConstantContract(name, exported, spec);
        continue;
      }

      throw new Error(`Unsupported contract kind for ${name}`);
    }
  });

  it("adds camelCase aliases for snake_case validator/parser exports", () => {
    expect(preprocessor.validatePreprocessorOutput).toBe(preprocessor.validate_preprocessor_output);
    expect(preprocessor.parsePreprocessorOutput).toBe(preprocessor.parse_preprocessor_output);
  });

  it("supports both source_input and sourceInput options with identical behavior", () => {
    const rawOutput = "use docker";
    const sourceInput = "can you use docker?";

    expect(preprocessor.validatePreprocessorOutput(rawOutput, { source_input: sourceInput })).toEqual(
      preprocessor.validatePreprocessorOutput(rawOutput, { sourceInput })
    );
    expect(preprocessor.parsePreprocessorOutput(rawOutput, { source_input: sourceInput })).toEqual(
      preprocessor.parsePreprocessorOutput(rawOutput, { sourceInput })
    );
  });

  it("accepts canonical snake_case callable arguments directly", () => {
    expect(preprocessor.validate_preprocessor_output("use docker", "use docker")).toEqual(
      preprocessor.validate_preprocessor_output("use docker", { source_input: "use docker" })
    );
    expect(preprocessor.parse_preprocessor_output("use docker", "use docker")).toEqual(
      preprocessor.parse_preprocessor_output("use docker", { source_input: "use docker" })
    );
  });

  it("returns the strengthened Python public heuristic shape", () => {
    if (typeof preprocessor.preprocess_heuristic !== "function") {
      throw new Error("Missing preprocess_heuristic export");
    }

    const result = normalizeHeuristicResult(preprocessor.preprocess_heuristic("use docker"));
    expect(result).toEqual({
      outcome: "directive",
      directive: "use docker",
      rule_id: "canonical.full_match"
    });
  });
});

describe("render_prompt", () => {
  it("returns null for non-string template input", () => {
    const rendered = preprocessor.render_prompt(123 as unknown as string, {
      premise: null,
      policies: {}
    });

    expect(rendered).toBeNull();
  });

  it("returns null when the prompt file cannot be loaded", () => {
    const rendered = preprocessor.render_prompt("/tmp/does-not-exist-prompt-template.txt", {
      premise: null,
      policies: {}
    });

    expect(rendered).toBeNull();
  });

  it("renders null premise and empty policies without placeholder tokens", async () => {
    const rendered = await withPromptTemplateFile(
      "# Heading\n\n* premise: <NULL_OR_VALUE>\n* policies: <SET OF CURRENT POLICY ITEMS>",
      (path) =>
        preprocessor.render_prompt(path, {
          premise: null,
          policies: {}
        })
    );

    expect(rendered).toBe("* premise: null\n* policies: (none)");
    expect(rendered).not.toContain("<NULL_OR_VALUE>");
    expect(rendered).not.toContain("<SET OF CURRENT POLICY ITEMS>");
  });

  it("deduplicates and sorts normalized policy names", async () => {
    const rendered = await withPromptTemplateFile("* policies: <SET OF CURRENT POLICY ITEMS>", (path) =>
      preprocessor.render_prompt(path, {
        premise: null,
        policies: {
          shared: true,
          Shared: true,
          "the zeta": true,
          beta_item: true,
          "an alpha": true
        }
      })
    );

    expect(rendered).toBe("* policies: alpha, beta item, shared, zeta");
    expect(rendered?.match(/shared/g)?.length ?? 0).toBe(1);
  });

  it("normalizes newline premise text deterministically", async () => {
    const rendered = await withPromptTemplateFile("* premise: <NULL_OR_VALUE>", (path) =>
      preprocessor.render_prompt(path, {
        premise: "first line\nsecond line!",
        policies: {}
      })
    );

    expect(rendered).toBe("* premise: first line\nsecond line!");
  });
});

describe("preprocessor fixtures", () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      if (fixture.payload.kind === "heuristic") {
        if (typeof pre.preprocess_heuristic !== "function") {
          throw new Error("Missing preprocess_heuristic export");
        }

        const actual = normalizeHeuristicResult(pre.preprocess_heuristic(fixture.payload.input as string));
        expect(actual.outcome).toEqual(fixture.payload.expected?.classification);
        expect(actual.directive).toEqual(fixture.payload.expected?.output ?? null);
        expect(actual.rule_id).toEqual(expect.any(String));
        return;
      }

      if (fixture.payload.kind === "validator") {
        if (typeof pre.validate_preprocessor_output !== "function") {
          throw new Error("Missing validate_preprocessor_output export");
        }

        const actual = normalizeValidatorResult(
          pre.validate_preprocessor_output(fixture.payload.raw_output, {
            ...sourceInputOptions(fixture.payload.source_input)
          })
        );
        expect(actual).toEqual(fixture.payload.expected);
        return;
      }

      if (typeof pre.parse_preprocessor_output !== "function") {
        throw new Error("Missing parse_preprocessor_output export");
      }

      const parsed = pre.parse_preprocessor_output(fixture.payload.raw_output, {
        ...sourceInputOptions(fixture.payload.source_input)
      });
      expect(parsed).toEqual(fixture.payload.expected_parsed);
    });
  }
});

describe("validator defensive coverage", () => {
  it("rejects structured directive output when output is non-string", () => {
    expect(
      preprocessor.validate_preprocessor_output({
        classification: "directive",
        output: 123
      })
    ).toEqual({
      classification: "unknown",
      output: null
    });
  });

  it("rejects fenced source-aware fallback rewrites as unknown", () => {
    expect(
      preprocessor.validate_preprocessor_output("use docker", {
        source_input: "~~~ use docker ~~~"
      })
    ).toEqual({
      classification: "unknown",
      output: null
    });
  });

  it("rejects backtick-fenced source-aware fallback rewrites as unknown", () => {
    expect(
      preprocessor.validate_preprocessor_output("use docker", {
        source_input: "```\nuse docker\n```"
      })
    ).toEqual({
      classification: "unknown",
      output: null
    });
  });

  it("rejects sentence-adjacent source-aware fallback rewrites as unknown", () => {
    expect(
      preprocessor.validate_preprocessor_output("prohibit peanuts", {
        source_input: "ok. prohibit peanuts"
      })
    ).toEqual({
      classification: "unknown",
      output: null
    });
  });
});
