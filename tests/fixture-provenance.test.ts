import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd());
const CHECK_SCRIPT = resolve(ROOT, 'scripts', 'fixtures-check.sh');
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'drafter-fixtures-'));
  tempDirs.push(dir);
  return dir;
}

function run(script: string, cwd: string, source?: string) {
  return spawnSync('bash', [script], {
    cwd,
    env: { ...process.env, ...(source == null ? {} : { DRAFTER_FIXTURES_SOURCE: source }) },
    encoding: 'utf8'
  });
}

function createSourceRepo(): { dir: string; commit: string } {
  const dir = makeTempDir();
  const source = join(dir, 'fixtures');
  mkdirSync(join(source, 'contracts', 'prompts'), { recursive: true });
  writeFileSync(join(source, 'contracts', 'public-api.json'), '{}\n', 'utf8');
  writeFileSync(join(source, 'contracts', 'prompts', 'default.txt'), 'prompt\n', 'utf8');

  for (const args of [
    ['init'],
    ['config', 'user.name', 'Fixture Tests'],
    ['config', 'user.email', 'fixtures@example.com'],
    ['add', '.'],
    ['commit', '-m', 'fixture source']
  ]) {
    expect(spawnSync('git', args, { cwd: dir, encoding: 'utf8' }).status).toBe(0);
  }

  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' });
  expect(result.status).toBe(0);
  return { dir: source, commit: result.stdout.trim() };
}

function prepareWorkspace(root: string, commit: string): string {
  const target = join(root, 'tests', 'fixtures', 'drafter');
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, '.source-commit'), `${commit}\n`, 'utf8');
  return target;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('fixture provenance tooling', () => {
  it('requires an explicit source path', () => {
    const result = run(CHECK_SCRIPT, makeTempDir());
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('DRAFTER_FIXTURES_SOURCE is required');
  });

  it('rejects a missing source path and a source outside Git', () => {
    const root = makeTempDir();
    prepareWorkspace(root, 'a'.repeat(40));

    const missing = run(CHECK_SCRIPT, root, join(root, 'missing'));
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain('Source fixture directory not found');

    const outsideGit = makeTempDir();
    prepareWorkspace(outsideGit, 'a'.repeat(40));
    const result = run(CHECK_SCRIPT, outsideGit, join(outsideGit, 'source'));
    expect(result.status).not.toBe(0);
  });

  it('rejects missing and malformed provenance', () => {
    const source = createSourceRepo();
    const root = makeTempDir();
    const target = prepareWorkspace(root, source.commit);
    rmSync(join(target, '.source-commit'));

    const missing = run(CHECK_SCRIPT, root, source.dir);
    expect(missing.stderr).toContain('Missing provenance file');

    writeFileSync(join(target, '.source-commit'), 'not-a-sha\n', 'utf8');
    const malformed = run(CHECK_SCRIPT, root, source.dir);
    expect(malformed.stderr).toContain('lowercase 40-character commit SHA');
  });

  it('verifies the pinned checkout and detects recursive drift', () => {
    const source = createSourceRepo();
    const root = makeTempDir();
    const target = prepareWorkspace(root, source.commit);
    mkdirSync(join(target, 'contracts', 'prompts'), { recursive: true });
    writeFileSync(join(target, 'contracts', 'public-api.json'), '{}\n', 'utf8');
    writeFileSync(join(target, 'contracts', 'prompts', 'default.txt'), 'prompt\n', 'utf8');

    const matching = run(CHECK_SCRIPT, root, source.dir);
    expect(matching.status).toBe(0);

    writeFileSync(join(source.dir, 'later.txt'), 'later\n', 'utf8');
    for (const args of [['add', '.'], ['commit', '-m', 'later source revision']]) {
      expect(spawnSync('git', args, { cwd: source.dir, encoding: 'utf8' }).status).toBe(0);
    }
    const wrongRevision = run(CHECK_SCRIPT, root, source.dir);
    expect(wrongRevision.status).toBe(1);
    expect(wrongRevision.stderr).toContain('Source checkout commit mismatch');

    const currentCommit = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: source.dir,
      encoding: 'utf8'
    }).stdout.trim();
    writeFileSync(join(target, '.source-commit'), `${currentCommit}\n`, 'utf8');
    writeFileSync(join(target, 'contracts', 'prompts', 'default.txt'), 'drift\n', 'utf8');
    const drift = run(CHECK_SCRIPT, root, source.dir);
    expect(drift.status).toBe(1);
    expect(drift.stderr).toContain('Fixture drift detected');
  });

});
