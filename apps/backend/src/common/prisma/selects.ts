import { Prisma } from '@prisma/client';

export const scheduleSelect = {
  id: true,
  name: true,
  startTime: true,
  endTime: true,
  latenessMarginMinutes: true,
  isActive: true,
  workDays: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ScheduleSelect;

export const publicEmployeeSelect = {
  id: true,
  employeeIdentifier: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  accessRole: true,
  department: true,
  isActive: true,
  scheduleId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeSelect;

export const employeeWithScheduleSelect = {
  ...publicEmployeeSelect,
  schedule: {
    select: scheduleSelect,
  },
} satisfies Prisma.EmployeeSelect;

export const scheduleWithEmployeesSelect = {
  ...scheduleSelect,
  employees: {
    select: publicEmployeeSelect,
  },
} satisfies Prisma.ScheduleSelect;

export const attendanceWithEmployeeSelect = {
  id: true,
  employeeId: true,
  date: true,
  clockInAt: true,
  clockOutAt: true,
  outsideScheduleWork: true,
  scheduledExitTime: true,
  earlyExit: true,
  earlyExitMinutes: true,
  overtimeHours: true,
  overtimeMinutes: true,
  lateExit: true,
  absenceCount: true,
  status: true,
  minutesLate: true,
  notes: true,
  scheduleIdSnapshot: true,
  scheduleNameSnapshot: true,
  scheduleStartTimeSnapshot: true,
  scheduleEndTimeSnapshot: true,
  scheduleWorkDaysSnapshot: true,
  scheduleLatenessMarginSnapshot: true,
  scheduleCapturedAt: true,
  checkInLatitude: true,
  checkInLongitude: true,
  checkInAccuracyMeters: true,
  checkInDistanceMeters: true,
  checkInVerificationMethod: true,
  checkInVerificationLevel: true,
  checkInVerificationReason: true,
  checkInVerificationPhoto: true,
  checkInVerificationPhotoPublicId: true,
  checkOutLatitude: true,
  checkOutLongitude: true,
  checkOutAccuracyMeters: true,
  checkOutDistanceMeters: true,
  checkOutVerificationMethod: true,
  checkOutVerificationLevel: true,
  checkOutVerificationReason: true,
  checkOutVerificationPhoto: true,
  checkOutVerificationPhotoPublicId: true,
  createdAt: true,
  updatedAt: true,
  employee: {
    select: publicEmployeeSelect,
  },
} satisfies Prisma.AttendanceSelect;

export type PublicEmployee = Prisma.EmployeeGetPayload<{
  select: typeof publicEmployeeSelect;
}>;
