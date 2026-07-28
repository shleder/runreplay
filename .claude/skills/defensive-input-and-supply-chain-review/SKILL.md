---
name: defensive-input-and-supply-chain-review
description: Validates external input safety, URL parsing boundaries, and dependency integrity for runreplay
---

# Defensive Input and Supply Chain Review

Ensures input sanitization and security boundary validation for runreplay.

## Rules
1. Validate all GitHub Action URLs, API endpoints, and runner labels.
2. Redact authorization tokens (`Bearer ***`, `token ***`) from all logs and error messages.
3. Prevent path traversal (`..`) in artifact download and log file resolution.
