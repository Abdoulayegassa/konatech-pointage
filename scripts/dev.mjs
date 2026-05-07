import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';

const commands = [
  {
    name: 'backend',
    cwd: resolve(rootDir, 'apps/backend'),
    command: process.execPath,
    args: [
      resolve(rootDir, 'apps/backend/node_modules/@nestjs/cli/bin/nest.js'),
      'start',
      '--watch',
    ],
  },
  {
    name: 'frontend',
    cwd: resolve(rootDir, 'apps/frontend'),
    command: process.execPath,
    args: [
      resolve(rootDir, 'apps/frontend/node_modules/next/dist/bin/next'),
      'dev',
    ],
  },
];

const children = commands.map((entry) =>
  spawn(entry.command, entry.args, {
    cwd: entry.cwd,
    env: process.env,
    stdio: 'inherit',
    windowsHide: isWindows,
  }),
);

let shuttingDown = false;

function stopChildren(signal = 'SIGTERM') {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      stopChildren();
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exitCode ??= code ?? 0;
  });
}

process.on('SIGINT', () => stopChildren('SIGINT'));
process.on('SIGTERM', () => stopChildren('SIGTERM'));
