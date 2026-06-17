# @rlippmann/context-compiler-directive-drafter

`@rlippmann/context-compiler-directive-drafter` provides TypeScript acquisition-layer utilities for drafting candidate Context Compiler directives from natural-language input.

It helps a host:

- draft candidate directives from raw user input
- validate or reject directive-like model output
- parse only safe directive output for handoff to the compiler
- render prompt templates from saved compiler state

Drafting proposes and `context-compiler` decides.

Only [`@rlippmann/context-compiler`](https://www.npmjs.com/package/@rlippmann/context-compiler) may apply directives and mutate saved authoritative state through `engine.step(...)`.

## What It Does

Use this package when a host wants help recognizing directive-shaped input before handing control to the deterministic compiler core.

The public drafting utilities are:

- `preprocessHeuristic(message)` -> conservative heuristic pass over raw user input
- `validatePreprocessorOutput(rawOutput, sourceInput?)` -> validate candidate directive-like output
- `parsePreprocessorOutput(rawOutput, sourceInput?)` -> return a validated directive string or `null`
- `renderPrompt(path, state)` -> render a prompt template file with current compiler state

This README uses the camelCase entry points because they are the more idiomatic TypeScript surface.

## Relationship To @rlippmann/context-compiler

Use this package alongside `@rlippmann/context-compiler` when you want a drafting layer in front of the core engine.

- `@rlippmann/context-compiler-directive-drafter` helps acquire candidate directive input
- `@rlippmann/context-compiler` decides whether that input is allowed and mutates authoritative state

If you do not need acquisition-layer drafting, use `@rlippmann/context-compiler` directly.

## Safe Usage Pattern

Use the directive drafter as a narrow front-end to the compiler, not as a replacement for it.

Recommended host flow:

1. If `engine.hasPendingClarification()` is `true`, bypass preprocessing and pass the original user input directly to `engine.step(...)`.
2. Otherwise run `preprocess_heuristic(userInput)` first.
3. If the heuristic returns `outcome === PREPROCESS_OUTCOME_DIRECTIVE` and `directive !== null`, run `parse_preprocessor_output(...)` or `validate_preprocessor_output(...)` before using that drafted output.
4. If the heuristic returns `no_directive` or `unknown`, fall back to the original user input.
5. If a model or another drafter produces directive-like text, validate or parse that output too before passing anything to the compiler.
6. Pass only validated directive output to `engine.step(...)`.

```ts
import { createEngine } from "@rlippmann/context-compiler";
import {
  PREPROCESS_OUTCOME_DIRECTIVE,
  parsePreprocessorOutput,
  preprocessHeuristic
} from "@rlippmann/context-compiler-directive-drafter";

const engine = createEngine();

export function stepWithOptionalDrafter(userInput: string) {
  if (engine.hasPendingClarification()) {
    return engine.step(userInput);
  }

  const heuristic = preprocessHeuristic(userInput);
  let engineInput = userInput;

  if (heuristic.outcome === PREPROCESS_OUTCOME_DIRECTIVE && heuristic.directive !== null) {
    const parsed = parsePreprocessorOutput(heuristic.directive, { sourceInput: userInput });
    if (parsed !== null) {
      engineInput = parsed;
    }
  }

  return engine.step(engineInput);
}
```

## Validation Boundary

This package is intentionally conservative.

Safety behavior is false-negative-preferred:

- ambiguous, mixed-intent, quoted, reported, malformed, or boundary-unsafe inputs should resolve to `unknown` or `null`
- source-aware parsing rejects unsafe rewrites instead of trying to be helpful
- drafted output is never equivalent to a compiler decision until the compiler accepts it

Treat all drafter or model output as untrusted until it has been validated or parsed successfully.

## renderPrompt(path, state)

`renderPrompt(path, state)` reads a prompt template file from `path`, removes leading blank/header comment lines, and replaces:

- `<NULL_OR_VALUE>` with the current premise or `null`
- `<SET OF CURRENT POLICY ITEMS>` with normalized policy items or `(none)`

The first argument is a prompt file path, not raw template text.

The caller supplies that prompt file path.

This package does not ship default or llama prompt resources in the published npm artifact.

If a host wants package-local prompt files, it must ship them itself and pass the resolved path into `render_prompt(...)`.

```ts
import { renderPrompt } from "@rlippmann/context-compiler-directive-drafter";

const rendered = renderPrompt("/absolute/path/to/prompt.txt", {
  premise: "concise replies",
  policies: {
    docker: true
  }
});
```

## Boundary

The directive drafter:

- drafts candidate directives
- keeps drafting output non-authoritative
- helps a host acquire directive-shaped compiler input

The directive drafter does not:

- mutate authoritative state
- replace `engine.step(...)`
- decide whether a state change is allowed
- provide broad natural-language memory or persistence
- run models or own provider integration

## Install

```bash
npm install @rlippmann/context-compiler-directive-drafter @rlippmann/context-compiler
```

## Development

```bash
npm install
npm run build
npm run typecheck
npm test
```

Maintainer docs:

- [docs/README.md](/Users/rlippmann/Source/context-compiler-directive-drafter-ts/docs/README.md)
- [docs/conformance.md](/Users/rlippmann/Source/context-compiler-directive-drafter-ts/docs/conformance.md)
