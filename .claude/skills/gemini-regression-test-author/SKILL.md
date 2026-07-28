---
name: gemini-regression-test-author
description: Authors node:test unit tests for runreplay to lock down fixed bug behaviors
---

# Gemini Regression Test Author

Authors regression unit tests using `node:test` and `node:assert/strict`.

## Execution Rules
1. Implement test file in `src/*.test.ts`.
2. Assert specific failure mode before fix and success after fix.
3. Output test file strictly via production full-file JSON schema.
