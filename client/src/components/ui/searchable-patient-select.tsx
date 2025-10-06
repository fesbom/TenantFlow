import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Patient } from "@/types";

interface PaginatedResponse {
  data: Patient[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

interface SearchablePatientSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
  required?: boolean;
}

export function SearchablePatientSelect({
  value,
  onValueChange,
  placeholder = "Selecione um paciente...",
  className,
  "data-testid": testId,
  required = false,
}: SearchablePatientSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch patients with search
  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ["/api/patients", { page: 1, pageSize: 50, search: debouncedSearch }],
    enabled: open, // Only fetch when popover is open
  });

  const patients = data?.data || [];

  // Fetch selected patient separately if we have a value but haven't loaded it yet
  const { data: selectedPatientData } = useQuery<PaginatedResponse>({
    queryKey: ["/api/patients", { page: 1, pageSize: 1, search: value }],
    enabled: !!value && !patients.find(p => p.id === value),
  });

  const selectedPatient = patients.find(patient => patient.id === value) || 
                          selectedPatientData?.data.find(p => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          data-testid={testId}
        >
          {selectedPatient?.fullName || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput 
            placeholder="Digite o nome do paciente..." 
            className="h-9" 
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Buscando pacientes...</span>
              </div>
            ) : patients.length === 0 ? (
              <CommandEmpty>
                {searchTerm ? "Nenhum paciente encontrado." : "Digite para buscar pacientes..."}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {patients.map((patient) => (
                  <CommandItem
                    key={patient.id}
                    value={patient.id}
                    onSelect={() => {
                      onValueChange(patient.id);
                      setOpen(false);
                      setSearchTerm(""); // Clear search when selecting
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === patient.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {patient.fullName}
                    {patient.cpf && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        - CPF: {patient.cpf}
                      </span>
                    )}
                  </CommandItem>
                ))}
                {data?.pagination && data.pagination.totalCount > patients.length && (
                  <div className="px-2 py-1 text-xs text-muted-foreground text-center border-t">
                    Mostrando {patients.length} de {data.pagination.totalCount} pacientes
                  </div>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
