# @rlippmann/context-compiler-directive-drafter

## Overview

Sometimes a user message looks like an instruction to change persistent conversation behavior, but sometimes it is only:

- a question
- a quoted example
- reported speech
- mixed-intent text
- malformed directive-like text

A host needs a safe way to tell the difference before treating that message like a real directive.

`@rlippmann/context-compiler-directive-drafter` helps a TypeScript host turn natural-language requests into candidate Context Compiler directives without guessing when the message is ambiguous.

## Install

```bash
npm install @rlippmann/context-compiler-directive-drafter @rlippmann/context-compiler
```

## What It Does

This package gives a host a conservative drafting layer that can:

- recognize directive-shaped user input
- draft a candidate directive from that input
- validate candidate output from another drafting step
- parse safe candidate directives from raw output
- render drafting prompts for LLM-based directive drafting

It prefers `unknown` or `null` over unsafe rewrites.

## Example

If a user says:

> Please use Docker for container examples.

your host may want a candidate directive like:

> use docker

You can draft and validate that candidate like this:

```ts
import { DirectiveDrafter } from "@rlippmann/context-compiler-directive-drafter";

const userMessage = "Please use Docker for container examples.";
const draft = new DirectiveDrafter().draft_directive(userMessage);
console.log("Candidate draft:", draft);
```

## API

The root entry point exposes `DirectiveDrafter`, `DraftResult`, `RejectedDirective`,
`UnknownDirective`, and the four rejection reason constants. Its methods use the
portable snake_case names declared by the conformance contract. Drafts are
non-authoritative proposals; the Context Compiler remains responsible for
canonical decisions and state changes.

Provider-neutral fallback profiles are available from the `./fallbacks` subpath:

```ts
import {
  getFallbackProfile,
  parseStructuredResponse
} from "@rlippmann/context-compiler-directive-drafter/fallbacks";
```

### Prompt Resources

If a model uses a fallback profile to draft output, validate that output through
the drafter before handing the candidate to `context-compiler`.

For complete examples, see: [examples/basic-usage.ts](/Users/rlippmann/Source/context-compiler-directive-drafter-ts/examples/basic-usage.ts) and [examples/prompt-rendering.ts](/Users/rlippmann/Source/context-compiler-directive-drafter-ts/examples/prompt-rendering.ts)

## Relationship To Context Compiler

This package drafts candidate directives.

[`@rlippmann/context-compiler`](https://www.npmjs.com/package/@rlippmann/context-compiler) decides whether those directives are allowed and applies them through
`engine.step(...)`.

In short:

- this package helps a host recognize and validate candidate directives
- `@rlippmann/context-compiler` owns authoritative state changes

For runnable host orchestration examples, use
`context-compiler-example-integrations`.

## Development

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Maintainer Notes

Shared parity fixtures and contract material may use snake_case where the cross-language contract requires it. The TypeScript consumer-facing README and examples prefer camelCase names.

Maintainer references:

- [docs/README.md](/Users/rlippmann/Source/context-compiler-directive-drafter-ts/docs/README.md)
- [docs/conformance.md](/Users/rlippmann/Source/context-compiler-directive-drafter-ts/docs/conformance.md)
