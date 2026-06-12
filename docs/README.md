# Documentation

Directive Drafter is acquisition-layer only.

It drafts and proposes candidate directives.

Context Compiler core remains the authority layer.

This package must not mutate authoritative state or bypass `engine.step(...)`.
