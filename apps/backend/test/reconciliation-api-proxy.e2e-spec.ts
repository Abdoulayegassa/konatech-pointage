import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function proxyFixture() {
  const proxy = jest
    .fn()
    .mockResolvedValue(new Response('{}', { status: 201 }));
  const exports: Record<string, any> = {};
  const source = ts.transpileModule(
    readFileSync(
      resolve(__dirname, '../../frontend/lib/reconciliation-api-route.ts'),
      'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  runInNewContext(source, {
    exports,
    URL,
    require: (id: string) =>
      id === 'next/server'
        ? {
            NextResponse: {
              json: (body: unknown, init: ResponseInit) =>
                new Response(JSON.stringify(body), init),
            },
          }
        : id === './api'
          ? { getPublicAppUrl: () => 'https://inout.example' }
          : { proxyApiJsonBodyRequest: proxy },
  });
  return { proxy, decide: exports.proxyReconciliationDecision };
}

describe('Reconciliation cookie proxy security', () => {
  it.each([null, 'https://attacker.example'])(
    'denies missing or foreign Origin (%s) before forwarding account credentials',
    async (origin) => {
      const { proxy, decide } = proxyFixture();
      const headers = new Headers();
      if (origin) headers.set('Origin', origin);
      const response = await decide(
        new Request(
          'https://inout.example/api/attendance/offline-reconciliation/case/approve',
          { method: 'POST', headers },
        ),
        { params: Promise.resolve({ id: 'case' }) },
        'approve',
      );
      expect(response.status).toBe(403);
      expect(proxy).not.toHaveBeenCalled();
    },
  );
  it('uses the configured public application origin rather than a supplied request host', async () => {
    const { proxy, decide } = proxyFixture();
    const response = await decide(
      new Request(
        'https://attacker.example/api/attendance/offline-reconciliation/case/approve',
        { method: 'POST', headers: { Origin: 'https://attacker.example' } },
      ),
      { params: Promise.resolve({ id: 'case' }) },
      'approve',
    );
    expect(response.status).toBe(403);
    expect(proxy).not.toHaveBeenCalled();
  });
  it('forwards a same-origin decision via the existing authenticated account proxy, encodes identifiers and prevents caching', async () => {
    const { proxy, decide } = proxyFixture();
    const request = new Request(
      'https://inout.example/api/attendance/offline-reconciliation/case/approve',
      {
        method: 'POST',
        headers: {
          Origin: 'https://inout.example',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Reviewed evidence' }),
      },
    );
    const response = await decide(
      request,
      { params: Promise.resolve({ id: '../other' }) },
      'approve',
    );
    expect(proxy).toHaveBeenCalledWith(
      request,
      '/attendance/offline-reconciliation/..%2Fother/approve',
      'POST',
      expect.any(String),
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
