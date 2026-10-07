import { cookies } from 'next/headers';
import { AttendanceEntryPinView } from '@/components/attendance/attendance-entry-pin-view';
import { AttendanceEntrySiteRequiredView } from '@/components/attendance/attendance-entry-site-required-view';
import { FixedAttendanceEntryView } from '@/components/attendance/fixed-attendance-entry-view';
import { getCurrentUserFromApi, getEmployeeAttendanceData } from '@/lib/api';
import { ATTENDANCE_ENTRY_SESSION_COOKIE_NAME } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

export default async function AttendanceEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ site?: string; sitePublicId?: string }>;
}) {
  const params = await searchParams;
  // Keep accepting already-issued `site` QR links while making
  // `sitePublicId` the canonical public contract.
  const sitePublicId = params.sitePublicId ?? params.site;
  const attendanceEntryRedirectTo = sitePublicId
    ? `/attendance-entry?sitePublicId=${encodeURIComponent(sitePublicId)}`
    : undefined;
  const attendanceEntryToken =
    (await cookies()).get(ATTENDANCE_ENTRY_SESSION_COOKIE_NAME)?.value ?? null;

  if (!attendanceEntryToken) {
    return sitePublicId ? (
      <AttendanceEntryPinView sitePublicId={sitePublicId} />
    ) : (
      <AttendanceEntrySiteRequiredView />
    );
  }

  try {
    const [identifiedUser, { today, history }] = await Promise.all([
      getCurrentUserFromApi(attendanceEntryToken),
      getEmployeeAttendanceData(attendanceEntryToken),
    ]);

    if (identifiedUser.accessRole !== 'EMPLOYEE') {
      return sitePublicId ? (
        <AttendanceEntryPinView
          clearStaleSessionOnMount
          sitePublicId={sitePublicId}
        />
      ) : (
        <AttendanceEntrySiteRequiredView />
      );
    }

    return (
      <FixedAttendanceEntryView
        attendanceEntryRedirectTo={attendanceEntryRedirectTo}
        history={history}
        sessionMode="attendance-entry"
        today={today}
        user={identifiedUser}
      />
    );
  } catch {
    return sitePublicId ? (
      <AttendanceEntryPinView
        clearStaleSessionOnMount
        sitePublicId={sitePublicId}
      />
    ) : (
      <AttendanceEntrySiteRequiredView />
    );
  }
}
