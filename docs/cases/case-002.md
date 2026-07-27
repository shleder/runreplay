# agronholm/anyio — worker thread race with event loop shutdown

## Failed job

[test (ubuntu-latest, 3.14, [trio], false) — run 30154377830](https://github.com/agronholm/anyio/actions/runs/30154377830/job/89669936363)

## RunReplay evidence

RunReplay compared the failing master run with the last successful master run:

- baseline: [run 30153625195](https://github.com/agronholm/anyio/actions/runs/30153625195), commit `9f44995`, success;
- failed: run `30154377830`, commit `caca0e0`, failure;
- workflow source, Action revisions, and runner labels did not change;
- one repository commit changed three files (`pyproject.toml`, `src/anyio/abc/_eventloop.py`, `tests/conftest.py`) — PR [#1199](https://github.com/agronholm/anyio/pull/1199), which added rsloop as a backend for asyncio tests;
- the changed step was `Test with pytest`;
- the single failing test was `tests/test_from_thread.py::test_thread_cancelled_and_abandoned[asyncio+rsloop]` (1 failed, 5068 passed).

## Root cause

A TOCTOU race in `WorkerThread.run()` (`src/anyio/_backends/_asyncio.py:1047`). The worker guarded result delivery with `if not self.loop.is_closed():`, but the event loop could close between that check and the `call_soon_threadsafe()` call, raising `RuntimeError: Event loop is closed` in the "AnyIO worker thread". Pytest surfaced it as `PytestUnhandledThreadExceptionWarning`. The rsloop backend's shutdown timing on Python 3.14 opened this window.

## Proposed fix and validation

[External PR #1245](https://github.com/agronholm/anyio/pull/1245) proposed catching `RuntimeError` from `call_soon_threadsafe()` and dropping the undeliverable result — the same lifecycle outcome the codebase already applies for the selector thread (`src/anyio/_core/_asyncio_selector_thread.py:145-148`).

The original PR CI passed, but the patch was **not accepted upstream**. On 2026-07-27, the maintainer closed it without merge because the PR template was removed and it contained neither a changelog entry nor regression tests. This case therefore records a confirmed behavior and a technically validated proposed fix, not an upstream merge.

Follow-up local validation against current `master` (`caca0e0`):

- a deterministic regression test with a stub loop that reports open at the guard and raises `RuntimeError("Event loop is closed")` from `call_soon_threadsafe()` fails without the patch because the error escapes the worker thread;
- the same test passes with the proposed `try`/`except RuntimeError` result-delivery guard;
- `python -m pytest tests/test_to_thread.py` with the patch: 51 passed, 30 skipped on Windows (optional winloop/rsloop backends unavailable).

## Result

The external PR was closed without merge and does not count as an external merged contribution. A future submission requires a complete AnyIO PR template, a changelog entry, and the isolated regression test; no resubmission has been opened.
