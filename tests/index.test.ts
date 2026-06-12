import { describe, expect, it } from "vitest";

describe("package entrypoint", () => {
  it("loads without exposing scaffold-only exports", async () => {
    const module = await import("../src/index.js");

    expect(Object.keys(module)).toEqual([]);
  });
});
