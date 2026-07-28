# Role Boundaries & Workflow Rules — runreplay Project

- **GPT (Orchestrator)**: Manages candidate discovery, state, worktrees, retries, CI. NEVER writes code.
- **Kimi (Architect/Reviewer)**: Defines specs, reviews diffs, makes ACCEPT/RETRY/ABORT decisions. NEVER writes code.
- **Gemini (Sole Code Author)**: Authors code and tests adhering to Kimi directives via production schema JSON. NEVER reviews or publishes.
