import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { uploadFiles } from "@/lib/api";
import { Patient, MedicalRecord } from "@/types";
import { Camera, X, Upload, User } from "lucide-react";

interface MedicalRecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
  record?: MedicalRecord | null;
}

interface MedicalRecordFormData {
  procedure: string;
  clinicalNotes: string;
  treatmentPlan: string;
  cost: string;
}

export default function MedicalRecordModal({ isOpen, onClose, patient, record }: MedicalRecordModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<MedicalRecordFormData>({
    procedure: "",
    clinicalNotes: "",
    treatmentPlan: "",
    cost: "",
  });

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);

  useEffect(() => {
    if (record) {
      setFormData({
        procedure: record.procedure,
        clinicalNotes: record.clinicalNotes || "",
        treatmentPlan: record.treatmentPlan || "",
        cost: record.cost || "",
      });
      
      // Parse existing images
      if (record.images) {
        try {
          const images = JSON.parse(record.images);
          setExistingImages(Array.isArray(images) ? images : []);
        } catch {
          setExistingImages([]);
        }
      }
    } else {
      setFormData({
        procedure: "",
        clinicalNotes: "",
        treatmentPlan: "",
        cost: "",
      });
      setExistingImages([]);
    }
    setSelectedFiles([]);
  }, [record]);

  const createMedicalRecordMutation = useMutation({
    mutationFn: async (data: MedicalRecordFormData) => {
      if (!patient) throw new Error("Patient is required");

      const formDataToSend = new FormData();
      formDataToSend.append("patientId", patient.id);
      formDataToSend.append("procedure", data.procedure);
      formDataToSend.append("clinicalNotes", data.clinicalNotes);
      formDataToSend.append("treatmentPlan", data.treatmentPlan);
      formDataToSend.append("cost", data.cost);

      // Append images
      selectedFiles.forEach((file) => {
        formDataToSend.append("images", file);
      });

      const response = await uploadFiles("/api/medical-records", formDataToSend);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medical-records/patient", patient?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Prontuário criado",
        description: "Prontuário criado com sucesso",
      });
      onClose();
    },
    onError: () => {
      toast({
        title: "Erro ao criar prontuário",
        description: "Não foi possível criar o prontuário",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMedicalRecordMutation.mutate(formData);
  };

  const handleInputChange = (field: keyof MedicalRecordFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== files.length) {
      toast({
        title: "Arquivos inválidos",
        description: "Apenas arquivos de imagem são permitidos",
        variant: "destructive",
      });
    }
    
    setSelectedFiles(prev => [...prev, ...imageFiles]);
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = (index: number) => {
    setExistingImages(prev => prev.filter((_, i) => i !== index));
  };

  const procedures = [
    "Consulta de rotina",
    "Limpeza dental",
    "Restauração",
    "Canal",
    "Extração",
    "Implante",
    "Prótese",
    "Ortodontia",
    "Clareamento",
    "Cirurgia oral",
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {record ? "Visualizar Prontuário" : "Novo Prontuário"}
            {patient && ` - ${patient.fullName}`}
          </DialogTitle>
        </DialogHeader>

        {patient && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-4">
              {/* Patient Photo */}
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-200 bg-gray-100 flex items-center justify-center flex-shrink-0">
                {patient.photoUrl ? (
                  <img
                    src={patient.photoUrl}
                    alt={patient.fullName}
                    className="w-full h-full object-cover"
                    data-testid="img-medical-record-patient-photo"
                  />
                ) : (
                  <User className="w-8 h-8 text-gray-400" />
                )}
              </div>
              
              {/* Patient Info */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Paciente:</span>
                  <span className="ml-2 text-gray-900">{patient.fullName}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Telefone:</span>
                  <span className="ml-2 text-gray-900">{patient.phone}</span>
                </div>
                {patient.email && (
                  <div>
                    <span className="font-medium text-gray-700">Email:</span>
                    <span className="ml-2 text-gray-900">{patient.email}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="procedure">Procedimento *</Label>
              <Select
                value={formData.procedure}
                onValueChange={(value) => handleInputChange("procedure", value)}
                required
                disabled={!!record}
              >
                <SelectTrigger data-testid="select-procedure">
                  <SelectValue placeholder="Selecione o procedimento" />
                </SelectTrigger>
                <SelectContent>
                  {procedures.map((procedure) => (
                    <SelectItem key={procedure} value={procedure}>
                      {procedure}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinicalNotes">Observações Clínicas</Label>
              <Textarea
                id="clinicalNotes"
                value={formData.clinicalNotes}
                onChange={(e) => handleInputChange("clinicalNotes", e.target.value)}
                placeholder="Descreva os achados clínicos, sintomas reportados pelo paciente..."
                rows={4}
                disabled={!!record}
                data-testid="textarea-clinical-notes"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="treatmentPlan">Plano de Tratamento</Label>
              <Textarea
                id="treatmentPlan"
                value={formData.treatmentPlan}
                onChange={(e) => handleInputChange("treatmentPlan", e.target.value)}
                placeholder="Descreva o plano de tratamento recomendado..."
                rows={3}
                disabled={!!record}
                data-testid="textarea-treatment-plan"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost">Valor do Procedimento</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                value={formData.cost}
                onChange={(e) => handleInputChange("cost", e.target.value)}
                placeholder="0.00"
                disabled={!!record}
                data-testid="input-procedure-cost"
              />
            </div>

            {!record && (
              <div className="space-y-2">
                <Label>Fotos do Procedimento</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-input"
                    data-testid="input-images"
                  />
                  <label htmlFor="file-input" className="cursor-pointer">
                    <div className="space-y-2">
                      <Camera className="h-8 w-8 mx-auto text-gray-400" />
                      <p className="text-sm text-gray-600">
                        Clique para adicionar fotos ou arraste aqui
                      </p>
                      <Button type="button" variant="outline" size="sm">
                        <Upload className="h-4 w-4 mr-2" />
                        Selecionar Arquivos
                      </Button>
                    </div>
                  </label>
                </div>

                {/* Preview selected files */}
                {selectedFiles.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={`Preview ${index + 1}`}
                          className="w-full h-24 object-cover rounded-lg border border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`button-remove-new-image-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Display existing images for viewing */}
            {existingImages.length > 0 && (
              <div className="space-y-2">
                <Label>Imagens do Procedimento</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {existingImages.map((imagePath, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={imagePath}
                        alt={`Procedimento ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-gray-200"
                        onError={(e) => {
                          e.currentTarget.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMiAxNkM4LjY4NjI5IDE2IDYgMTMuMzEzNyA2IDEwQzYgNi42ODYyOSA4LjY4NjI5IDQgMTIgNEMxNS4zMTM3IDQgMTggNi42ODYyOSAxOCAxMEMxOCAxMy4zMTM3IDE1LjMxMzcgMTYgMTIgMTZaTTEyIDEyQzEzLjEwNDYgMTIgMTQgMTEuMTA0NiAxNCA5LjVDMTQgOC4zOTU0MyAxMy4xMDQ2IDcuNSAxMiA3LjVDMTAuODk1NCA3LjUgMTAgOC4zOTU0MyAxMCA5LjVDMTAgMTEuMTA0NiAxMC44OTU0IDEyIDEyIDEyWiIgZmlsbD0iIzlDQTNBRiIvPgo8L3N2Zz4K";
                        }}
                      />
                      {!record && (
                        <button
                          type="button"
                          onClick={() => removeExistingImage(index)}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`button-remove-existing-image-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-testid="button-cancel-medical-record"
            >
              {record ? "Fechar" : "Cancelar"}
            </Button>
            {!record && (
              <Button
                type="submit"
                disabled={createMedicalRecordMutation.isPending}
                data-testid="button-save-medical-record"
              >
                {createMedicalRecordMutation.isPending ? "Salvando..." : "Salvar Prontuário"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
