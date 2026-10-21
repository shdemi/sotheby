/**
 * Runs every editor test suite.
 *
 *   node editor/_test/run-all.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const SUITES = [
  ["json-patch", "json-patch.test.mjs"],
  ["zip", "zip.test.mjs"],
  ["model", "model.test.mjs"],
  ["icon", "icon.test.mjs"],
  ["e2e", "e2e.test.mjs"],
  ["ui", "ui.test.mjs"],
  ["rotation-ui", "rotation-ui.test.mjs"],
];

let failed = 0;

for (const [name, file] of SUITES) {
  const result = spawnSync(process.execPath, [path.join(HERE, file)], { stdio: "inherit" });
  if (result.status !== 0) {
    failed++;
    console.log(`\n### ${name}: FAILED\n`);
  } else {
    console.log(`\n### ${name}: ok\n`);
  }
}

if (failed > 0) {
  console.log(`${failed} suite(s) failed.`);
  process.exit(1);
}
console.log("All editor suites passed.");
