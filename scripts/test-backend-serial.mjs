import { open, readdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const backend = resolve(root, 'apps/backend');
const testDirectory = resolve(backend, 'test');
const lockPath = resolve(root, '.tmp/backend-e2e-serial.lock');
const testEnvironment = { ...process.env };
let activeChild;
let terminationSignal;

delete testEnvironment.DATABASE_URL;
delete testEnvironment.TEST_DATABASE_URL;

async function run(command, args) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: backend,
      env: testEnvironment,
      stdio: 'inherit',
    });
    activeChild = child;

    child.on('error', (error) => {
      activeChild = undefined;
      rejectRun(error);
    });
    child.on('exit', (code, signal) => {
      activeChild = undefined;

      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(
        new Error(
          `Serial backend E2E run stopped at ${args.at(-1)} (${signal ?? `exit ${code}`}).`,
        ),
      );
    });
  });
}

function requestTermination(signal) {
  terminationSignal ??= signal;
  activeChild?.kill(signal);
}

process.once('SIGINT', () => requestTermination('SIGINT'));
process.once('SIGTERM', () => requestTermination('SIGTERM'));

let lock;

try {
  lock = await open(lockPath, 'wx');
  const suites = (await readdir(testDirectory))
    .filter((file) => file.endsWith('.e2e-spec.ts'))
    .sort();

  for (const suite of suites) {
    if (terminationSignal) {
      throw new Error(
        `Serial backend E2E run interrupted by ${terminationSignal}.`,
      );
    }

    const relativeSuite = `test/${suite}`;
    process.stdout.write(`\n=== Serial E2E: ${relativeSuite} ===\n`);
    await run('pnpm', [
      '--dir',
      backend,
      'exec',
      process.execPath,
      './node_modules/jest/bin/jest.js',
      '--runInBand',
      '--config',
      './test/jest-e2e.json',
      relativeSuite,
    ]);
  }

  if (terminationSignal) {
    throw new Error(
      `Serial backend E2E run interrupted by ${terminationSignal}.`,
    );
  }
} finally {
  await lock?.close();
  await rm(lockPath, { force: true });
}
