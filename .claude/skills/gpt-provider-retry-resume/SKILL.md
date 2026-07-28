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
5. **No Model Switching**: NEVER switch Gemini or any sole-author role to a fallback model automatically, except for the narrowly authorized Kimi author fallback below.
6. **Resume**: Resume execution from last verified checkpoint once cooldown expires.

## Authorized Kimi Author Fallback

After normal retries, activate `kimi-author-fallback` only for a confirmed Gemini `quota-exhausted` or `credential-cooldown` condition. Do not activate for timeout, 5xx, malformed output, or ordinary transient errors. Freeze the normal Kimi implementation directive before invoking a fresh isolated Kimi author session. Validate and stage the strict full-file JSON payload normally, then use a separate fresh Kimi reviewer session. Record fallback reason, author route, directive hash, payload hash, reviewer route, and the fallback disclosure. Return future work to Gemini as soon as Gemini is available.
