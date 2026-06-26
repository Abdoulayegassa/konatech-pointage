export type CalendarDayType =
  | 'WORKING_DAY'
  | 'PUBLIC_HOLIDAY'
  | 'COMPANY_HOLIDAY'
  | 'WEEKEND'
  | 'LEAVE'
  | 'EXTERNAL_MISSION';

export type CalendarEntryType = Extract<
  CalendarDayType,
  'PUBLIC_HOLIDAY' | 'COMPANY_HOLIDAY' | 'LEAVE' | 'EXTERNAL_MISSION'
>;

export type CalendarSummary = {
  workingDays: number;
  weekends: number;
  publicHolidays: number;
  companyHolidays: number;
};

export type CalendarEntryRecord = {
  id: string;
  name: string;
  description: string | null;
  date: string;
  type: CalendarEntryType;
  employeeId: string | null;
  employeeIdentifier: string | null;
  employeeName: string | null;
  department: string | null;
  isActive: boolean;
};

export type CalendarDayRecord = {
  date: string;
  dayLabel: string;
  isoWeekLabel: string;
  type: CalendarDayType;
  label: string;
  description: string | null;
  isNonWorkingDay: boolean;
  entries: CalendarEntryRecord[];
};

export type CalendarMonthResponse = {
  month: string;
  monthLabel: string;
  summary: CalendarSummary;
  days: CalendarDayRecord[];
  entries: CalendarEntryRecord[];
};
