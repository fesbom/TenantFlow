import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle, XCircle, Loader2, AlertCircle, Image } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

interface FileUploadStatus {
  file: File;
  externalId: string;
  status: 'pending' | 'searching' | 'uploading' | 'success' | 'error';
  message: string;
}

export default function BatchUpload() {
  const authContext = useAuth();
  const user = authContext?.user;
  const { toast } = useToast();
  const [files, setFiles] = useState<FileUploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const fileStatuses: FileUploadStatus[] = [];
    
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      
      // Validate file type
      const isValidType = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type);
      if (!isValidType) {
        toast({
          title: "Arquivo inválido",
          description: `${file.name}: Tipo de arquivo não suportado. Use JPG, PNG ou WEBP.`,
          variant: "destructive",
        });
        continue;
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: "Arquivo muito grande",
          description: `${file.name}: Tamanho máximo permitido é 5MB.`,
          variant: "destructive",
        });
        continue;
      }

      // Extract external ID from filename (remove extension)
      const externalId = file.name.replace(/\.(jpg|jpeg|png|webp)$/i, '');
      
      fileStatuses.push({
        file,
        externalId,
        status: 'pending',
        message: 'Aguardando envio'
      });
    }

    setFiles(fileStatuses);
    
    if (fileStatuses.length > 0) {
      toast({
        title: "Arquivos selecionados",
        description: `${fileStatuses.length} arquivo(s) pronto(s) para envio.`,
      });
    }
  };

  const handleStartUpload = async () => {
    if (files.length === 0) {
      toast({
        title: "Nenhum arquivo selecionado",
        description: "Selecione pelo menos um arquivo para fazer upload.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    const token = localStorage.getItem('dental_token');
    
    // Track results locally to compute accurate final summary
    let successCount = 0;
    let errorCount = 0;
    
    // Process each file sequentially
    for (let i = 0; i < files.length; i++) {
      const fileStatus = files[i];
      
      try {
        // Step 1: Update status to searching
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'searching', message: 'Buscando paciente...' } : f
        ));

        // Step 2: Search for patient by external ID
        const searchResponse = await fetch(`/api/patients/by-external-id/${encodeURIComponent(fileStatus.externalId)}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!searchResponse.ok) {
          // Patient not found
          errorCount++;
          setFiles(prev => prev.map((f, idx) => 
            idx === i ? { 
              ...f, 
              status: 'error', 
              message: `Erro: Paciente com ID "${fileStatus.externalId}" não encontrado` 
            } : f
          ));
          continue;
        }

        const patient = await searchResponse.json();
        const patientId = patient.id;

        // Step 3: Update status to uploading
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { ...f, status: 'uploading', message: 'Enviando foto...' } : f
        ));

        // Step 4: Upload photo using existing endpoint
        const formData = new FormData();
        formData.append('photo', fileStatus.file);

        const uploadResponse = await fetch(`/api/patients/${patientId}/photo`, {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({ message: 'Erro desconhecido' }));
          errorCount++;
          setFiles(prev => prev.map((f, idx) => 
            idx === i ? { 
              ...f, 
              status: 'error', 
              message: `Erro no upload: ${errorData.message}` 
            } : f
          ));
          continue;
        }

        // Step 5: Success
        successCount++;
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { 
            ...f, 
            status: 'success', 
            message: `Foto enviada com sucesso para ${patient.fullName}` 
          } : f
        ));

      } catch (error) {
        console.error('Upload error:', error);
        errorCount++;
        setFiles(prev => prev.map((f, idx) => 
          idx === i ? { 
            ...f, 
            status: 'error', 
            message: 'Erro inesperado no processamento' 
          } : f
        ));
      }
    }

    setIsUploading(false);
    
    // Show final summary using locally tracked counts
    toast({
      title: "Upload finalizado",
      description: `${successCount} foto(s) enviada(s) com sucesso, ${errorCount} erro(s).`,
      variant: successCount > 0 ? "default" : "destructive",
    });
  };

  const getStatusIcon = (status: FileUploadStatus['status']) => {
    switch (status) {
      case 'pending':
        return <AlertCircle className="h-5 w-5 text-gray-400" />;
      case 'searching':
      case 'uploading':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusColor = (status: FileUploadStatus['status']) => {
    switch (status) {
      case 'pending':
        return 'bg-gray-50 border-gray-200';
      case 'searching':
      case 'uploading':
        return 'bg-blue-50 border-blue-200';
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Upload de Fotos em Lote" onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900">Upload de Fotos em Lote</h1>
              <p className="text-gray-600 mt-2">
                Envie múltiplas fotos de pacientes de uma vez. O nome de cada arquivo deve ser o ID externo do paciente.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Selecionar Arquivos</CardTitle>
                <CardDescription>
                  Escolha os arquivos de foto. O nome de cada arquivo (sem extensão) deve corresponder ao ID externo do paciente.
                  Exemplo: <code className="bg-gray-100 px-1 py-0.5 rounded">pac-123.jpg</code>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="batch-files">Arquivos (JPG, PNG, WEBP - máx 5MB cada)</Label>
                  <Input
                    id="batch-files"
                    type="file"
                    multiple
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFileChange}
                    disabled={isUploading}
                    data-testid="input-batch-files"
                  />
                </div>

                {files.length > 0 && (
                  <Alert>
                    <Image className="h-4 w-4" />
                    <AlertDescription>
                      {files.length} arquivo(s) selecionado(s). Clique em "Iniciar Envio" para começar o upload.
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleStartUpload}
                  disabled={files.length === 0 || isUploading}
                  className="w-full"
                  data-testid="button-start-upload"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Iniciar Envio
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {files.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Status do Upload</CardTitle>
                  <CardDescription>
                    Acompanhe o progresso de cada arquivo
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {files.map((fileStatus, index) => (
                      <div
                        key={index}
                        className={`p-4 border rounded-lg ${getStatusColor(fileStatus.status)}`}
                        data-testid={`status-item-${index}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {getStatusIcon(fileStatus.status)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate" data-testid={`status-filename-${index}`}>
                              {fileStatus.file.name}
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                              ID Externo: <span className="font-mono">{fileStatus.externalId}</span>
                            </p>
                            <p className="text-sm mt-1" data-testid={`status-message-${index}`}>
                              {fileStatus.message}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
