import { proxyApiRequest } from '@/lib/api-route';

const allowedFields = [
  'type',
  'code',
  'name',
  'description',
  'active',
  'latenessMinMinutes',
  'latenessMinInclusive',
  'latenessMaxMinutes',
  'latenessMaxInclusive',
  'monthlyTolerance',
  'amountFcfa',
  'priority',
  'appliedReason',
  'toleratedReason',
] as const;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const payload =
    body && typeof body === 'object' && !Array.isArray(body)
      ? Object.fromEntries(
          allowedFields.flatMap((field) =>
            field in body
              ? [[field, (body as Record<string, unknown>)[field]]]
              : [],
          ),
        )
      : {};

  return proxyApiRequest(
    '/sanctions/rules',
    {
      body: JSON.stringify(payload),
      method: 'POST',
    },
    'Impossible de creer la regle de sanction.',
  );
}
