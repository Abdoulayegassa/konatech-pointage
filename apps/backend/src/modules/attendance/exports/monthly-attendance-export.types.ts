export type MonthlyAttendanceExportRow = {
  fullName: string;
  employeeIdentifier: string;
  department: string;
  assignedSchedule: string;
  workingDays: number;
  presenceDays: number;
  totalWorkedDays: number;
  outsideScheduleWorkDays: number;
  entryCount: number;
  exitCount: number;
  lateDays: number;
  absentDays: number;
  absenceCount: number;
  incompleteAttendanceDays: number;
  totalWorkedHours: string;
  earlyExitDays: number;
  earlyExitMinutes: number;
  scheduledOvertimeHours: string;
  outsideScheduleOvertimeHours: string;
  overtimeHours: string;
};

export type MonthlyAttendanceDailyReportRow = {
  date: string;
  dayLabel: string;
  clockInTime: string;
  clockOutTime: string;
  statusLabel: string;
  lateLabel: string;
  earlyExitLabel: string;
  workTypeLabel: string;
  overtimeLabel: string;
  gpsVerificationLabel: string;
};

export type MonthlyAttendanceEmployeeLateBreakdown = {
  minorCount: number;
  moderateCount: number;
  criticalCount: number;
};

export type MonthlyAttendanceEmployeeLateRangeBreakdown = {
  fiveToFifteenCount: number;
  sixteenToThirtyCount: number;
  overThirtyCount: number;
};

export type MonthlyAttendanceEmployeeExitBreakdown = {
  normalExitCount: number;
  earlyExitCount: number;
  overtimeDayCount: number;
  overtimeHours: string;
  outsideScheduleWorkDays: number;
  outsideScheduleOvertimeHours: string;
};

export type MonthlyAttendanceEmployeeGpsBreakdown = {
  gpsValidatedPointages: number;
  nonGpsPointages: number;
  insideZonePointages: number;
  outsideZoneAttempts: number | null;
  modeLabel: string;
};

export type MonthlyAttendanceEmployeeReport = {
  fullName: string;
  employeeIdentifier: string;
  departmentLabel: string;
  assignedScheduleLabel: string;
  monthLabel: string;
  generationDateLabel: string;
  workingDays: number;
  presenceDays: number;
  presenceRate: number;
  absenceCount: number;
  outsideScheduleWorkDays: number;
  entryCount: number;
  exitCount: number;
  totalWorkedHours: string;
  scheduledOvertimeHours: string;
  outsideScheduleOvertimeHours: string;
  overtimeHours: string;
  earlyExitCount: number;
  lateCount: number;
  performanceScore: number;
  lateBreakdown: MonthlyAttendanceEmployeeLateBreakdown;
  lateRangeBreakdown: MonthlyAttendanceEmployeeLateRangeBreakdown;
  exitBreakdown: MonthlyAttendanceEmployeeExitBreakdown;
  gpsBreakdown: MonthlyAttendanceEmployeeGpsBreakdown;
  dailyRows: MonthlyAttendanceDailyReportRow[];
};

export type MonthlyAttendanceExportReport = {
  month: number;
  year: number;
  generatedAt: string;
  currentVerificationModelLabel: string;
  legacyVerificationLabel: string;
  blockedAttemptsLabel: string;
  rows: MonthlyAttendanceExportRow[];
  employeeReport: MonthlyAttendanceEmployeeReport | null;
};

export type AttendanceExportFile = {
  content: string | Buffer;
  fileName: string;
  mimeType: string;
};
