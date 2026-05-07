import { Injectable } from '@nestjs/common';
import {
  AttendanceExportFile,
  MonthlyAttendanceExportReport,
} from './monthly-attendance-export.types';

@Injectable()
export class MonthlyAttendanceCsvExporterService {
  export(report: MonthlyAttendanceExportReport): AttendanceExportFile {
    const rows = report.rows.map((row) =>
      [
        row.fullName,
        row.employeeIdentifier,
        row.department,
        row.assignedSchedule,
        String(row.workingDays),
        String(row.presenceDays),
        String(row.totalWorkedDays),
        String(row.outsideScheduleWorkDays),
        String(row.entryCount),
        String(row.exitCount),
        String(row.lateDays),
        String(row.absentDays),
        String(row.absenceCount),
        String(row.incompleteAttendanceDays),
        row.totalWorkedHours,
        String(row.earlyExitDays),
        String(row.earlyExitMinutes),
        row.scheduledOvertimeHours,
        row.outsideScheduleOvertimeHours,
        row.overtimeHours,
      ]
        .map((value) => this.escapeCsvCell(value))
        .join(','),
    );

    return {
      fileName: `attendance-export-${report.year}-${String(report.month).padStart(2, '0')}.csv`,
      mimeType: 'text/csv; charset=utf-8',
      content: [
        '\uFEFFFull Name,Employee Identifier,Department,Assigned Schedule,Working Days,Scheduled Presence Days,Total Worked Days,Outside Schedule Work Days,Entries,Exits,Late Days,Absent Days,Absence Count,Incomplete Attendance Days,Total Worked Hours,Depart anticipe (jours),Depart anticipe (min),Scheduled Overtime Hours,Outside Schedule Overtime Hours,Heures supplementaires',
        ...rows,
      ].join('\r\n'),
    };
  }

  private escapeCsvCell(value: string) {
    const normalizedValue = value.replace(/"/g, '""');

    if (/[",\r\n]/.test(normalizedValue)) {
      return `"${normalizedValue}"`;
    }

    return normalizedValue;
  }
}
