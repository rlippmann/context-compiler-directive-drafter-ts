import { describe, expect, it } from "vitest";

import { getScaffoldInfo } from "../src/index.js";

describe("getScaffoldInfo", () => {
  it("reports scaffold-only package metadata", () => {
    expect(getScaffoldInfo()).toEqual({
      packageName: "@rlippmann/context-compiler-directive-drafter",
      status: "scaffold",
      version: "0.1.0"
    });
  });
});
