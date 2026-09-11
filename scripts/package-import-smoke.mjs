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
      const mod = await import("@rlippmann/context-compiler-directive-drafter");
      const expected = [
        "DirectiveDrafter",
        "DraftResult",
        "RejectedDirective",
        "UnknownDirective",
        "REASON_NON_DIRECTIVE",
        "REASON_INCOMPLETE",
        "REASON_MULTIPLE_DIRECTIVES",
        "REASON_INVALID_CANDIDATE"
      ];
      for (const name of expected) {
        if (!(name in mod)) {
          throw new Error(\`Missing export: \${name}\`);
        }
      }
      const fallbackMod = await import("@rlippmann/context-compiler-directive-drafter/fallbacks");
      if (typeof fallbackMod.getFallbackProfile !== "function") {
        throw new Error("getFallbackProfile should be available from the fallbacks subpath");
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
