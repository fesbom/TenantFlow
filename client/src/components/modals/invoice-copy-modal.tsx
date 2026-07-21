import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, CheckCheck, FileText } from "lucide-react";
import { Patient } from "@/types";
import { formatDateBR } from "@/lib/date-formatter";

export const ALL_INVOICE_FIELDS = [
  { key: "fullName", label: "Nome Completo", group: "Identificação" },
  { key: "cpf", label: "CPF", group: "Identificação" },
  { key: "rg", label: "RG", group: "Identificação" },
  { key: "birthDate", label: "Data de Nascimento", group: "Identificação" },
  { key: "birthCity", label: "Cidade de Nascimento", group: "Identificação" },
  { key: "maritalStatus", label: "Estado Civil", group: "Identificação" },
  { key: "email", label: "E-mail", group: "Contato" },
  { key: "phone", label: "Telefone", group: "Contato" },
  { key: "workPhone", label: "Telefone Comercial", group: "Contato" },
  { key: "cep", label: "CEP", group: "Endereço" },
  { key: "fullAddress", label: "Endereço Completo", group: "Endereço" },
  { key: "address", label: "Logradouro", group: "Endereço" },
  { key: "number", label: "Número", group: "Endereço" },
  { key: "complement", label: "Complemento", group: "Endereço" },
  { key: "neighborhood", label: "Bairro", group: "Endereço" },
  { key: "city", label: "Cidade", group: "Endereço" },
  { key: "state", label: "Estado (UF)", group: "Endereço" },
  { key: "responsibleName", label: "Nome do Responsável", group: "Responsável" },
  { key: "responsibleCpf", label: "CPF do Responsável", group: "Responsável" },
];

export const DEFAULT_INVOICE_FIELDS = [
  "fullName",
  "cpf",
  "birthDate",
  "phone",
  "email",
  "cep",
  "fullAddress",
];

function getFieldValue(patient: Patient, key: string): string {
  if (key === "fullAddress") {
    return [
      patient.address,
      patient.number ? `nº ${patient.number}` : null,
      patient.complement,
      patient.neighborhood,
      patient.city,
      patient.state,
    ]
      .filter(Boolean)
      .join(", ");
  }
  if (key === "birthDate") return patient.birthDate ? formatDateBR(patient.birthDate) : "";
  return (patient as any)[key] ?? "";
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  activeFields: string[];
}

export default function InvoiceCopyModal({ isOpen, onClose, patient, activeFields }: Props) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, key: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyAll = async () => {
    const lines = activeFields
      .map((key) => {
        const field = ALL_INVOICE_FIELDS.find((f) => f.key === key);
        const value = getFieldValue(patient, key);
        return value ? `${field?.label || key}: ${value}` : null;
      })
      .filter(Boolean);
    if (!lines.length) return;
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied("__all__");
    setTimeout(() => setCopied(null), 1800);
    toast({ title: "Copiado!", description: "Todos os campos foram copiados para a área de transferência." });
  };

  const fields = activeFields
    .map((key) => ({
      key,
      label: ALL_INVOICE_FIELDS.find((f) => f.key === key)?.label ?? key,
      value: getFieldValue(patient, key),
    }))
    .filter((f) => f.value);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal-600" />
            Cópia Rápida — Nota Fiscal
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-500 -mt-1 mb-1">{patient.fullName}</p>

        <div className="space-y-1.5 max-h-[22rem] overflow-y-auto pr-0.5">
          {fields.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">
              Nenhum dado disponível para este paciente com os campos configurados.
            </p>
          ) : (
            fields.map(({ key, label, value }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors group"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-gray-400 leading-none mb-0.5">{label}</div>
                  <div className="text-sm font-medium text-gray-800 break-words">{value}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 h-7 w-7 p-0 opacity-60 group-hover:opacity-100"
                  onClick={() => copy(value, key)}
                  title={`Copiar ${label}`}
                >
                  {copied === key ? (
                    <CheckCheck className="h-4 w-4 text-teal-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-500" />
                  )}
                </Button>
              </div>
            ))
          )}
        </div>

        {fields.length > 0 && (
          <Button variant="outline" className="w-full mt-2" onClick={copyAll}>
            {copied === "__all__" ? (
              <>
                <CheckCheck className="h-4 w-4 mr-2 text-teal-600" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-2" />
                Copiar Todos os Campos
              </>
            )}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
