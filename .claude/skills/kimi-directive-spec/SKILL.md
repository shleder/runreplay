---
name: kimi-directive-spec
description: Defines precise implementation directives, file allowlists, and test specifications for Gemini
---

# Kimi Directive Spec

Defines unambiguous architectural specifications for Gemini code implementation.

## Directive Requirements
1. Specify target file path(s) within runreplay (`src/*.ts`).
2. Define interface contracts, parameters, and return types.
3. Provide explicit regression test specification.
4. Set file allowlist and verification command (`npm test`).
5. Require Gemini output strictly in production JSON schema: `{"task_id":"...","files":[{"path":"...","content":"..."}]}`.
