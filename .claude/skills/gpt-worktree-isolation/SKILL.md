---
name: gpt-worktree-isolation
description: Orchestrates isolated git worktrees for runreplay candidate validation
---

# GPT Worktree Isolation

Orchestrates clean worktree creation for runreplay candidate investigation.

## Procedure
1. Verify root git repository is `runreplay`.
2. Check `.worktrees/` directory exists and is ignored.
3. Spawn worktree for candidate issue/PR: `git worktree add .worktrees/candidate-<id> -b candidate-<id>`.
4. Run baseline verification (`npm test`).
5. Track state in candidate ledger. NEVER write or modify source code files.
