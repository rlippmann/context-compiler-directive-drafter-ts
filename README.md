# @rlippmann/context-compiler-directive-drafter

`@rlippmann/context-compiler-directive-drafter` is the planned TypeScript home for the Context Compiler Directive Drafter.

The Context Compiler core is the Authority Layer.

The Directive Drafter is the Acquisition Layer.

Drafting proposes; authority decides.

The Directive Drafter never mutates authoritative state.

The Directive Drafter never bypasses `engine.step(...)`.

Only the Context Compiler core may apply directives or change authoritative state.

## Status

This initial TypeScript package is scaffolding only.

It sets up package metadata, TypeScript compilation, Vitest, CI, and repository structure.

It does not implement drafting behavior yet.

`draft_directive()` is intentionally out of scope for this initial scaffold.

## Design boundary

When this package grows beyond scaffolding, it should:

- propose candidate directives from natural-language input
- keep those proposals non-authoritative
- hand off any authoritative decision to the Context Compiler core

This package must never treat drafted output as equivalent to an engine decision.

## Development

Install dependencies:

```bash
npm install
```

Run the build:

```bash
npm run build
```

Run type checking:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

## Preprocessor Fixtures

This repository syncs portable preprocessor fixtures from the Python
`context-compiler-directive-drafter` source corpus into
`tests/fixtures/preprocessor`.

Refresh local fixtures:

```bash
PREPROCESSOR_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures/preprocessor npm run fixtures:preprocessor:sync
```

Check for fixture drift:

```bash
PREPROCESSOR_FIXTURES_SOURCE=/path/to/context-compiler-directive-drafter/tests/fixtures/preprocessor npm run fixtures:preprocessor:check
```

CI should provide `PREPROCESSOR_FIXTURES_SOURCE` explicitly as well. This
matches the existing `context-compiler-ts` pattern of requiring an explicit
fixture source for drift checks rather than silently defaulting to a local path.

Sync also records the upstream Python directive-drafter commit in
`tests/fixtures/preprocessor/.source-commit`. Drift checks verify both:

- synced fixture files still match the source checkout
- the recorded upstream commit still matches the source checkout used for the check

`public-api-v1.json` is synced from Python too. If this package needs to handle
module/package naming differences, that should happen narrowly in the test
harness rather than by excluding the shared API-contract fixture from sync or
drift checks.
