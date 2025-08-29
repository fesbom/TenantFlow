import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
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

interface SearchablePatientSelectProps {
  patients: Patient[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
  required?: boolean;
}

export function SearchablePatientSelect({
  patients,
  value,
  onValueChange,
  placeholder = "Selecione um paciente...",
  className,
  "data-testid": testId,
  required = false,
}: SearchablePatientSelectProps) {
  const [open, setOpen] = useState(false);

  // Sort patients alphabetically by name
  const sortedPatients = [...patients].sort((a, b) => 
    a.fullName.localeCompare(b.fullName, 'pt-BR', { sensitivity: 'base' })
  );

  const selectedPatient = sortedPatients.find(patient => patient.id === value);

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
        <Command>
          <CommandInput 
            placeholder="Digite o nome do paciente..." 
            className="h-9" 
          />
          <CommandList>
            <CommandEmpty>Nenhum paciente encontrado.</CommandEmpty>
            <CommandGroup>
              {sortedPatients.map((patient) => (
                <CommandItem
                  key={patient.id}
                  value={patient.fullName}
                  onSelect={() => {
                    onValueChange(patient.id);
                    setOpen(false);
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
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}