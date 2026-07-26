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

## Fix

[External PR #1245](https://github.com/agronholm/anyio/pull/1245) catches `RuntimeError` from `call_soon_threadsafe()` and drops the undeliverable result — the same idiom the codebase already uses for the selector thread (`src/anyio/_core/_asyncio_selector_thread.py:145-148`).

Local validation:

- deterministic A/B check driving `WorkerThread.run()` with a stub loop that closes between the `is_closed()` check and `call_soon_threadsafe()`: `RuntimeError` escapes at line 1048 without the patch, `run()` completes cleanly with it;
- `pytest tests/test_from_thread.py tests/test_taskgroups.py` on Python 3.14.2: 940 passed, 10 skipped, 6 xfailed — no regression (the race itself is Linux-timing-dependent and does not reproduce on Windows).

## Result

Waiting for upstream review.
