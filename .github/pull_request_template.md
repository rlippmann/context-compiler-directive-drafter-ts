## Summary

## Why

## Scope checklist

- [ ] Diff is minimal and scoped to the requested behavior
- [ ] Acquisition-layer boundary is preserved
- [ ] No authoritative state mutation is introduced
- [ ] `engine.step(...)` is not bypassed
- [ ] No unrelated refactors
- [ ] Relevant validation was run (`npm test` for behavior changes, or docs-only/no-runtime-change)

## Notes

Validation details:
- `npm test`: <!-- passed / not run -->
- If not run, why: <!-- short reason -->
