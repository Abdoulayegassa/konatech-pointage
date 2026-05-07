import {
  AttendanceStatus,
  AttendanceVerificationLevel,
  AttendanceVerificationMethod,
} from '@prisma/client';

export type DashboardSummary = {
  totalEmployees: number;
  presentToday: number;
  lateEmployeesToday: number;
  absentEmployeesToday: number;
  earlyExitToday: number;
  overtimeHoursToday: number;
  totalAttendanceRecordsToday: number;
};

export type DashboardTopLateEmployee = {
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  lateCount: number;
  totalMinutesLate: number;
  averageMinutesLate: number;
};

export type DashboardTopSuspiciousEmployee = {
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  legacySensitiveCount: number;
  legacyWarningCount: number;
  legacyStrictCount: number;
  legacyPhotoVerificationCount: number;
  suspiciousCount: number;
  warningCount: number;
  strictCount: number;
  photoVerificationCount: number;
  maxDistanceMeters: number | null;
};

export type DashboardTopOvertimeEmployee = {
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  overtimeHours: number;
};

export type DashboardTopEarlyExitEmployee = {
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  earlyExitCount: number;
  totalEarlyExitMinutes: number;
};

export type DashboardAnalytics = {
  attendanceRate: number;
  latenessRate: number;
  absenceRate: number;
  absenceCountThisMonth: number;
  outsideScheduleWorkDays: number;
  outsideScheduleOvertimeHoursThisMonth: number;
  gpsValidatedCheckInCount: number;
  gpsValidatedCheckOutCount: number;
  gpsValidatedAttendanceCount: number;
  insideZoneCheckInCount: number;
  insideZoneCheckOutCount: number;
  insideZoneAttendanceCount: number;
  blockedCheckInCount: number | null;
  blockedCheckOutCount: number | null;
  blockedAttendanceAttemptCount: number | null;
  outsideZoneRejectedAttemptCount: number | null;
  legacySensitiveCheckInCount: number;
  legacySensitiveCheckOutCount: number;
  legacyHistoricalVerificationCount: number;
  legacyPhotoCheckInCount: number;
  legacyPhotoCheckOutCount: number;
  legacyHistoricalPhotoCount: number;
  suspiciousCheckInCount: number;
  suspiciousCheckOutCount: number;
  earlyExitCount: number;
  overtimeHoursThisMonth: number;
  photoVerificationCount: number;
  checkOutPhotoVerificationCount: number;
  topLateEmployees: DashboardTopLateEmployee[];
  topLegacySecurityEmployees: DashboardTopSuspiciousEmployee[];
  topSuspiciousEmployees: DashboardTopSuspiciousEmployee[];
  topOvertimeEmployees: DashboardTopOvertimeEmployee[];
  topEarlyExitEmployees: DashboardTopEarlyExitEmployee[];
};

export type DashboardRecentActivity = {
  id: string;
  employeeId: string;
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  status: AttendanceStatus;
  date: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  outsideScheduleWork: boolean;
  scheduledExitTime: string | null;
  earlyExit: boolean;
  earlyExitMinutes: number;
  overtimeHours: number;
  overtimeMinutes: number;
  absenceCount: number;
  minutesLate: number;
  notes: string | null;
  checkInDistanceMeters: number | null;
  checkInVerificationMethod: AttendanceVerificationMethod;
  checkInVerificationLevel: AttendanceVerificationLevel;
  checkInVerificationReason: string | null;
  checkInVerificationPhoto: string | null;
  checkInVerificationPhotoPublicId: string | null;
  checkOutDistanceMeters: number | null;
  checkOutVerificationMethod: AttendanceVerificationMethod;
  checkOutVerificationLevel: AttendanceVerificationLevel;
  checkOutVerificationReason: string | null;
  checkOutVerificationPhoto: string | null;
  checkOutVerificationPhotoPublicId: string | null;
};

export type DashboardOverview = {
  generatedAt: string;
  date: string;
  summary: DashboardSummary;
  analytics: DashboardAnalytics;
  recentActivity: DashboardRecentActivity[];
};
