import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Building2, Save, Sun, Cloud, Moon } from "lucide-react";
import type { ClinicBusinessHours } from "@shared/schema";

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
  { key: "morning", label: "Matutino", icon: Sun, defaultStart: "08:00", defaultEnd: "12:00" },
  { key: "afternoon", label: "Vespertino", icon: Cloud, defaultStart: "13:00", defaultEnd: "18:00" },
  { key: "evening", label: "Noturno", icon: Moon, defaultStart: "18:00", defaultEnd: "21:00" },
] as const;

type Period = (typeof PERIODS)[number]["key"];
interface Cell {
  isActive: boolean;
  startTime: string;
  endTime: string;
}
type Grid = Record<number, Record<Period, Cell>>;

function emptyGrid(): Grid {
  const grid = {} as Grid;
  for (const day of WEEKDAYS) {
    grid[day.value] = {} as Record<Period, Cell>;
    for (const p of PERIODS) {
      grid[day.value][p.key] = { isActive: false, startTime: p.defaultStart, endTime: p.defaultEnd };
    }
  }
  return grid;
}

function rowsToGrid(rows: ClinicBusinessHours[]): Grid {
  const grid = emptyGrid();
  for (const r of rows) {
    const period = r.period as Period;
    if (grid[r.weekday]?.[period]) {
      grid[r.weekday][period] = { isActive: r.isActive, startTime: r.startTime, endTime: r.endTime };
    }
  }
  return grid;
}

export default function BusinessHoursCard() {
  const { toast } = useToast();
  const [grid, setGrid] = useState<Grid>(emptyGrid());
  const [dirty, setDirty] = useState(false);

  const { data: rows = [] } = useQuery<ClinicBusinessHours[]>({
    queryKey: ["/api/availability/business-hours"],
  });

  useEffect(() => {
    setGrid(rowsToGrid(rows));
    setDirty(false);
  }, [rows]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const hours = WEEKDAYS.flatMap((day) =>
        PERIODS.map((p) => ({ weekday: day.value, period: p.key, ...grid[day.value][p.key] })),
      );
      return apiRequest("PUT", "/api/availability/business-hours", { hours });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/availability/business-hours"] });
      setDirty(false);
      toast({ title: "Horário de atendimento salvo" });
    },
    onError: () => toast({ title: "Erro ao salvar horário de atendimento", variant: "destructive" }),
  });

  function updateCell(weekday: number, period: Period, changes: Partial<Cell>) {
    setGrid((prev) => ({
      ...prev,
      [weekday]: { ...prev[weekday], [period]: { ...prev[weekday][period], ...changes } },
    }));
    setDirty(true);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" />
            Horário de Atendimento da Clínica
          </CardTitle>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !dirty} size="sm">
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : "Salvar Horário"}
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Quando a IA não conseguir agendar e transferir o paciente, fora desses horários ele será avisado do
          horário de atendimento e que a equipe responderá assim que o atendimento iniciar. Sem nenhum horário
          ativo, o aviso não é enviado.
        </p>
        {dirty && (
          <p className="text-xs text-amber-600 mt-1">
            Há alterações não salvas. Clique em "Salvar Horário" para confirmar.
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 w-28">Período</th>
              {WEEKDAYS.map((day) => (
                <th key={day.value} className="py-3 px-2 text-center min-w-[110px] text-xs font-semibold text-gray-700">
                  {day.label}
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
                    const cell = grid[day.value][period.key];
                    return (
                      <td key={day.value} className="py-2 px-2 align-top">
                        <div
                          className={`rounded-lg border p-2 transition-colors ${
                            cell.isActive ? "bg-primary/5 border-primary/30" : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <Switch
                              checked={cell.isActive}
                              onCheckedChange={(v) => updateCell(day.value, period.key, { isActive: v })}
                            />
                            {cell.isActive && <span className="text-[10px] text-primary font-medium">Ativo</span>}
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
  );
}
