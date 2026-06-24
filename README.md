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
import {
  parsePreprocessorOutput,
  preprocessHeuristic
} from "@rlippmann/context-compiler-directive-drafter";

const userMessage = "Please use Docker for container examples.";
const heuristic = preprocessHeuristic(userMessage);

const candidate =
  heuristic.directive === null
    ? null
    : parsePreprocessorOutput(heuristic.directive, { sourceInput: userMessage });

if (candidate !== null) {
  console.log("Candidate directive:", candidate);
} else {
  console.log("No canonical directive found.");
}
```

If another drafting step already produced candidate output, validate it before you use it:

```ts
import {
  validatePreprocessorOutput
} from "@rlippmann/context-compiler-directive-drafter";

const validation = validatePreprocessorOutput("use docker", {
  sourceInput: "Please use Docker for container examples."
});

if (validation.classification === "directive") {
  console.log(validation.output);
}
```

## API

This README uses the camelCase TypeScript entry points.

- `preprocessHeuristic(message)` drafts a conservative candidate directive from raw user input
- `validatePreprocessorOutput(rawOutput, sourceInput?)` classifies candidate output as `directive`, `no_directive`, or `unknown`
- `parsePreprocessorOutput(rawOutput, sourceInput?)` returns a validated directive string or `null`
- `renderPrompt(path, state)` renders a prompt that an LLM can use to draft candidate directives from user input using the current compiler state
- `PREPROCESSOR_NO_DIRECTIVE_SENTINEL`, `PREPROCESS_OUTCOME_DIRECTIVE`, `PREPROCESS_OUTCOME_NO_DIRECTIVE`, and `PREPROCESS_OUTCOME_UNKNOWN` expose the public runtime contract constants

### Prompt Resources

Use `renderPrompt(path, state)` when your host wants an LLM to help draft candidate directives from user input.

The package ships:

- `prompts/default.txt`
- `prompts/llama.txt`

`renderPrompt(path, state)`:

- reads a prompt template file from `path`
- removes leading blank or header comment lines
- replaces `<NULL_OR_VALUE>` with the current premise or `null`
- replaces `<SET OF CURRENT POLICY ITEMS>` with normalized policy items or `(none)`

```ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderPrompt
} from "@rlippmann/context-compiler-directive-drafter";

const packageEntryUrl = await import.meta.resolve(
  "@rlippmann/context-compiler-directive-drafter"
);
const packageRoot = dirname(dirname(fileURLToPath(packageEntryUrl)));
const defaultPromptPath = join(packageRoot, "prompts", "default.txt");

const rendered = renderPrompt(defaultPromptPath, {
  premise: "concise replies",
  policies: {
    docker: true
  }
});
```

If a model uses a rendered prompt to draft output, validate that output with
`parsePreprocessorOutput(...)` or `validatePreprocessorOutput(...)` before you
use it.

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
