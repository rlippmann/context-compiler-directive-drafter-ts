import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  DirectiveDrafter,
  DraftResult,
  FallbackProfile,
  InvalidFallbackResponseError,
  RejectedDirective,
  UnknownDirective,
  getFallbackProfile,
  parseStructuredResponse
} from "../src/index.js";
import { CanonicalDirective } from "@rlippmann/context-compiler/grammar";

const CONTRACTS = fileURLToPath(new URL("./fixtures/drafter/contracts", import.meta.url));
const highLevel = JSON.parse(readFileSync(join(CONTRACTS, "high-level-drafting-v1.json"), "utf8")) as Record<string, any>;
const fallbackContract = JSON.parse(readFileSync(join(CONTRACTS, "fallback-integration-v1.json"), "utf8")) as Record<string, any>;

function serialize(value: unknown): unknown {
  if (value instanceof CanonicalDirective) return { text: value.text, kind: value.kind, operands: value.operands };
  if (value instanceof RejectedDirective) return { variant: "rejected", reason: value.reason };
  if (value instanceof UnknownDirective) return { variant: "unknown", reason: value.reason };
  if (value instanceof DraftResult) return { source: value.source, result: serialize(value.result) };
  return value;
}

function assertShape(value: unknown, shape: Record<string, any>): void {
  if (shape.any_of) {
    expect(shape.any_of.some((candidate: Record<string, any>) => { try { assertShape(value, candidate); return true; } catch { return false; } })).toBe(true);
    return;
  }
  if (shape.type === "object") {
    expect(value).toBeTypeOf("object");
    expect(value).not.toBeNull();
    const object = value as Record<string, unknown>;
    for (const key of shape.required_keys ?? []) expect(object).toHaveProperty(key);
    for (const [key, propertyShape] of Object.entries(shape.properties ?? {})) assertShape(object[key], propertyShape as Record<string, any>);
  } else if (shape.type === "string") expect(value).toBeTypeOf("string");
  else expect(value).toBeNull();
  if ("const" in shape) expect(value).toBe(shape.const);
}

function fallbackOutput(kind: string): string | null {
  if (kind === "canonical") return "use docker";
  if (kind === "abstention") return "<NO_DIRECTIVE>";
  if (kind === "none") return null;
  return "not a directive";
}

describe("Python high-level drafting contract", () => {
  it.each<any>(highLevel.members.DirectiveDrafter.behavior_probes)("matches probe %#", async (probe: any) => {
    const calls = { count: 0 };
    const fallback = (_input: string) => { calls.count += 1; return fallbackOutput(probe.fallback_output ?? "canonical"); };
    const hasFallback = probe.kind === "directive_drafter_fallback_routing";
    const drafter = new DirectiveDrafter(hasFallback ? fallback : null, "contract-fallback", hasFallback ? async (_input) => { calls.count += 1; return fallbackOutput(probe.fallback_output ?? "canonical"); } : null, "contract-fallback");
    const result = probe.mode === "async" ? await drafter.async_draft_directive(probe.user_input) : drafter.draft_directive(probe.user_input);
    expect(calls.count).toBe(probe.expect_fallback_calls ?? 0);
    expect(serialize(result)).toMatchObject({ source: probe.expect_source ?? "heuristic" });
    assertShape(serialize(result), probe.expect_result);
  });

  it("supports sync and async fallback configuration probes", async () => {
    const sync = new DirectiveDrafter((_input) => "use docker");
    expect(sync.fallback).toBe(true);
    sync.configure_fallback((_input) => "use podman", "configured-sync");
    expect(sync.draft_directive("Could we maybe use uv later").source).toBe("configured-sync");
    sync.configureFallback((_input) => "use docker", "replaced-sync");
    expect(sync.draftDirective("Could we maybe use uv later").source).toBe("replaced-sync");
    sync.clear_fallback();
    expect(sync.fallback).toBe(false);

    const asyncDrafter = new DirectiveDrafter(null, "fallback", async (_input) => "use docker");
    expect(asyncDrafter.async_fallback).toBe(true);
    asyncDrafter.configure_async_fallback(async (_input) => "use podman", "configured-async");
    await expect(asyncDrafter.async_draft_directive("Could we maybe use uv later")).resolves.toMatchObject({ source: "configured-async" });
    asyncDrafter.configureAsyncFallback(async (_input) => "use docker", "replaced-async");
    await expect(asyncDrafter.asyncDraftDirective("Could we maybe use uv later")).resolves.toMatchObject({ source: "replaced-async" });
    asyncDrafter.clear_async_fallback();
    expect(asyncDrafter.async_fallback).toBe(false);
  });
});

describe("Python provider-neutral fallback contract", () => {
  it.each<any>(fallbackContract.profiles)("matches profile %s", (expected: any) => {
    const profile = getFallbackProfile({ structuredOutput: expected.structured_output, allowedDirectiveKinds: expected.allowed_directive_kinds });
    expect(profile).toBeInstanceOf(FallbackProfile);
    expect(profile.mode).toBe(expected.mode);
    expect(profile.systemPrompt).toBe(readFileSync(join(CONTRACTS, expected.system_prompt_fixture), "utf8").replace(/\n$/u, ""));
    expect(createHash("sha256").update(profile.systemPrompt).digest("hex")).toBe(expected.system_prompt_sha256);
    expect(profile.responseSchema).toEqual(expected.response_schema);
    expect(profile.abstentionSentinel).toBe(expected.abstention_sentinel);
  });

  it("parses structured rejection and reports malformed responses", () => {
    expect(parseStructuredResponse('{"classification":"rejected","output":null}')).toBeNull();
    expect(() => parseStructuredResponse('{"classification":"directive","output":null}')).toThrow(InvalidFallbackResponseError);
    expect(() => parseStructuredResponse("not json")).toThrow(InvalidFallbackResponseError);
  });

  it("renders a hard restriction for non-use directive kinds", () => {
    const profile = getFallbackProfile({ allowedDirectiveKinds: ["clear_state"] });
    const canonicalForms = profile.systemPrompt.match(/Canonical directive forms:[\s\S]*?(?=\n\nWhat premise vs policy means:)/u)?.[0];
    expect(canonicalForms).toBe("Canonical directive forms:\n- `clear state` (Administrative)");
    expect(profile.systemPrompt).toContain("Only these directive kinds may be proposed: `clear_state`.");
    expect(profile.systemPrompt).not.toContain("- `use <item>` (Policy)");
  });
});
