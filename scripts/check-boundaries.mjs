import { readFile } from "node:fs/promises";
import { extname, relative } from "node:path";

const roots = ["src", "examples"];
const allowedExtensions = new Set([".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]);

const checks = [
  {
    pattern: "createEngine(",
    rationale: "Package source and package-owned examples should not construct compiler authority objects."
  },
  {
    pattern: "engine.step(",
    rationale: "The drafter proposes candidate directives; only hosts using context-compiler should drive authoritative engine steps."
  },
  {
    pattern: "engine.state",
    rationale: "The acquisition layer must not read or edit authoritative engine state directly."
  },
  {
    pattern: ".state =",
    rationale: "Direct .state assignment is a simple signal for possible authoritative state mutation across the boundary."
  },
  {
    pattern: "@rlippmann/context-compiler",
    rationale: "Package source and package-owned examples should not import the authority-layer package."
  }
];

async function listFiles(root) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
      continue;
    }
    if (entry.isFile() && allowedExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function formatLocation(filePath, content, index) {
  const before = content.slice(0, index);
  const line = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEndIndex = content.indexOf("\n", index);
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
  const snippet = content.slice(lineStart, lineEnd).trim();
  return {
    filePath,
    line,
    snippet
  };
}

async function main() {
  const violations = [];
  const files = (await Promise.all(roots.map((root) => listFiles(root)))).flat().sort();

  for (const filePath of files) {
    const content = await readFile(filePath, "utf8");
    for (const check of checks) {
      const index = content.indexOf(check.pattern);
      if (index === -1) {
        continue;
      }
      violations.push({
        ...formatLocation(filePath, content, index),
        pattern: check.pattern,
        rationale: check.rationale
      });
    }
  }

  if (violations.length === 0) {
    console.log("Boundary checks passed for src/** and examples/**.");
    return;
  }

  console.error("Boundary check failed. Found acquisition-layer boundary violations:");
  for (const violation of violations) {
    console.error(
      `- ${relative(process.cwd(), violation.filePath)}:${violation.line} matched ${JSON.stringify(violation.pattern)}`
    );
    console.error(`  Rationale: ${violation.rationale}`);
    console.error(`  Snippet: ${violation.snippet}`);
  }
  process.exitCode = 1;
}

await main();
