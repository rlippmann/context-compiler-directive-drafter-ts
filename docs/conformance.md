# Conformance

This document covers maintainer-oriented fixture sync and cross-language contract expectations for `@rlippmann/context-compiler-directive-drafter`.

## Source Of Truth

Portable preprocessor fixtures and the public API contract fixture are synced from the Python `context-compiler-directive-drafter` repository.

Synced source directory:

- `tests/fixtures/preprocessor/`

Synced contract material includes:

- portable heuristic fixtures
- portable validator fixtures
- portable parse fixtures
- `public-api-v1.json`

## Refresh Fixtures

Refresh local fixtures from a Python directive-drafter checkout:

```bash
PREPROCESSOR_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures/preprocessor npm run fixtures:preprocessor:sync
```

## Drift Checks

Check local fixture drift against a Python directive-drafter checkout:

```bash
PREPROCESSOR_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures/preprocessor npm run fixtures:preprocessor:check
```

CI should provide `PREPROCESSOR_FIXTURES_SOURCE` explicitly.

## .source-commit

Fixture sync records the upstream Python directive-drafter commit in:

- `tests/fixtures/preprocessor/.source-commit`

Drift checks verify both:

- synced fixture files still match the source checkout
- the recorded upstream commit still matches the source checkout used for the check

## public-api-v1.json

`tests/fixtures/preprocessor/public-api-v1.json` is the shared cross-language public API contract fixture.

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
