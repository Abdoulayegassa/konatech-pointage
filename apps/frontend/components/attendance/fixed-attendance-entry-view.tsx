import Image from 'next/image';
import {
  AttendanceRecord,
  EmployeeTodayAttendance,
  AuthenticatedUser,
} from '@/lib/api';
import { EmployeeAttendanceActions } from '@/components/attendance/employee-attendance-actions';
import { Card, CardContent } from '@/components/ui/card';

type FixedAttendanceEntryViewProps = {
  history: AttendanceRecord[];
  today: EmployeeTodayAttendance;
  user: AuthenticatedUser;
  sessionMode?: 'account' | 'attendance-entry';
};

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

export function FixedAttendanceEntryView({
  today,
  user,
  sessionMode = 'account',
}: FixedAttendanceEntryViewProps) {
  const employeeName = `${user.firstName} ${user.lastName}`;
  const employeeInitials = getInitials(user.firstName, user.lastName);

  return (
    <main className="relative flex h-[100dvh] min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-2 py-2 sm:min-h-screen sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,244,0.9),rgba(248,250,252,0.98)_38%,rgba(255,255,255,1))]" />

      <div className="relative mx-auto flex h-full max-h-[100dvh] w-full max-w-[460px] flex-col gap-2 sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:gap-3">
        <header className="flex shrink-0 items-center justify-between gap-3 rounded-[24px] border border-white/80 bg-white/88 px-4 py-3 shadow-[0_14px_34px_rgba(15,45,58,0.07)]">
          <div className="flex min-w-0 items-center">
            <Image
              alt="Konatech"
              className="h-auto w-20 shrink-0 object-contain sm:w-24"
              height={120}
              priority
              src="/konatech-logo.png"
              width={240}
            />
          </div>
          <div
            aria-label={employeeName}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-white shadow-[0_12px_24px_rgba(16,50,60,0.2)]"
          >
            {employeeInitials}
          </div>
        </header>

        <Card className="min-h-0 flex-1 overflow-hidden rounded-[22px] border-white/80 bg-white/96 shadow-[0_20px_50px_rgba(15,45,58,0.12)] sm:rounded-[28px] sm:shadow-[0_24px_60px_rgba(15,45,58,0.13)]">
          <CardContent className="flex h-full min-h-0 flex-col gap-2 p-3 sm:gap-4 sm:p-5">
            <EmployeeAttendanceActions
              canCheckIn={today.canCheckIn}
              canCheckOut={today.canCheckOut}
              employeeName={employeeName}
              securityPolicy={today.securityPolicy}
              sessionMode={sessionMode}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
