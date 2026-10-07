import { OfflineAttendancePage } from '@/components/attendance/offline-attendance-page';

export const dynamic = 'force-static';
export const metadata = { title: 'Pointage hors connexion | InOut' };

export default function AttendanceEntryOfflinePage() {
  return <OfflineAttendancePage onlinePath="/attendance-entry" />;
}
