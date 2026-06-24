# AGENTS.md

Guidelines for AI agents working in this repository.

## Branch rules
- The initial repository scaffold may be created on `main` because the repository started empty.
- After the initial scaffold exists, never commit directly to `main`.
- After the initial scaffold exists, never push directly to `main`.
- After the initial scaffold exists, never check out or modify `main`.
- Always do follow-up work on a feature branch.
- If the current branch is `main` after the scaffold phase, stop and ask the user to create a branch.

## Repository boundary

This package drafts candidate Context Compiler directives from natural-language input.

Drafts are non-authoritative.

Context Compiler core is the Authority Layer.

Directive Drafter is the Acquisition Layer.

Drafting proposes and authority decides.

Only `context-compiler` applies directives and mutates authoritative state.

Do not describe drafting as:
- validation authority
- directive authority
- state mutation
- authoritative application

Be explicit that drafting proposes and `context-compiler` decides.

## Context Compiler integration rules

- Do not bypass `engine.step(...)`.
- Do not edit `engine.state`.
- Do not introduce flows that mutate authoritative state outside `context-compiler`.
- Do not describe candidate drafting output as equivalent to an engine decision.
- Keep the handoff boundary explicit between drafting output and compiler-owned application.

## Scope constraints

This repository is currently in scaffold phase.

Do not implement:
- preprocessor behavior
- fixture-porting work
- prompt rendering
- `draft_directive()`
- acquisition-layer runtime functionality beyond minimal scaffold structure

Keep changes minimal and reviewable.

## Test coverage expectations
Before opening a PR, consider:

- Does this change affect any user-facing drafting behavior?
- If so, is that behavior covered by tests?

User-facing behavior includes:

- candidate directive outputs
- abstention behavior
- validation behavior
- prompt and resource loading
- integration handoff boundaries between the drafter and `context-compiler`

If a user-facing behavior is changed or introduced, add or update tests to cover it.

Do not weaken tests to make implementation easier.
Do not rely solely on coverage metrics.

## Scope of changes
- Only modify files necessary for the requested task.
- Do not refactor unrelated code.
- Do not change project structure unless explicitly asked.
- Make the minimal change required to solve the requested task.
- If the task expands beyond the original request, stop and ask the user for guidance.

## Git safety
- Do not perform history-rewriting operations unless explicitly instructed.
- This includes `git rebase`, `git reset`, `git push --force`, and `git commit --amend`.
- After the scaffold phase, do not push directly to `main`.
- After the scaffold phase, do not check out or modify `main`.

## Commit messages
- Commit messages must use this format: `<type>: <summary>`.
- The `<type>` token must be lowercase letters only.
- The `<summary>` must be short and written in imperative mood.
- Allowed `<type>` values: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.
- If a proposed commit message does not match this format or type list, stop and ask for a corrected message before committing.

## PR guidance
- Never open or merge a PR targeting `main` from `main`; always use a feature branch.
- Always use the repository PR template when creating or updating PR descriptions, if one exists.
- PR titles must use the same format as commits: `<type>: <summary>`.
- PR descriptions should include:
  - what changed
  - why the change was needed
- Do not include a dedicated "Validation" section in PR text.
- Keep PR scope aligned to the requested task; if scope grows, ask for guidance before expanding.

## Documentation
README and package-listing docs are part of the project contract.

Documentation is not commentary.

Treat documentation requirements in a task as acceptance criteria.

Treat user-visible documentation as a behavioral contract, not as optional narrative.

Do not treat documentation as illustrative unless explicitly stated.
Do not silently change documented behavior because implementation is easier.
Do not silently rewrite docs to match unintended behavior.
Do not update documentation merely to match unintended behavior.
Do not weaken or remove user-facing tests to accommodate implementation.

This repository is the canonical documentation owner for the TypeScript
directive-drafter package.

Keep the ownership boundary explicit:
- `context-compiler-directive-drafter-ts` owns package-level drafting docs, prompt/resource usage docs, package API docs, conformance/parity docs, and package-scoped examples
- `context-compiler` owns compiler behavior, engine semantics, authoritative state mutation, and directive application rules
- `context-compiler-example-integrations` owns runnable host orchestration examples, starter-app integration recipes, and broader external integration walkthroughs

Documentation examples explicitly referenced by a task are part of the expected deliverable.

If implementation, documentation, examples, tests, fixtures, conformance docs,
and smoke tests disagree:

1. Public package behavior, fixtures, and parity/conformance expectations are authoritative unless the task explicitly changes them.
2. Report the mismatch.
3. Request review before changing documented behavior.
4. Do not resolve disagreements by silently changing docs.

Drift detection is required work, not optional polish.

When changing behavior or docs, actively check for drift across:
- README contract language
- package-level examples and documented behavior
- prompt and resource loading behavior
- exported package surface and package-listing claims
- tests, fixtures, and captured examples
- conformance and parity docs
- smoke tests and their documented package assumptions

If you find drift:
- report it clearly
- fix the contract or implementation only in the canonically owned location
- do not preserve duplicate or conflicting wording across files
- do not move compiler-owned semantics into this repository unless explicitly instructed
- do not move runnable host orchestration guidance into this repository when it belongs in `context-compiler-example-integrations`

## Documentation style

For README and package-listing docs, explain user-visible drafting behavior before architecture.

Lead with what the package does, how users or hosts use it, and how it relates
to `context-compiler` before discussing implementation structure or project history.

Be explicit that drafting proposes and `context-compiler` decides.

Prefer plain, concrete wording when accurate. Examples:
- "draft candidate directives"
- "non-authoritative suggestion"
- "saved authoritative state"
- "only the compiler may apply"
- "drafting proposes and the compiler decides"

Avoid describing drafting as:
- validation authority
- state mutation
- authoritative application
- a replacement for `context-compiler`
- the owner of compiler decisions
- an "experimental preprocessor" when referring to the current public package surface unless the task explicitly requires historical terminology

Avoid describing features only in architectural terms when a behavior-first explanation is possible.

Avoid architecture-archeology framing in README-style docs when present-tense ownership and behavior are what users need.

Prefer camelCase names in TypeScript README and package-level examples unless you are documenting parity, fixture, or contract names that intentionally use snake_case.

Prefer direct subjects and strong verbs.
Avoid noun stacks and passive phrasing when a simpler active sentence is clearer.
Use simpler wording unless technical precision requires formal terminology.

Do not simplify contract or conformance wording in ways that blur required behavior, ownership boundaries, or authoritative semantics.

Do not rewrite captured outputs, fixture-sensitive examples, or smoke-test-sensitive package examples unless explicitly asked.

## Tooling
Use the project's existing tooling:

- Use `npm` for install, build, typecheck, and test commands.
