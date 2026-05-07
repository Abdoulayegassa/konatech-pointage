import { cookies } from 'next/headers';
import { AttendanceEntryPinView } from '@/components/attendance/attendance-entry-pin-view';
import { FixedAttendanceEntryView } from '@/components/attendance/fixed-attendance-entry-view';
import { getCurrentUserFromApi, getEmployeeAttendanceData } from '@/lib/api';
import { ATTENDANCE_ENTRY_SESSION_COOKIE_NAME } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

function currentMonth() {
  const now = new Date();
  const month = `${now.getUTCMonth() + 1}`.padStart(2, '0');

  return `${now.getUTCFullYear()}-${month}`;
}

export default async function AttendanceEntryPage() {
  const attendanceEntryToken =
    (await cookies()).get(ATTENDANCE_ENTRY_SESSION_COOKIE_NAME)?.value ?? null;

  if (!attendanceEntryToken) {
    return <AttendanceEntryPinView />;
  }

  try {
    const [identifiedUser, { today, history }] = await Promise.all([
      getCurrentUserFromApi(attendanceEntryToken),
      getEmployeeAttendanceData(attendanceEntryToken, currentMonth()),
    ]);

    if (identifiedUser.accessRole !== 'EMPLOYEE') {
      return <AttendanceEntryPinView clearStaleSessionOnMount />;
    }

    return (
      <FixedAttendanceEntryView
        history={history}
        sessionMode="attendance-entry"
        today={today}
        user={identifiedUser}
      />
    );
  } catch {
    return <AttendanceEntryPinView clearStaleSessionOnMount />;
  }
}
