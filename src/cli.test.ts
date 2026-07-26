import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeApiBase, readArguments } from "./cli.js";

test("prints help when run as a direct executable", () => {
  const cliPath = fileURLToPath(new URL("./cli.js", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /RunReplay — inspect a GitHub Actions job/);
  assert.match(result.stdout, /--api-base/);
});

test("parses an explicit GitHub Enterprise Server API base", () => {
  assert.deepEqual(
    readArguments([
      "inspect",
      "https://ghe.example.test/acme/widgets/actions/runs/123/job/456",
      "--api-base",
      "https://ghe.example.test/api/v3/",
    ], {}),
    {
      command: "inspect",
      url: "https://ghe.example.test/acme/widgets/actions/runs/123/job/456",
      baselineUrl: undefined,
      baseline: undefined,
      token: undefined,
      apiBase: "https://ghe.example.test/api/v3",
      json: false,
    },
  );
});

test("rejects unsafe API base values", () => {
  assert.throws(() => normalizeApiBase("http://ghe.example.test/api/v3"), /https/);
  assert.throws(() => normalizeApiBase("https://token@ghe.example.test/api/v3"), /credentials/);
  assert.throws(() => normalizeApiBase("https://ghe.example.test/api/v3?token=x"), /query string/);
});
