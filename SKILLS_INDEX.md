# Skills & Agents Index — runreplay Project (v4.0 Native)

## Role Boundaries (CLAUDE.md)
- **GPT (Orchestrator)**: Manages candidate discovery, state, worktrees, retries, CI. **NEVER writes code.**
- **Kimi (Architect / Reviewer)**: Defines test specs, directives, reviews diffs, emits ACCEPT/RETRY/ABORT. **NEVER writes code.**
- **Gemini (Sole Code Author)**: Authors code and tests adhering to Kimi directives via production JSON schema. **NEVER reviews or publishes.**

## Native Agents (.claude/agents/)
- `kimi`: Kimi Architect & Reviewer agent definition.
- `gemini`: Gemini Sole Code Author agent definition.

## Native Skills (.claude/skills/)
1. `gpt-worktree-isolation` — Git worktree creation & isolation.
2. `gpt-provider-retry-resume` — Checkpoint state & retry backoff.
3. `kimi-root-cause-analysis` — Diagnosis of CLI job & resolution bugs.
4. `kimi-directive-spec` — Directive & allowlist specification.
5. `kimi-diff-review` — Diff evaluation & ACCEPT/RETRY/ABORT decision.
6. `gemini-full-file-author` — Full-file JSON code implementation.
7. `gemini-regression-test-author` — `node:test` regression test authoring.
8. `defensive-input-and-supply-chain-review` — Input sanitization & security review.
