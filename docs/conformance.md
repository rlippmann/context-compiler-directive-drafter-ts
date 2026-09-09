# Conformance

This document covers maintainer-oriented fixture sync and cross-language contract expectations for `@rlippmann/context-compiler-directive-drafter`.

## Source Of Truth

The complete Python-owned fixture tree is synchronized from the Python `context-compiler-directive-drafter` repository. The TypeScript repository stores it as a read-only external artifact; later PRs will add tests that consume it.

Synced source directory:

- `tests/fixtures/drafter/`

Synced contract material includes:

- the complete Python `tests/fixtures/` tree, including contracts, prompts,
  normalization data, and preprocessor fixtures

## Refresh Fixtures

Refresh local fixtures from a Python directive-drafter checkout:

```bash
DRAFTER_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures npm run fixtures:sync
```

## Drift Checks

Check local fixture drift against a Python directive-drafter checkout:

```bash
DRAFTER_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures npm run fixtures:check
```

CI provides `DRAFTER_FIXTURES_SOURCE` explicitly for fixture drift checks.

## .source-commit

Fixture sync records the upstream Python directive-drafter commit in:

- `tests/fixtures/.source-commit`

Drift checks verify both:

- synced fixture files still match the source checkout
- the recorded upstream commit still matches the source checkout used for the check

## public-api-v1.json

The synchronized `tests/fixtures/drafter/` tree is owned by the Python drafter.
Do not hand-edit its files. Update the Python source first, then synchronize
from the pinned checkout.

It defines contract expectations such as:

- required and forbidden exports
- constant values
- callable parameter contracts
- return-shape contracts
- behavior probes where portable contract behavior needs direct execution

Canonical cross-language API names in the shared contract fixture are `snake_case`.

The TypeScript package may expose camelCase ergonomic aliases for consumer code, but the shared public API contract fixture remains the canonical snake_case source of truth.

TypeScript-specific package naming differences should be handled narrowly in the test harness, not by diverging from the shared contract fixture.

## Cross-Language Expectations

The Python directive-drafter fixture corpus is the semantic source of truth for the portable drafting surface.

The TypeScript package is expected to preserve parity for:

- heuristic classification/output behavior covered by portable fixtures
- validator behavior covered by portable fixtures
- parse behavior covered by portable fixtures
- shared public API contract expectations in `public-api-v1.json`

Some tests remain language-local when they are not expressed as portable fixtures. When portable contract coverage is strengthened upstream, the synced fixture corpus should be refreshed here rather than redefined independently in TypeScript.
