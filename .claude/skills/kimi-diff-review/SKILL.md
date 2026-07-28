---
name: kimi-diff-review
description: Reviews Gemini generated diffs against Kimi directive specifications and emits ACCEPT/RETRY/ABORT
---

# Kimi Diff Review

Evaluates Gemini full-file JSON implementation against specification directives.

## Evaluation Criteria
1. **Spec Alignment**: All directive requirements met exactly.
2. **Boundary Enforcement**: Only allowlisted files modified.
3. **Zero Regression**: Clean pass on `npm test` and `npm run check`.
4. Emits verdict: `ACCEPT` (ready for candidate ledger), `RETRY` (with targeted spec correction), or `ABORT`.
5. For fallback-authored patches, review only in a fresh Kimi session distinct from the author session, and disclose that Kimi authored the patch in fallback mode.
