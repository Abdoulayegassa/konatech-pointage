import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const backendDir = resolve(rootDir, 'apps/backend');
const frontendDir = resolve(rootDir, 'apps/frontend');
const host = '127.0.0.1';
const isWindows = process.platform === 'win32';

function createLogBuffer(name) {
  const lines = [];

  function push(chunk) {
    const value = chunk.toString().trim();

    if (!value) {
      return;
    }

    for (const line of value.split(/\r?\n/)) {
      lines.push(`[${name}] ${line}`);
    }

    if (lines.length > 80) {
      lines.splice(0, lines.length - 80);
    }
  }

  function dump() {
    return lines.join('\n');
  }

  return {
    push,
    dump,
  };
}

async function getAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();

    server.unref();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to reserve a port.')));
        return;
      }

      const { port } = address;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(port);
      });
    });
  });
}

function spawnServer({ name, cwd, args, env }) {
  const logs = createLogBuffer(name);
  const child = spawn(process.execPath, args, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  child.stdout?.on('data', logs.push);
  child.stderr?.on('data', logs.push);

  return {
    child,
    logs,
    name,
  };
}

async function terminateProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (isWindows) {
    await new Promise((resolveClose) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });

      killer.once('error', () => resolveClose());
      killer.once('exit', () => resolveClose());
    });

    return;
  }

  child.kill('SIGTERM');

  await new Promise((resolveClose) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
    }, 3_000);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolveClose();
    });
  });
}

async function waitForJson(url, name, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        lastError = new Error(`${name} returned ${response.status}.`);
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  throw new Error(
    `${name} did not become ready in time. ${lastError instanceof Error ? lastError.message : 'Unknown startup error.'}`,
  );
}

function assertHealthPayload(payload, source) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    payload.status !== 'ok' ||
    payload.service !== 'konatech-attendance-api'
  ) {
    throw new Error(`${source} returned an unexpected health payload.`);
  }
}

async function assertRedirectLocation(url, expectedLocation, source) {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    redirect: 'manual',
  });

  if (response.status !== 302) {
    throw new Error(`${source} returned ${response.status} instead of 302.`);
  }

  const location = response.headers.get('location');

  if (location !== expectedLocation) {
    throw new Error(
      `${source} returned ${location ?? 'no location header'} instead of ${expectedLocation}.`,
    );
  }
}

async function main() {
  const frontendPort = await getAvailablePort();
  const backendPort = await getAvailablePort();
  const frontendUrl = `http://${host}:${frontendPort}`;
  const backendApiBaseUrl = `http://${host}:${backendPort}/api/v1`;
  const backendHealthUrl = `${backendApiBaseUrl}/health`;
  const backendAttendanceEntryUrl = `${backendApiBaseUrl}/attendance/entry`;
  const frontendProxyHealthUrl = `${frontendUrl}/api/health`;
  const managedProcesses = [];

  try {
    const backend = spawnServer({
      name: 'backend',
      cwd: backendDir,
      args: [
        resolve(backendDir, 'node_modules/@nestjs/cli/bin/nest.js'),
        'start',
      ],
      env: {
        NODE_ENV: 'development',
        PORT: String(backendPort),
        FRONTEND_URL: frontendUrl,
      },
    });

    managedProcesses.push(backend);

    await waitForJson(backendHealthUrl, 'Backend health check', 45_000);

    const frontend = spawnServer({
      name: 'frontend',
      cwd: frontendDir,
      args: [
        resolve(frontendDir, 'node_modules/next/dist/bin/next'),
        'dev',
        '--hostname',
        host,
        '--port',
        String(frontendPort),
      ],
      env: {
        NODE_ENV: 'development',
        NEXT_TELEMETRY_DISABLED: '1',
        NEXT_PUBLIC_APP_URL: frontendUrl,
        NEXT_PUBLIC_API_BASE_URL: backendApiBaseUrl,
      },
    });

    managedProcesses.push(frontend);

    const backendHealth = await waitForJson(
      backendHealthUrl,
      'Backend health check',
      45_000,
    );
    const frontendHealth = await waitForJson(
      frontendProxyHealthUrl,
      'Frontend proxy health check',
      60_000,
    );
    await assertRedirectLocation(
      backendAttendanceEntryUrl,
      `${frontendUrl}/attendance-entry`,
      'Backend attendance entry redirect',
    );

    assertHealthPayload(backendHealth, 'Backend health endpoint');
    assertHealthPayload(frontendHealth, 'Frontend proxy health endpoint');

    console.log(
      `Public URL wiring validated: FRONTEND_URL == NEXT_PUBLIC_APP_URL == ${frontendUrl}`,
    );
    console.log(
      `Proxy connectivity validated: ${frontendProxyHealthUrl} -> ${backendHealthUrl}`,
    );
  } catch (error) {
    const logDump = managedProcesses
      .map((entry) => entry.logs.dump())
      .filter(Boolean)
      .join('\n');

    const message =
      error instanceof Error ? error.message : 'Unknown proxy validation error.';

    throw new Error(
      logDump
        ? `${message}\n\nRecent process logs:\n${logDump}`
        : message,
      {
        cause: error,
      },
    );
  } finally {
    await Promise.all(
      managedProcesses
        .slice()
        .reverse()
        .map((entry) => terminateProcessTree(entry.child)),
    );
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
