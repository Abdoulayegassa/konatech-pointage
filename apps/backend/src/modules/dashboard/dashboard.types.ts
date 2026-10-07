import { AttendanceStatus } from '@prisma/client';

export type DashboardSummary = {
  totalEmployees: number;
  presentToday: number;
  scheduledPresentToday: number;
  lateEmployeesToday: number;
  absentEmployeesToday: number;
  earlyExitToday: number;
  overtimeHoursToday: number;
};

export type DashboardTopLateEmployee = {
  employeeName: string;
  department: string | null;
  lateCount: number;
  totalMinutesLate: number;
  averageMinutesLate: number;
};

export type DashboardTopOvertimeEmployee = {
  employeeName: string;
  department: string | null;
  overtimeHours: number;
};

export type DashboardTopEarlyExitEmployee = {
  employeeName: string;
  department: string | null;
  earlyExitCount: number;
  totalEarlyExitMinutes: number;
};

export type DashboardAnalytics = {
  absenceCountThisMonth: number;
  earlyExitCount: number;
  overtimeHoursThisMonth: number;
  topLateEmployees: DashboardTopLateEmployee[];
  topOvertimeEmployees: DashboardTopOvertimeEmployee[];
  topEarlyExitEmployees: DashboardTopEarlyExitEmployee[];
};

export type DashboardRecentActivity = {
  employeeIdentifier: string;
  employeeName: string;
  department: string | null;
  status: AttendanceStatus;
  date: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  earlyExit: boolean;
  earlyExitMinutes: number;
  overtimeHours: number;
  overtimeMinutes: number;
  absenceCount: number;
  minutesLate: number;
};

export type DashboardOverview = {
  generatedAt: string;
  date: string;
  summary: DashboardSummary;
  analytics: DashboardAnalytics;
  recentActivity: DashboardRecentActivity[];
};
