import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import * as ts from "typescript";

import { describe, expect, it } from "vitest";

import * as api from "../src/index.js";

type Contract = {
  forbidden_exports: string[];
  exports: {
    mode: "exact";
    names: string[];
    members: Record<string, { kind: string; value?: string; portable_members?: { mode: "exact"; members: Record<string, { kind: string; async?: boolean }> } }>;
  };
};

const contractPath = fileURLToPath(new URL("./fixtures/drafter/contracts/public-api-v1.json", import.meta.url));
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as Contract;

function sourceExportNames(): Set<string> {
  const sourcePath = resolve(process.cwd(), "src", "index.ts");
  const program = ts.createProgram([sourcePath], { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, strict: true });
  const source = program.getSourceFile(sourcePath);
  if (source === undefined) throw new Error(`Unable to load ${sourcePath}`);
  const symbol = program.getTypeChecker().getSymbolAtLocation(source);
  if (symbol === undefined) throw new Error(`Unable to inspect exports from ${sourcePath}`);
  return new Set(program.getTypeChecker().getExportsOfModule(symbol).map((exported) => exported.getName()));
}

const declaredExportNames = sourceExportNames();

describe("Python portable public API contract", () => {
  it("matches the fixture's exact TypeScript declaration export set", () => {
    expect(contract.exports.mode).toBe("exact");
    expect([...declaredExportNames].sort()).toEqual([...contract.exports.names].sort());
  });

  it("matches the fixture's exact runtime export set and constants", () => {
    const runtime = api as unknown as Record<string, unknown>;
    const runtimeNames = contract.exports.names.filter((name) => contract.exports.members[name]?.kind !== "type_alias");
    expect(Object.keys(runtime).sort()).toEqual(runtimeNames.sort());
    for (const name of runtimeNames) expect(runtime[name], `Missing runtime export ${name}`).toBeDefined();
    for (const [name, member] of Object.entries(contract.exports.members)) {
      if (member.kind === "constant") expect(runtime[name]).toBe(member.value);
    }
    for (const name of contract.forbidden_exports) expect(runtime[name], `Forbidden export ${name}`).toBeUndefined();
  });

  it("consumes the declared portable DirectiveDrafter member surface", () => {
    const expected = contract.exports.members.DirectiveDrafter!.portable_members;
    expect(expected?.mode).toBe("exact");
    const expectedMembers = expected?.members ?? {};
    const actualMembers = Object.getOwnPropertyNames(api.DirectiveDrafter.prototype).filter((name) => name !== "constructor").sort();
    expect(actualMembers).toEqual(Object.keys(expectedMembers).sort());
    for (const [name, member] of Object.entries(expectedMembers)) {
      const descriptor = Object.getOwnPropertyDescriptor(api.DirectiveDrafter.prototype, name);
      expect(descriptor, `Missing portable member ${name}`).toBeDefined();
      if (member.kind !== "operation") continue;
      expect(typeof descriptor?.value, `${name} should be an operation`).toBe("function");
      expect(descriptor?.value?.constructor.name === "AsyncFunction", `${name} async metadata`).toBe(member.async === true);
    }
  });
});
