import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import type { Browser, Page } from 'puppeteer';

// Load the existing ESM package with Node's native loader rather than Jest's
// recursive legacy module mapper. No browser framework is added.
const nativeRequire = process
  .getBuiltinModule('module')
  .createRequire(resolve(__dirname, '../package.json'));
const puppeteer = nativeRequire(
  nativeRequire.resolve('puppeteer'),
) as typeof import('puppeteer');

jest.setTimeout(60000);

describe('BLF-01E2B real IndexedDB evidence contract', () => {
  let browser: Browser;
  let page: Page;
  const root = resolve(__dirname, '../../frontend/lib');
  const compile = (name: string) =>
    ts.transpileModule(readFileSync(resolve(root, name), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
  beforeAll(async () => {
    const executablePath = process.env.ATTENDANCE_PDF_EXECUTABLE_PATH;
    browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
  });
  afterAll(async () => {
    await browser?.close();
  });
  beforeEach(async () => {
    const context = await browser.createBrowserContext();
    page = await context.newPage();
    await page.setRequestInterception(true);
    page.on(
      'request',
      (r) =>
        void r.respond({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><title>IndexedDB contract</title>',
        }),
    );
    await page.goto('http://127.0.0.1/blf-indexeddb');
    await page.addScriptTag({
      content: `(() => {
      const modules = {};
      function load(name, source) { const exports = {}; new Function('exports', 'require', source)(exports, id => modules[id]); modules[name] = exports; }
      load('./offline-attendance-evidence-store', ${JSON.stringify(compile('offline-attendance-evidence-store.ts'))});
      load('./offline-attendance-queue', ${JSON.stringify(compile('offline-attendance-queue.ts'))});
      window.blf = { store: modules['./offline-attendance-evidence-store'], queue: modules['./offline-attendance-queue'] };
      window.input = () => {
        const issuedAt = new Date(Date.now() - 60000).toISOString();
        const validUntil = new Date(Date.now() + 86400000).toISOString();
        const claims = { purpose: 'offline_attendance_context', sub: 'employee-a', context: { organizationId: 'org-a', siteId: 'site-a', issuedAt, validUntil } };
        const token = 'e30.' + btoa(JSON.stringify(claims)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','') + '.signature';
        return { action: 'check-in', sessionBinding: 'old-session', contextToken: token, siteId: 'site-a', capturedAt: new Date().toISOString(), security: { verificationPhotoDataUrl: 'data:image/jpeg;base64,/9j/2Q==', evidenceCapturedAt: new Date().toISOString() } };
      };
    })();`,
    });
  });
  afterEach(async () => {
    await page?.browserContext().close();
  });

  it('commits a real Blob before returning queue success and stores only its evidence reference', async () => {
    const result = await page.evaluate(`(async () => {
      const item = await blf.queue.enqueueOfflineAttendanceWithEvidence(localStorage, input());
      const record = await blf.store.getOfflineEvidence(item.security.evidenceId);
      return { blob: record.blob instanceof Blob, bytes: Array.from(new Uint8Array(await record.blob.arrayBuffer())), dataUrlStored: JSON.stringify(blf.queue.readOfflineAttendanceQueue(localStorage)).includes('data:image'), idMatches: record.clientRequestId === item.clientRequestId };
    })()`);
    expect(result).toEqual({
      blob: true,
      bytes: [255, 216, 255, 217],
      dataUrlStored: false,
      idMatches: true,
    });
  });

  it('aborts queue success when Blob persistence fails and compensates a queue write failure', async () => {
    const result = await page.evaluate(`(async () => {
      const put = blf.store.putOfflineEvidence;
      blf.store.putOfflineEvidence = async () => { throw Error('transaction aborted'); };
      let failed = false; try { await blf.queue.enqueueOfflineAttendanceWithEvidence(localStorage, input()); } catch { failed = true; }
      const empty = blf.queue.readOfflineAttendanceQueue(localStorage).length === 0;
      blf.store.putOfflineEvidence = put;
      let evidenceId; blf.store.putOfflineEvidence = async record => { evidenceId = record.evidenceId; await put(record); };
      const badStorage = { getItem: key => localStorage.getItem(key), setItem: () => { throw Error('quota exceeded'); } };
      let queueFailed = false; try { await blf.queue.enqueueOfflineAttendanceWithEvidence(badStorage, input()); } catch { queueFailed = true; }
      return { failed, empty, queueFailed, removed: !(await blf.store.getOfflineEvidence(evidenceId)) };
    })()`);
    expect(result).toEqual({
      failed: true,
      empty: true,
      queueFailed: true,
      removed: true,
    });
  });

  it('retains binary on auth failure and resumes within 24 hours after secured reauthentication', async () => {
    const result = await page.evaluate(`(async () => {
      const item = await blf.queue.enqueueOfflineAttendanceWithEvidence(localStorage, input());
      await blf.queue.synchronizeOfflineAttendanceQueue(localStorage, 'old-session', async () => new Response('{}', {status:401}), () => new Date(), { organizationId:'org-a', employeeId:'employee-a' });
      const retained = !!(await blf.store.getOfflineEvidence(item.security.evidenceId));
      const pending = blf.queue.readOfflineAttendanceQueue(localStorage)[0].state;
      let localIdSent = false;
      await blf.queue.synchronizeOfflineAttendanceQueue(localStorage, 'new-session', async submitted => { localIdSent = 'evidenceId' in submitted.security; return new Response(JSON.stringify({state:'accepted'}), {status:201}); }, () => new Date(), { organizationId:'org-a', employeeId:'employee-a' });
      return { retained, pending, localIdSent, accepted: blf.queue.readOfflineAttendanceQueue(localStorage)[0].state, removed: !(await blf.store.getOfflineEvidence(item.security.evidenceId)) };
    })()`);
    expect(result).toEqual({
      retained: true,
      pending: 'pending',
      localIdSent: false,
      accepted: 'accepted',
      removed: true,
    });
  });

  it('resumes a legacy auth-blocked queue item after reauthentication while preserving acknowledged review cases', async () => {
    const result = await page.evaluate(`(async () => {
      const item = await blf.queue.enqueueOfflineAttendanceWithEvidence(localStorage, input());
      const legacy = blf.queue.readOfflineAttendanceQueue(localStorage)[0];
      legacy.state = 'reconciliation-required'; legacy.rejectionReason = 'Session expirée.';
      localStorage.setItem('konatech:offline-attendance:v1', JSON.stringify([legacy]));
      let calls = 0;
      await blf.queue.synchronizeOfflineAttendanceQueue(localStorage, 'new-session', async () => { calls++; return new Response(JSON.stringify({state:'reconciliation_required', evidenceAcknowledged:true}), {status:201}); }, () => new Date(), { organizationId:'org-a', employeeId:'employee-a' });
      const final = blf.queue.readOfflineAttendanceQueue(localStorage)[0];
      await blf.queue.synchronizeOfflineAttendanceQueue(localStorage, 'third-session', async () => { calls++; return new Response('{}'); }, () => new Date(), { organizationId:'org-a', employeeId:'employee-a' });
      return { calls, acknowledged: final.serverAcknowledged, final: final.state, removed: !(await blf.store.getOfflineEvidence(item.security.evidenceId)) };
    })()`);
    expect(result).toEqual({
      calls: 1,
      acknowledged: true,
      final: 'reconciliation-required',
      removed: true,
    });
  });

  it('expires after 24 hours without submitting and removes binary while preserving final metadata', async () => {
    const result = await page.evaluate(`(async () => {
      const item = await blf.queue.enqueueOfflineAttendanceWithEvidence(localStorage, input());
      let calls = 0;
      await blf.queue.synchronizeOfflineAttendanceQueue(localStorage, 'new-session', async () => { calls++; return new Response('{}'); }, () => new Date(Date.parse(item.capturedAt) + 86400001), { organizationId:'org-a', employeeId:'employee-a' });
      const final = blf.queue.readOfflineAttendanceQueue(localStorage)[0];
      return { calls, state: final.state, reason: !!final.rejectionReason, id: final.clientRequestId === item.clientRequestId, removed: !(await blf.store.getOfflineEvidence(item.security.evidenceId)) };
    })()`);
    expect(result).toEqual({
      calls: 0,
      state: 'expired',
      reason: true,
      id: true,
      removed: true,
    });
  });

  it('requires durable server acknowledgement before releasing pending-review evidence', async () => {
    const result = await page.evaluate(`(async () => {
      const item = await blf.queue.enqueueOfflineAttendanceWithEvidence(localStorage, input());
      await blf.queue.synchronizeOfflineAttendanceQueue(localStorage, 'old-session', async () => new Response(JSON.stringify({state:'reconciliation_required', evidenceAcknowledged:false}), {status:201}), () => new Date(), { organizationId:'org-a', employeeId:'employee-a' });
      const retained = !!(await blf.store.getOfflineEvidence(item.security.evidenceId));
      const pending = blf.queue.readOfflineAttendanceQueue(localStorage)[0].state;
      await blf.queue.synchronizeOfflineAttendanceQueue(localStorage, 'old-session', async () => new Response(JSON.stringify({state:'reconciliation_required', evidenceAcknowledged:true}), {status:201}), () => new Date(Date.now() + 120000), { organizationId:'org-a', employeeId:'employee-a' });
      return { retained, pending, final: blf.queue.readOfflineAttendanceQueue(localStorage)[0].state, removed: !(await blf.store.getOfflineEvidence(item.security.evidenceId)) };
    })()`);
    expect(result).toEqual({
      retained: true,
      pending: 'pending',
      final: 'reconciliation-required',
      removed: true,
    });
  });

  it('migrates legacy DataURL to IndexedDB and prunes unreferenced blobs', async () => {
    const result = await page.evaluate(`(async () => {
      const legacy = { ...input(), clientRequestId: crypto.randomUUID(), state: 'pending', attempts: 0, sequence: 1 };
      localStorage.setItem('konatech:offline-attendance:v1', JSON.stringify([legacy]));
      await blf.store.putOfflineEvidence({ evidenceId: 'orphan', clientRequestId:'unused', employeeId:'employee-a', organizationId:'org-a', createdAt:new Date().toISOString(), mimeType:'image/jpeg', size:4, blob:new Blob([new Uint8Array([255,216,255,217])], {type:'image/jpeg'}) });
      let submittedPhoto = false;
      await blf.queue.synchronizeOfflineAttendanceQueue(localStorage, 'old-session', async submitted => { submittedPhoto = !!submitted.security.verificationPhotoDataUrl; return new Response('{}', {status:503}); }, () => new Date(), { organizationId:'org-a', employeeId:'employee-a' });
      const migrated = blf.queue.readOfflineAttendanceQueue(localStorage)[0];
      return { submittedPhoto, sameRequest: migrated.clientRequestId === legacy.clientRequestId, noDataURL: !migrated.security.verificationPhotoDataUrl, persisted: !!(await blf.store.getOfflineEvidence(migrated.security.evidenceId)), orphanRemoved: !(await blf.store.getOfflineEvidence('orphan')) };
    })()`);
    expect(result).toEqual({
      submittedPhoto: true,
      sameRequest: true,
      noDataURL: true,
      persisted: true,
      orphanRemoved: true,
    });
  });
});
