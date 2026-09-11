import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import * as ts from "typescript";

import { describe, expect, it } from "vitest";

import * as fallbacks from "../src/fallbacks.js";

type Contract = {
  exports: { mode: "exact"; names: string[]; members: Record<string, { kind: string }> };
  forbidden_exports: string[];
};

const fixturePath = fileURLToPath(new URL("./fixtures/drafter/contracts/fallbacks-api-v1.json", import.meta.url));
const contract = JSON.parse(readFileSync(fixturePath, "utf8")) as Contract;
const names: Record<string, string> = {
  get_fallback_profile: "getFallbackProfile",
  parse_structured_response: "parseStructuredResponse"
};

function sourceExportNames(): Set<string> {
  const sourcePath = resolve(process.cwd(), "src", "fallbacks.ts");
  const program = ts.createProgram([sourcePath], { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, strict: true });
  const source = program.getSourceFile(sourcePath);
  if (source === undefined) throw new Error(`Unable to load ${sourcePath}`);
  const symbol = program.getTypeChecker().getSymbolAtLocation(source);
  if (symbol === undefined) throw new Error(`Unable to inspect exports from ${sourcePath}`);
  return new Set(program.getTypeChecker().getExportsOfModule(symbol).map((exported) => exported.getName()));
}

const declaredExportNames = sourceExportNames();

describe("Python portable fallbacks API contract", () => {
  it("matches the exact declaration export set with idiomatic TypeScript operation names", () => {
    const expected = contract.exports.names.map((name) => names[name] ?? name).sort();
    expect(contract.exports.mode).toBe("exact");
    expect([...declaredExportNames].sort()).toEqual(expected);
  });

  it("matches the exact runtime export set and forbidden exports", () => {
    const runtime = fallbacks as unknown as Record<string, unknown>;
    const expected = contract.exports.names
      .filter((name) => contract.exports.members[name]?.kind !== "type_alias")
      .map((name) => names[name] ?? name)
      .sort();
    expect(Object.keys(runtime).sort()).toEqual(expected);
    for (const name of expected) expect(runtime[name]).toBeDefined();
    for (const name of contract.forbidden_exports) expect(runtime[name]).toBeUndefined();
  });
});
