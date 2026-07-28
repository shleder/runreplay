---
name: kimi-root-cause-analysis
description: Diagnoses CLI job inspection, SHA resolution, and log parsing failures in runreplay
---

# Kimi Root Cause Analysis

Diagnoses runreplay bugs across CLI job parsing, GitHub Actions SHA resolution, and log comparison.

## Procedure
1. Inspect failing test trace or runtime error logs.
2. Trace root cause in `src/resolve.ts`, `src/github.ts`, or `src/compare.ts`.
3. Identify exact specification discrepancy or unhandled API payload boundary.
4. Formulate code-free root cause hypothesis and regression test specification for Gemini.
