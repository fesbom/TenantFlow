import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  startOfWeek, endOfWeek, addDays, format, isSameDay,
  addWeeks, subWeeks, addDays as add, parseISO
} from "date-fns";
import { ptBR } from "date-fns/locale";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { Appointment, Patient, User } from "@/types";

const fetchWithAuth = (url: string) =>
  fetch(url, { headers: { Authorization: `Bearer ${localStorage.getItem("dental_token")}` } }).then((r) => r.json());

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Agendado",
  in_progress: "Em atendimento",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function fmtTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "HH:mm");
}

function fmtDate(date: Date) {
  return format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
}

function capitalizeFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function PrintSchedule() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [view, setView] = useState<"daily" | "weekly">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedDentist, setSelectedDentist] = useState("all");
  const [hideCancel, setHideCancel] = useState(true);

  // ── Queries ──────────────────────────────────────────────
  const { data: appointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    queryFn: () => fetchWithAuth("/api/appointments"),
  });

  const { data: usersData = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: () => fetchWithAuth("/api/users"),
  });

  const { data: patientsResp } = useQuery<{ data: Patient[] }>({
    queryKey: ["/api/patients", { page: 1, pageSize: 5000 }],
    queryFn: () => fetchWithAuth("/api/patients?page=1&pageSize=5000"),
  });

  const { data: clinicData } = useQuery<{ name: string }>({
    queryKey: ["/api/clinic"],
    queryFn: () => fetchWithAuth("/api/clinic"),
  });

  const dentists = usersData.filter((u) => u.role === "dentist");
  const patientMap = useMemo(() => {
    const m = new Map<string, string>();
    (patientsResp?.data ?? []).forEach((p) => m.set(p.id, p.fullName));
    return m;
  }, [patientsResp]);
  const dentistMap = useMemo(() => {
    const m = new Map<string, string>();
    usersData.forEach((u) => m.set(u.id, u.fullName));
    return m;
  }, [usersData]);

  // ── Week helpers ─────────────────────────────────────────
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday
  const weekDays = Array.from({ length: 6 }, (_, i) => add(weekStart, i)); // Mon–Sat

  const navPrev = () =>
    setSelectedDate((d) => view === "daily" ? addDays(d, -1) : subWeeks(d, 1));
  const navNext = () =>
    setSelectedDate((d) => view === "daily" ? addDays(d, 1) : addWeeks(d, 1));

  // ── Filter appointments ───────────────────────────────────
  const filtered = useMemo(() => {
    return appointments
      .filter((a) => {
        if (selectedDentist !== "all" && a.dentistId !== selectedDentist) return false;
        if (hideCancel && a.status === "cancelled") return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
      );
  }, [appointments, selectedDentist, hideCancel]);

  const dailyAppts = useMemo(
    () => filtered.filter((a) => isSameDay(new Date(a.scheduledDate), selectedDate)),
    [filtered, selectedDate],
  );

  const weeklyByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    weekDays.forEach((d) => map.set(format(d, "yyyy-MM-dd"), []));
    filtered.forEach((a) => {
      const key = format(new Date(a.scheduledDate), "yyyy-MM-dd");
      if (map.has(key)) map.get(key)!.push(a);
    });
    return map;
  }, [filtered, weekDays]);

  // ── Helpers ───────────────────────────────────────────────
  const apptRow = (a: Appointment) => ({
    time: fmtTime(a.scheduledDate),
    patient: patientMap.get(a.patientId) ?? "—",
    procedure: a.procedure ?? "—",
    dentist: dentistMap.get(a.dentistId) ?? "—",
    status: STATUS_LABELS[a.status] ?? a.status,
    duration: a.duration ? `${a.duration}min` : "",
  });

  const printTitle =
    view === "daily"
      ? capitalizeFirst(fmtDate(selectedDate))
      : `Semana de ${format(weekStart, "dd/MM")} a ${format(weekDays[5], "dd/MM/yyyy")}`;

  const selectedDentistName =
    selectedDentist === "all" ? null : dentistMap.get(selectedDentist);

  return (
    <>
      {/* ── Print styles injected globally ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-page { padding: 0 !important; margin: 0 !important; background: white !important; }
          body { background: white !important; }
          @page { margin: 12mm 14mm; }
          @page :first { margin-top: 8mm; }
        }
        @media print and (orientation: landscape), @page.landscape {
          @page { size: A4 landscape; margin: 10mm 12mm; }
        }
        .print-only { display: none; }
        .print-obs-col { min-width: 120px; }
        .print-table td, .print-table th { padding: 6px 8px; }
        .print-table thead th { border-bottom: 2px solid #111; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
        .print-table tbody tr { border-bottom: 1px solid #ddd; }
        .print-table tbody tr:last-child { border-bottom: 2px solid #111; }
        .week-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .week-grid th { border: 1px solid #333; background: #f0f0f0; padding: 4px 6px; font-size: 10px; text-align: center; }
        .week-grid td { border: 1px solid #ccc; vertical-align: top; padding: 3px 5px; min-height: 24px; font-size: 10px; }
        .week-appt { margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px dashed #ccc; }
        .week-appt:last-child { border-bottom: none; margin-bottom: 0; }
      `}</style>

      <div className="app-container bg-slate-50 no-print">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isExpanded={sidebarExpanded}
          onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
        />
        <div className="main-content">
          <Header title="Impressão da Agenda" onMenuClick={() => setSidebarOpen(true)} />

          <main className="p-4 lg:p-6 flex-grow">
            {/* ── Toolbar ── */}
            <div className="no-print flex flex-wrap items-center gap-3 mb-6 p-4 bg-white rounded-lg border">
              {/* View */}
              <Select value={view} onValueChange={(v) => setView(v as "daily" | "weekly")}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Visão Diária</SelectItem>
                  <SelectItem value="weekly">Visão Semanal</SelectItem>
                </SelectContent>
              </Select>

              {/* Navigation */}
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={navPrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium px-2 min-w-[180px] text-center">
                  {view === "daily"
                    ? format(selectedDate, "dd/MM/yyyy (EEEE)", { locale: ptBR })
                    : `${format(weekStart, "dd/MM")} – ${format(weekDays[5], "dd/MM/yyyy")}`}
                </span>
                <Button variant="outline" size="sm" onClick={navNext}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 text-xs text-gray-500"
                  onClick={() => setSelectedDate(new Date())}
                >
                  Hoje
                </Button>
              </div>

              {/* Dentist filter */}
              <Select value={selectedDentist} onValueChange={setSelectedDentist}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Todos os dentistas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os dentistas</SelectItem>
                  {dentists.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Hide cancelled */}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideCancel}
                  onChange={(e) => setHideCancel(e.target.checked)}
                  className="rounded"
                />
                Ocultar cancelados
              </label>

              <div className="ml-auto">
                <Button
                  onClick={() => {
                    if (view === "weekly") {
                      document.documentElement.classList.add("landscape-print");
                    } else {
                      document.documentElement.classList.remove("landscape-print");
                    }
                    window.print();
                  }}
                  className="gap-2"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir / Salvar PDF
                </Button>
              </div>
            </div>

            {/* ── Preview wrapper ── */}
            <div className="bg-white rounded-lg border p-6 shadow-sm" id="print-area">
              <PrintContent
                view={view}
                printTitle={printTitle}
                clinicName={clinicData?.name ?? ""}
                selectedDentistName={selectedDentistName}
                dailyAppts={dailyAppts}
                weekDays={weekDays}
                weeklyByDay={weeklyByDay}
                apptRow={apptRow}
              />
            </div>
          </main>
        </div>
      </div>

      {/* ── Print-only version (outside sidebar/layout) ── */}
      <div className="print-only print-page">
        <PrintContent
          view={view}
          printTitle={printTitle}
          clinicName={clinicData?.name ?? ""}
          selectedDentistName={selectedDentistName}
          dailyAppts={dailyAppts}
          weekDays={weekDays}
          weeklyByDay={weeklyByDay}
          apptRow={apptRow}
        />
      </div>
    </>
  );
}

// ── Shared print content ──────────────────────────────────────────────────────
interface PrintContentProps {
  view: "daily" | "weekly";
  printTitle: string;
  clinicName: string;
  selectedDentistName: string | null;
  dailyAppts: Appointment[];
  weekDays: Date[];
  weeklyByDay: Map<string, Appointment[]>;
  apptRow: (a: Appointment) => {
    time: string; patient: string; procedure: string;
    dentist: string; status: string; duration: string;
  };
}

function PrintContent({
  view, printTitle, clinicName, selectedDentistName,
  dailyAppts, weekDays, weeklyByDay, apptRow,
}: PrintContentProps) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", color: "#111" }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        {clinicName && (
          <div style={{ fontSize: 13, color: "#555", marginBottom: 2 }}>{clinicName}</div>
        )}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            Agenda — {view === "daily" ? "Visão Diária" : "Visão Semanal"}
          </h1>
          <span style={{ fontSize: 12, color: "#555" }}>
            Impresso em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
          </span>
        </div>
        <div style={{ fontSize: 14, marginTop: 4, color: "#333" }}>
          {printTitle}
          {selectedDentistName && (
            <span style={{ marginLeft: 12, fontSize: 12, color: "#666" }}>
              · Dr(a). {selectedDentistName}
            </span>
          )}
        </div>
        <hr style={{ marginTop: 10, border: "none", borderTop: "2px solid #111" }} />
      </div>

      {view === "daily" ? (
        <DailyView dailyAppts={dailyAppts} apptRow={apptRow} selectedDentistName={selectedDentistName} />
      ) : (
        <WeeklyView weekDays={weekDays} weeklyByDay={weeklyByDay} apptRow={apptRow} />
      )}
    </div>
  );
}

// ── Daily view ────────────────────────────────────────────────────────────────
function DailyView({
  dailyAppts, apptRow, selectedDentistName,
}: {
  dailyAppts: Appointment[];
  apptRow: (a: Appointment) => any;
  selectedDentistName: string | null;
}) {
  if (dailyAppts.length === 0) {
    return (
      <p style={{ color: "#888", marginTop: 24, textAlign: "center" }}>
        Nenhum agendamento para este dia.
      </p>
    );
  }

  return (
    <table className="print-table" style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th style={{ width: 60, textAlign: "left" }}>Hora</th>
          <th style={{ textAlign: "left" }}>Paciente</th>
          <th style={{ textAlign: "left" }}>Procedimento</th>
          {!selectedDentistName && <th style={{ width: 140, textAlign: "left" }}>Dentista</th>}
          <th style={{ width: 80, textAlign: "left" }}>Duração</th>
          <th style={{ width: 80, textAlign: "left" }}>Status</th>
          <th className="print-obs-col" style={{ textAlign: "left" }}>Obs.</th>
        </tr>
      </thead>
      <tbody>
        {dailyAppts.map((a) => {
          const r = apptRow(a);
          return (
            <tr key={a.id} style={{ opacity: a.status === "cancelled" ? 0.45 : 1 }}>
              <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.time}</td>
              <td>{r.patient}</td>
              <td style={{ color: "#444" }}>{r.procedure}</td>
              {!selectedDentistName && <td style={{ fontSize: 12, color: "#555" }}>{r.dentist}</td>}
              <td style={{ fontSize: 12, color: "#666" }}>{r.duration}</td>
              <td style={{ fontSize: 11, color: a.status === "cancelled" ? "#e55" : "#555" }}>
                {r.status}
              </td>
              <td style={{ borderBottom: "1px solid #bbb", minWidth: 120 }}>&nbsp;</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Weekly view ───────────────────────────────────────────────────────────────
function WeeklyView({
  weekDays, weeklyByDay, apptRow,
}: {
  weekDays: Date[];
  weeklyByDay: Map<string, Appointment[]>;
  apptRow: (a: Appointment) => any;
}) {
  const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm 12mm; }
        }
      `}</style>
      <table className="week-grid" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            {weekDays.map((d, i) => {
              const key = format(d, "yyyy-MM-dd");
              const isToday = key === today;
              return (
                <th
                  key={key}
                  style={{
                    border: "1px solid #333",
                    background: isToday ? "#e6f4ff" : "#f0f0f0",
                    padding: "5px 6px",
                    fontSize: 11,
                    textAlign: "center",
                    fontWeight: 700,
                  }}
                >
                  {DAY_NAMES[i]}
                  <br />
                  <span style={{ fontWeight: 400, fontSize: 10 }}>{format(d, "dd/MM")}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr>
            {weekDays.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const dayAppts = weeklyByDay.get(key) ?? [];
              return (
                <td
                  key={key}
                  style={{
                    border: "1px solid #ccc",
                    verticalAlign: "top",
                    padding: "4px 5px",
                    fontSize: 10,
                    minHeight: 180,
                  }}
                >
                  {dayAppts.length === 0 ? (
                    <span style={{ color: "#bbb", fontSize: 10 }}>—</span>
                  ) : (
                    dayAppts.map((a) => {
                      const r = apptRow(a);
                      return (
                        <div
                          key={a.id}
                          className="week-appt"
                          style={{
                            marginBottom: 5,
                            paddingBottom: 4,
                            borderBottom: "1px dashed #ccc",
                            opacity: a.status === "cancelled" ? 0.45 : 1,
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 11 }}>{r.time}</div>
                          <div style={{ fontSize: 10, fontWeight: 600 }}>{r.patient}</div>
                          <div style={{ fontSize: 10, color: "#555" }}>{r.procedure}</div>
                          <div style={{ fontSize: 10, color: "#777" }}>{r.dentist}</div>
                        </div>
                      );
                    })
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      {/* Extra blank notes row */}
      <div style={{ marginTop: 16, borderTop: "1px solid #ccc", paddingTop: 8, fontSize: 11, color: "#666" }}>
        <strong>Observações:</strong>
        <div style={{ marginTop: 4, minHeight: 40, borderBottom: "1px solid #bbb" }} />
      </div>
    </>
  );
}
