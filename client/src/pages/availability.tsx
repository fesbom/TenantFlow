import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Clock, CalendarOff, Plus, Trash2, Save, Sun, Cloud, Moon } from "lucide-react";
import type { User } from "@/types";
import type { DentistSchedule, ClinicHoliday } from "@shared/schema";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  { label: "Dom", value: 0 },
  { label: "Seg", value: 1 },
  { label: "Ter", value: 2 },
  { label: "Qua", value: 3 },
  { label: "Qui", value: 4 },
  { label: "Sex", value: 5 },
  { label: "Sáb", value: 6 },
];

const PERIODS = [
  { key: "morning",   label: "Matutino",   icon: Sun,   defaultStart: "08:00", defaultEnd: "12:00" },
  { key: "afternoon", label: "Vespertino", icon: Cloud, defaultStart: "13:00", defaultEnd: "18:00" },
  { key: "evening",   label: "Noturno",    icon: Moon,  defaultStart: "18:00", defaultEnd: "21:00" },
] as const;

type Period = typeof PERIODS[number]["key"];

interface GridCell {
  isActive: boolean;
  startTime: string;
  endTime: string;
}

type ScheduleGrid = Record<number, Record<Period, GridCell>>;

function buildEmptyGrid(): ScheduleGrid {
  const grid: ScheduleGrid = {};
  for (const day of WEEKDAYS) {
    grid[day.value] = {} as Record<Period, GridCell>;
    for (const period of PERIODS) {
      grid[day.value][period.key] = {
        isActive: false,
        startTime: period.defaultStart,
        endTime: period.defaultEnd,
      };
    }
  }
  return grid;
}

function schedulesToGrid(schedules: DentistSchedule[]): ScheduleGrid {
  const grid = buildEmptyGrid();
  for (const s of schedules) {
    const period = s.period as Period;
    if (grid[s.weekday] && grid[s.weekday][period] !== undefined) {
      grid[s.weekday][period] = {
        isActive: s.isActive,
        startTime: s.startTime,
        endTime: s.endTime,
      };
    }
  }
  return grid;
}

function gridToSchedules(
  grid: ScheduleGrid,
  dentistId: string,
  clinicId: string,
): Array<{ dentistId: string; clinicId: string; weekday: number; period: string; startTime: string; endTime: string; isActive: boolean }> {
  const result = [];
  for (const day of WEEKDAYS) {
    for (const period of PERIODS) {
      const cell = grid[day.value][period.key];
      result.push({
        dentistId,
        clinicId,
        weekday: day.value,
        period: period.key,
        startTime: cell.startTime,
        endTime: cell.endTime,
        isActive: cell.isActive,
      });
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Availability() {
  const { toast } = useToast();
  const authContext = useAuth();
  const user = authContext?.user;
  const clinicId = (user as any)?.clinicId ?? "";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [selectedDentistId, setSelectedDentistId] = useState<string>("");
  const [grid, setGrid] = useState<ScheduleGrid>(buildEmptyGrid());
  const [gridDirty, setGridDirty] = useState(false);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayType, setHolidayType] = useState<"holiday" | "recess">("holiday");
  const [deleteHolidayId, setDeleteHolidayId] = useState<string | null>(null);

  // ── Fetch dentists ──
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const dentists = users.filter((u) => u.role === "dentist");

  // Auto-select: if dentist role → own ID; else pick first dentist
  useEffect(() => {
    if (!selectedDentistId) {
      if (user?.role === "dentist") {
        setSelectedDentistId(user.id);
      } else if (dentists.length > 0) {
        setSelectedDentistId(dentists[0].id);
      }
    }
  }, [dentists, user, selectedDentistId]);

  // ── Fetch schedule for selected dentist ──
  const { data: rawSchedules = [] } = useQuery<DentistSchedule[]>({
    queryKey: ["/api/availability/schedule", selectedDentistId],
    queryFn: async () => {
      if (!selectedDentistId) return [];
      const res = await fetch(`/api/availability/schedule/${selectedDentistId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
      });
      return res.json();
    },
    enabled: !!selectedDentistId,
  });

  // Build grid whenever schedules or selected dentist change
  useEffect(() => {
    setGrid(schedulesToGrid(rawSchedules));
    setGridDirty(false);
  }, [rawSchedules, selectedDentistId]);

  // ── Fetch holidays ──
  const { data: holidays = [] } = useQuery<ClinicHoliday[]>({
    queryKey: ["/api/availability/holidays"],
  });

  // ── Mutations ──
  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      const schedules = gridToSchedules(grid, selectedDentistId, clinicId);
      return apiRequest("PUT", `/api/availability/schedule/${selectedDentistId}`, { schedules });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability/schedule", selectedDentistId] });
      queryClient.invalidateQueries({ queryKey: ["/api/availability/all-schedules"] });
      setGridDirty(false);
      toast({ title: "Grade salva com sucesso" });
    },
    onError: () => toast({ title: "Erro ao salvar grade", variant: "destructive" }),
  });

  const addHolidayMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", "/api/availability/holidays", {
        date: holidayDate,
        name: holidayName,
        type: holidayType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability/holidays"] });
      setHolidayDate("");
      setHolidayName("");
      setHolidayType("holiday");
      toast({ title: "Feriado/Recesso cadastrado" });
    },
    onError: () => toast({ title: "Erro ao cadastrar feriado", variant: "destructive" }),
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/availability/holidays/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability/holidays"] });
      setDeleteHolidayId(null);
      toast({ title: "Feriado/Recesso removido" });
    },
    onError: () => toast({ title: "Erro ao remover feriado", variant: "destructive" }),
  });

  // ── Grid helpers ──
  function updateCell(weekday: number, period: Period, changes: Partial<GridCell>) {
    setGrid((prev) => ({
      ...prev,
      [weekday]: {
        ...prev[weekday],
        [period]: { ...prev[weekday][period], ...changes },
      },
    }));
    setGridDirty(true);
  }

  function toggleAllWeekday(weekday: number, activate: boolean) {
    setGrid((prev) => {
      const updated = { ...prev };
      for (const period of PERIODS) {
        updated[weekday] = {
          ...updated[weekday],
          [period.key]: { ...updated[weekday][period.key], isActive: activate },
        };
      }
      return updated;
    });
    setGridDirty(true);
  }

  // ── Selected dentist name ──
  const selectedDentist = dentists.find((d) => d.id === selectedDentistId);

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} title="Disponibilidade" />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">

          {/* ── DENTIST SELECTOR (admin only) ── */}
          {user?.role !== "dentist" && (
            <Card>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-4">
                  <Label className="text-sm font-medium whitespace-nowrap">Dentista:</Label>
                  <Select value={selectedDentistId} onValueChange={setSelectedDentistId}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Selecione um dentista" />
                    </SelectTrigger>
                    <SelectContent>
                      {dentists.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── SCHEDULE GRID ── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-primary" />
                  Grade de Disponibilidade
                  {selectedDentist && (
                    <span className="text-gray-400 font-normal">— {selectedDentist.fullName}</span>
                  )}
                </CardTitle>
                <Button
                  onClick={() => saveScheduleMutation.mutate()}
                  disabled={saveScheduleMutation.isPending || !selectedDentistId || !gridDirty}
                  size="sm"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveScheduleMutation.isPending ? "Salvando..." : "Salvar Grade"}
                </Button>
              </div>
              {gridDirty && (
                <p className="text-xs text-amber-600 mt-1">Há alterações não salvas. Clique em "Salvar Grade" para confirmar.</p>
              )}
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 w-28">Período</th>
                    {WEEKDAYS.map((day) => (
                      <th key={day.value} className="py-3 px-2 text-center min-w-[110px]">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-semibold text-gray-700">{day.label}</span>
                          <button
                            onClick={() => {
                              const allActive = PERIODS.every((p) => grid[day.value][p.key].isActive);
                              toggleAllWeekday(day.value, !allActive);
                            }}
                            className="text-[10px] text-primary hover:underline"
                          >
                            {PERIODS.every((p) => grid[day.value]?.[p.key]?.isActive) ? "limpar" : "todos"}
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map((period) => {
                    const Icon = period.icon;
                    return (
                      <tr key={period.key} className="border-b hover:bg-gray-50/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-xs font-medium text-gray-700">{period.label}</span>
                          </div>
                        </td>
                        {WEEKDAYS.map((day) => {
                          const cell = grid[day.value]?.[period.key] ?? {
                            isActive: false,
                            startTime: period.defaultStart,
                            endTime: period.defaultEnd,
                          };
                          return (
                            <td key={day.value} className="py-2 px-2 align-top">
                              <div
                                className={`rounded-lg border p-2 transition-colors ${
                                  cell.isActive
                                    ? "bg-primary/5 border-primary/30"
                                    : "bg-gray-50 border-gray-200"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <Switch
                                    checked={cell.isActive}
                                    onCheckedChange={(v) => updateCell(day.value, period.key, { isActive: v })}
                                  />
                                  {cell.isActive && (
                                    <span className="text-[10px] text-primary font-medium">Ativo</span>
                                  )}
                                </div>
                                {cell.isActive && (
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-gray-400 w-5">De:</span>
                                      <Input
                                        type="time"
                                        value={cell.startTime}
                                        onChange={(e) => updateCell(day.value, period.key, { startTime: e.target.value })}
                                        className="h-6 text-[11px] px-1 py-0 w-full"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-gray-400 w-5">Até:</span>
                                      <Input
                                        type="time"
                                        value={cell.endTime}
                                        onChange={(e) => updateCell(day.value, period.key, { endTime: e.target.value })}
                                        className="h-6 text-[11px] px-1 py-0 w-full"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* ── HOLIDAYS & RECESSES ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarOff className="h-4 w-4 text-red-500" />
                Feriados e Recessos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              {/* Add holiday form */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <div className="sm:col-span-1">
                  <Label className="text-xs mb-1 block text-gray-500">Data</Label>
                  <Input
                    type="date"
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs mb-1 block text-gray-500">Nome</Label>
                  <Input
                    placeholder="Ex: Natal, Recesso de Julho..."
                    value={holidayName}
                    onChange={(e) => setHolidayName(e.target.value)}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label className="text-xs mb-1 block text-gray-500">Tipo</Label>
                  <div className="flex gap-2">
                    <Select value={holidayType} onValueChange={(v) => setHolidayType(v as "holiday" | "recess")}>
                      <SelectTrigger className="h-9 text-sm flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="holiday">Feriado</SelectItem>
                        <SelectItem value="recess">Recesso</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={() => addHolidayMutation.mutate()}
                      disabled={!holidayDate || !holidayName || addHolidayMutation.isPending}
                      className="h-9 px-3"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Holiday list */}
              {holidays.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Nenhum feriado ou recesso cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {holidays.map((h) => {
                    const [y, m, d] = h.date.split("-");
                    const dateFormatted = `${d}/${m}/${y}`;
                    return (
                      <div
                        key={h.id}
                        className="flex items-center justify-between px-4 py-3 rounded-lg border bg-white hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-800">{dateFormatted}</span>
                          <span className="text-sm text-gray-600">{h.name}</span>
                          <Badge
                            variant="secondary"
                            className={
                              h.type === "holiday"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }
                          >
                            {h.type === "holiday" ? "Feriado" : "Recesso"}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteHolidayId(h.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Confirm delete dialog */}
      <AlertDialog open={!!deleteHolidayId} onOpenChange={(open) => !open && setDeleteHolidayId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover feriado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover o feriado/recesso. O agendamento via WhatsApp voltará a aceitar datas nesse dia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteHolidayId && deleteHolidayMutation.mutate(deleteHolidayId)}
              disabled={deleteHolidayMutation.isPending}
            >
              Sim, remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
