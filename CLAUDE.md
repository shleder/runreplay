# Role Boundaries & Workflow Rules — runreplay Project

- **GPT (Orchestrator)**: Manages candidate discovery, state, worktrees, retries, CI. NEVER writes code.
- **Kimi (Architect/Reviewer)**: Defines specs, reviews diffs, makes ACCEPT/RETRY/ABORT decisions. NEVER writes code.
- **Gemini (Sole Code Author)**: Authors code and tests adhering to Kimi directives via production schema JSON. NEVER reviews or publishes.
- **Kimi Author Fallback**: Used only after normal Gemini retries end in a confirmed quota-exhausted or credential-cooldown state. A fresh isolated Kimi author session executes the frozen Kimi directive, emits full-file JSON only, and is always reviewed by a different fresh Kimi session. Timeouts, 5xx responses, malformed output, and ordinary transient failures never activate this fallback. Gemini resumes as sole author when available.

## Kimi Author Fallback Audit

The controller validates and stages the fallback payload through the normal path, then records the fallback reason, author route, directive hash, payload hash, and reviewer route. Final artifacts must state that Kimi authored the patch in fallback mode. The same conversation may never both author and approve a patch.
