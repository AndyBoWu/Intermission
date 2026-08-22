const fs = require("node:fs");
const path = require("node:path");

let passed = 0;
let failed = 0;

global.test = function test(name, run) {
  try {
    run();
    passed += 1;
    process.stdout.write(`ok ${passed + failed} - ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`not ok ${passed + failed} - ${name}\n`);
    process.stderr.write(`${error.stack || error}\n`);
  }
};

global.assert = function assert(condition, message) {
  if (!condition) throw new Error(message || "Expected condition to be true");
};

global.assertEqual = function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

global.assertDeepEqual = function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message || `Expected ${expectedJson}, got ${actualJson}`);
  }
};

const testFiles = fs.readdirSync(__dirname)
  .filter((file) => file.endsWith(".test.js"))
  .sort();

if (testFiles.length === 0) {
  process.stderr.write("No unit test files found\n");
  process.exit(1);
}

for (const file of testFiles) require(path.join(__dirname, file));

process.stdout.write(`1..${passed + failed}\n`);
if (failed > 0) process.exit(1);
