import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import { runBenchmark } from './benchmark.js';

async function main() {
  const dir = path.join(os.tmpdir(), `fastmode-cli-${Date.now()}`);
  console.log(`Running fastmode virtual performance benchmark...`);
  try {
    const r = await runBenchmark(dir);
    console.log(`NORMAL Wall Time : ${r.normalWall} ms`);
    console.log(`FAST Wall Time   : ${r.fastWall} ms`);
    console.log(`Speedup Factor   : ${r.speedup.toFixed(2)}x`);
    console.log(`Avoided Phases   : ${r.workAvoided} tasks`);
    console.log(`Telemetry Hits   : ${r.hits}`);
  } catch(e) {
    console.error(e);
    process.exit(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && (process.argv[1].endsWith('fastmode/cli.js') || process.argv[1].includes('cli'))) {
  main();
}
