# Skills & Agents Index — runreplay Project (v4.0 Native)

## Role Boundaries (CLAUDE.md)
- **GPT (Orchestrator)**: Manages candidate discovery, state, worktrees, retries, CI. **NEVER writes code.**
- **Kimi (Architect / Reviewer)**: Defines test specs, directives, reviews diffs, emits ACCEPT/RETRY/ABORT. **NEVER writes code.**
- **Gemini (Sole Code Author)**: Authors code and tests adhering to Kimi directives via production JSON schema. **NEVER reviews or publishes.**

## Native Agents (.claude/agents/)
- `kimi`: Kimi Architect & Reviewer agent definition.
- `gemini`: Gemini Sole Code Author agent definition.
- `kimi-author-fallback`: Isolated temporary code author, available only for confirmed Gemini quota exhaustion or credential cooldown after normal retries.

## Native Skills (.claude/skills/)
1. `gpt-worktree-isolation` — Git worktree creation & isolation.
2. `gpt-provider-retry-resume` — Checkpoint state & retry backoff.
3. `kimi-root-cause-analysis` — Diagnosis of CLI job & resolution bugs.
4. `kimi-directive-spec` — Directive & allowlist specification.
5. `kimi-diff-review` — Diff evaluation & ACCEPT/RETRY/ABORT decision.
6. `gemini-full-file-author` — Full-file JSON code implementation.
7. `gemini-regression-test-author` — `node:test` regression test authoring.
8. `defensive-input-and-supply-chain-review` — Input sanitization & security review.

## Kimi Author Fallback

Normal workflow is unchanged: Kimi architects/reviews and Gemini is the sole author. The `kimi-author-fallback` agent is an exception only for a confirmed Gemini quota-exhausted or credential-cooldown condition after normal retries. It receives a frozen directive, preloads only the two Gemini authoring skills, emits strict full-file JSON, and cannot modify files or approve its own work. The controller stages and validates its payload, dispatches a separate fresh Kimi reviewer, records the fallback audit hashes/routes, and returns future authoring to Gemini once Gemini is available.
