---
name: gpt-provider-retry-resume
description: Manages candidate checkpoint state, provider retries, and resume logic upon API errors
---

# GPT Provider Retry Resume

Manages orchestration retries, exponential backoff, and checkpoint preservation for runreplay.

## Procedure & Rules
1. **Checkpoint Preservation**: Record step state in candidate ledger before provider invocation.
2. **Alias Consistency**: Upon API error (429 rate limit, 503, or timeout), retry using the EXACT same configured alias.
3. **Exponential Backoff**: Apply exponential backoff delay (1s, 2s, 4s, 8s).
4. **Cooldown Parking**: Park execution during provider cooldown period without losing checkpoint state.
5. **No Model Switching**: NEVER switch Gemini or any sole-author role to a fallback model automatically.
6. **Resume**: Resume execution from last verified checkpoint once cooldown expires.
