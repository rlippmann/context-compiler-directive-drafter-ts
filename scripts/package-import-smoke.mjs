import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function main() {
  const packDir = resolve(process.argv[2] ?? ".");
  const tempDir = await mkdtemp(join(tmpdir(), "context-compiler-directive-drafter-import-smoke-"));

  try {
    await mkdir(packDir, { recursive: true });
    await mkdir(join(tempDir, "consumer"), { recursive: true });

    const tarballs = (await readdir(packDir))
      .filter((entry) => entry.endsWith(".tgz"))
      .sort();
    if (tarballs.length !== 1) {
      throw new Error(`Expected exactly one tarball in ${packDir}, found ${tarballs.length}`);
    }

    const consumerDir = join(tempDir, "consumer");
    const tarballPath = join(packDir, tarballs[0]);
    await execFileAsync(
      "npm",
      [
        "install",
        "--no-package-lock",
        "--ignore-scripts",
        tarballPath
      ],
      { cwd: consumerDir }
    );

    const verification = `
      import { accessSync, constants } from "node:fs";
      import { dirname, join } from "node:path";
      import { fileURLToPath } from "node:url";
      const mod = await import("@rlippmann/context-compiler-directive-drafter");
      const expected = [
        "PREPROCESSOR_NO_DIRECTIVE_SENTINEL",
        "parse_preprocessor_output",
        "preprocess_heuristic",
        "render_prompt",
        "validate_preprocessor_output"
      ];
      for (const name of expected) {
        if (!(name in mod)) {
          throw new Error(\`Missing export: \${name}\`);
        }
      }
      if (typeof mod.preprocess_heuristic !== "function") {
        throw new Error("preprocess_heuristic should be a function");
      }
      if (typeof mod.renderPrompt !== "function") {
        throw new Error("renderPrompt should be a function");
      }

      const packageEntryUrl = await import.meta.resolve("@rlippmann/context-compiler-directive-drafter");
      const packageRoot = dirname(dirname(fileURLToPath(packageEntryUrl)));
      const defaultPromptPath = join(packageRoot, "prompts", "default.txt");
      const llamaPromptPath = join(packageRoot, "prompts", "llama.txt");

      accessSync(defaultPromptPath, constants.R_OK);
      accessSync(llamaPromptPath, constants.R_OK);

      const rendered = mod.renderPrompt(defaultPromptPath, {
        premise: "concise replies",
        policies: { docker: true }
      });
      if (typeof rendered !== "string") {
        throw new Error("renderPrompt should return a string for a shipped prompt path");
      }
      if (!rendered.includes("concise replies")) {
        throw new Error("renderPrompt did not render premise into shipped prompt");
      }
      if (!rendered.includes("docker")) {
        throw new Error("renderPrompt did not render policy into shipped prompt");
      }
    `;

    await execFileAsync("node", ["--input-type=module", "--eval", verification], {
      cwd: consumerDir
    });

    const installedPackageJson = JSON.parse(
      await readFile(
        join(
          consumerDir,
          "node_modules",
          "@rlippmann",
          "context-compiler-directive-drafter",
          "package.json"
        ),
        "utf8"
      )
    );

    const publishedFiles = installedPackageJson.files;
    if (!Array.isArray(publishedFiles) || !publishedFiles.includes("dist")) {
      throw new Error("Installed package metadata is missing dist in files");
    }

    process.stdout.write(`import smoke passed for ${basename(tarballPath)}\n`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
