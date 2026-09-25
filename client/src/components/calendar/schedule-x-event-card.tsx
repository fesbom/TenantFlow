import { Clock, User as UserIcon, CheckCircle2, XCircle, PlayCircle, CheckCheck, type LucideIcon } from "lucide-react";
import { ProtectedImage } from "@/components/ui/protected-image";
import type { Appointment } from "@/types";

/** Event shape handed to Schedule-X, extended with our own appointment metadata. */
export interface ScheduleXAppointmentEvent {
  id: string;
  title: string;
  start: any; // Temporal.ZonedDateTime
  end: any; // Temporal.ZonedDateTime
  appointment: Appointment;
  patientName: string;
  dentistName: string;
  patientPhotoUrl?: string;
}

interface StatusConfig {
  label: string;
  badgeClass: string;
  barClass: string;
  dotClass: string;
  iconClass: string;
  // Distinct shapes (not just color) so the status is readable for colorblind users.
  icon: LucideIcon;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  pending: {
    label: "Aguardando",
    badgeClass: "bg-amber-100 text-amber-800",
    barClass: "border-amber-400",
    dotClass: "bg-amber-400",
    iconClass: "text-amber-600",
    icon: Clock,
  },
  scheduled: {
    label: "Aguardando",
    badgeClass: "bg-amber-100 text-amber-800",
    barClass: "border-amber-400",
    dotClass: "bg-amber-400",
    iconClass: "text-amber-600",
    icon: Clock,
  },
  confirmed: {
    label: "Confirmado",
    badgeClass: "bg-blue-100 text-blue-900",
    barClass: "border-blue-800",
    dotClass: "bg-blue-800",
    iconClass: "text-blue-800",
    icon: CheckCircle2,
  },
  in_progress: {
    label: "Em atendimento",
    badgeClass: "bg-yellow-100 text-yellow-800",
    barClass: "border-yellow-500",
    dotClass: "bg-yellow-500",
    iconClass: "text-yellow-700",
    icon: PlayCircle,
  },
  completed: {
    label: "Concluído",
    badgeClass: "bg-green-100 text-green-800",
    barClass: "border-green-500",
    dotClass: "bg-green-500",
    iconClass: "text-green-700",
    icon: CheckCheck,
  },
  cancelled: {
    label: "Cancelado",
    badgeClass: "bg-red-100 text-red-900",
    barClass: "border-red-800",
    dotClass: "bg-red-800",
    iconClass: "text-red-800",
    icon: XCircle,
  },
};

function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status] || STATUS_CONFIG.scheduled;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatZonedTime(zonedDateTime: any): string {
  return `${pad(zonedDateTime.hour)}:${pad(zonedDateTime.minute)}`;
}

/** Rich card used for week/day time-grid and all-day events. */
export function AppointmentEventCard({ calendarEvent }: { calendarEvent: ScheduleXAppointmentEvent }) {
  const { appointment, patientName, dentistName, patientPhotoUrl } = calendarEvent;
  const status = getStatusConfig(appointment.status);
  const timeLabel = `${formatZonedTime(calendarEvent.start)} - ${formatZonedTime(calendarEvent.end)}`;

  return (
    <div
      className={`flex h-full w-full flex-col gap-1 overflow-hidden rounded-md border-l-4 bg-white px-2 py-1 shadow-sm transition-shadow hover:shadow-md ${status.barClass}`}
      title={`${patientName} | ${timeLabel} | ${appointment.procedure || "Consulta"} | ${status.label}`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[11px] font-semibold text-slate-800">
          {appointment.procedure || "Consulta"}
        </span>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${status.badgeClass}`}>
          <status.icon className="h-2.5 w-2.5" />
          {status.label}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50">
          {patientPhotoUrl ? (
            <ProtectedImage src={patientPhotoUrl} alt={patientName} className="h-full w-full object-cover" />
          ) : (
            <UserIcon className="h-2.5 w-2.5 text-slate-400" />
          )}
        </div>
        <span className="truncate text-[11px] text-slate-700">{patientName}</span>
      </div>

      <div className="flex min-w-0 items-center gap-1 text-[10px] text-slate-500">
        <Clock className="h-2.5 w-2.5 shrink-0" />
        <span className="shrink-0">{timeLabel}</span>
        <span className="truncate">• {dentistName}</span>
      </div>
    </div>
  );
}

/** Compact card used inside month-grid cells, where space is limited. */
export function AppointmentMonthGridEventCard({ calendarEvent }: { calendarEvent: ScheduleXAppointmentEvent }) {
  const { appointment, patientName } = calendarEvent;
  const status = getStatusConfig(appointment.status);
  const timeLabel = formatZonedTime(calendarEvent.start);

  return (
    <div
      className="flex w-full min-w-0 items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] hover:bg-slate-50"
      title={`${patientName} | ${timeLabel} | ${appointment.procedure || "Consulta"} | ${status.label}`}
    >
      <status.icon className={`h-2.5 w-2.5 shrink-0 ${status.iconClass}`} />
      <span className="shrink-0 font-medium text-slate-600">{timeLabel}</span>
      <span className="truncate text-slate-700">{patientName}</span>
    </div>
  );
}
