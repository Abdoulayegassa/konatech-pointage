import { proxyApiRequest } from '@/lib/api-route';

type AttendanceSanctionRouteContext = {
  params: Promise<{
    attendanceId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: AttendanceSanctionRouteContext,
) {
  const { attendanceId } = await context.params;

  return proxyApiRequest(
    `/sanctions/attendance/${encodeURIComponent(attendanceId)}`,
    {
      method: 'GET',
    },
    'Analyse disciplinaire temporairement indisponible.',
  );
}
