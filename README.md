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
