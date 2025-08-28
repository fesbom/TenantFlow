import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, AlertCircle, CheckCircle, FileText } from "lucide-react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

interface ImportResult {
  success: boolean;
  message: string;
  imported: number;
  failed: number;
  errors?: string[];
}

const dataTypes = [
  {
    value: "users",
    label: "Usuários",
    template: "usuario.csv",
    description: "Importar dados de usuários do sistema",
    columns: ["id", "nome", "nome_usuario", "email", "senha", "funcao", "id_clinica"],
    requirements: "ID da clínica deve existir no sistema. Senhas serão criptografadas automaticamente."
  },
  {
    value: "patients",
    label: "Pacientes",
    template: "paciente.csv",
    description: "Importar dados de pacientes da clínica",
    columns: ["id", "nome", "email", "cpf", "telefone", "data_nascimento", "genero", "estado_civil", "cep", "endereco", "numero", "bairro", "cidade", "estado"],
    requirements: "Email e CPF devem ser únicos. Use formato DD/MM/AAAA para datas. Todos os campos de endereço são opcionais."
  },
  {
    value: "treatments", 
    label: "Tratamentos",
    template: "tratamento.csv",
    description: "Importar tratamentos de pacientes",
    columns: ["id", "id_paciente", "data_inicio", "situacao", "titulo"],
    requirements: "Paciente deve existir no sistema. Use formato DD/MM/AAAA para datas."
  },
  {
    value: "budget-items",
    label: "Orçamentos de Tratamentos", 
    template: "tratamento_orcamento.csv",
    description: "Importar itens de orçamento para tratamentos",
    columns: ["id", "id_tratamento", "descricao", "valor"],
    requirements: "Tratamento deve existir no sistema. Use formato 999,99 para valores."
  },
  {
    value: "treatment-movements",
    label: "Movimentações de Tratamentos",
    template: "tratamento_movimentacao.csv", 
    description: "Importar movimentações e evoluções de tratamentos",
    columns: ["id", "id_tratamento", "data", "descricao", "valor", "foto"],
    requirements: "Tratamento deve existir no sistema. Use formato DD/MM/AAAA para datas e 999,99 para valores."
  }
];

export default function ImportData() {
  const authContext = useAuth();
  const user = authContext?.user;
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  const currentDataType = dataTypes.find(type => type.value === selectedType);

  const importMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/import-csv', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('dental_token')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to import CSV');
      }
      
      const result = await response.json();
      return result as ImportResult;
    },
    onSuccess: (result: ImportResult) => {
      setImportResult(result);
      setImportProgress(100);
      
      if (result.success) {
        toast({
          title: "Importação realizada com sucesso!",
          description: `${result.imported} registros importados`,
        });
      } else {
        toast({
          title: "Importação falhou",
          description: result.message,
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      console.error('Import error:', error);
      toast({
        title: "Erro na importação",
        description: "Falha ao processar o arquivo. Verifique o formato e tente novamente.",
        variant: "destructive",
      });
      setImportProgress(0);
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        toast({
          title: "Formato inválido",
          description: "Por favor, selecione um arquivo CSV.",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      setImportResult(null);
    }
  };

  const handleImport = async () => {
    if (!file || !selectedType) {
      toast({
        title: "Dados incompletos",
        description: "Selecione o tipo de dados e um arquivo CSV.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', selectedType);

    setImportProgress(10);
    importMutation.mutate(formData);
  };

  const downloadTemplate = () => {
    if (!currentDataType) return;
    
    // Generate CSV template with headers
    const headers = currentDataType.columns.join(',');
    const exampleRow = currentDataType.columns.map(col => {
      switch (col) {
        case 'id': return '1';
        case 'nome': return 'João Silva';
        case 'nome_usuario': return 'joao.silva';
        case 'email': return 'joao@clinica.com';
        case 'senha': return '123456';
        case 'funcao': return 'Dentista';
        case 'id_clinica': return '1';
        case 'cpf': return '123.456.789-00';
        case 'telefone': return '(11) 99999-9999';
        case 'data_nascimento': return '01/01/1980';
        case 'genero': return 'Masculino';
        case 'estado_civil': return 'Solteiro';
        case 'cep': return '01234-567';
        case 'endereco': return 'Rua das Flores, 123';
        case 'numero': return '123';
        case 'bairro': return 'Centro';
        case 'cidade': return 'São Paulo';
        case 'estado': return 'SP';
        case 'id_paciente': return '1';
        case 'data_inicio': case 'data': return '01/01/2024';
        case 'situacao': return 'Em andamento';
        case 'titulo': return 'Tratamento de Canal';
        case 'id_tratamento': return '1';
        case 'descricao': return 'Consulta inicial';
        case 'valor': return '150,00';
        case 'foto': return 'https://exemplo.com/foto.jpg';
        default: return 'exemplo';
      }
    }).join(',');
    
    const csvContent = `${headers}\n${exampleRow}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', currentDataType.template);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
      
      <div className="flex-1 flex flex-col">
        <Header title="Importar Dados" onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Importar Dados</h1>
            <p className="text-muted-foreground">
              Importe dados de sistemas anteriores usando arquivos CSV
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Configuration Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Configuração da Importação
              </CardTitle>
              <CardDescription>
                Selecione o tipo de dados e faça upload do arquivo CSV
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="dataType">Tipo de Dados</Label>
                <Select value={selectedType} onValueChange={setSelectedType} data-testid="select-data-type">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de dados" />
                  </SelectTrigger>
                  <SelectContent>
                    {dataTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {currentDataType && (
                <Alert>
                  <FileText className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Colunas necessárias:</strong> {currentDataType.columns.join(', ')}
                    <br />
                    <strong>Requisitos:</strong> {currentDataType.requirements}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="csvFile">Arquivo CSV</Label>
                <Input
                  id="csvFile"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  data-testid="input-csv-file"
                  className="cursor-pointer"
                />
                {file && (
                  <p className="text-sm text-muted-foreground">
                    Arquivo selecionado: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleImport}
                  disabled={!file || !selectedType || importMutation.isPending}
                  className="flex-1"
                  data-testid="button-import"
                >
                  {importMutation.isPending ? (
                    <>Importando...</>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Importar Dados
                    </>
                  )}
                </Button>
                
                {currentDataType && (
                  <Button
                    variant="outline"
                    onClick={downloadTemplate}
                    data-testid="button-download-template"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Template
                  </Button>
                )}
              </div>

              {importMutation.isPending && (
                <div className="space-y-2">
                  <Label>Progresso da Importação</Label>
                  <Progress value={importProgress} className="w-full" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Instructions Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Instruções de Importação</CardTitle>
              <CardDescription>
                Siga estas diretrizes para uma importação bem-sucedida
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentDataType ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm">{currentDataType.label}</h4>
                    <p className="text-sm text-muted-foreground">
                      {currentDataType.description}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <h5 className="font-medium text-sm">Formato do Arquivo:</h5>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Arquivo deve ter extensão .csv</li>
                      <li>• Primeira linha deve conter os cabeçalhos</li>
                      <li>• Use vírgula (,) como separador</li>
                      <li>• Codificação UTF-8 recomendada</li>
                      <li>• Máximo 1000 registros por arquivo</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <h5 className="font-medium text-sm">Ordem de Importação Recomendada:</h5>
                    <ol className="text-sm text-muted-foreground space-y-1">
                      <li>1. Usuários (se necessário)</li>
                      <li>2. Tratamentos</li>
                      <li>3. Orçamentos de Tratamentos</li>
                      <li>4. Movimentações de Tratamentos</li>
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <FileText className="mx-auto h-12 w-12 mb-3 opacity-50" />
                  <p>Selecione um tipo de dados para ver as instruções específicas</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        {importResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {importResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600" />
                )}
                Resultado da Importação
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <Label>Registros Importados</Label>
                    <p className="text-2xl font-bold text-green-600">{importResult.imported}</p>
                  </div>
                  <div className="space-y-1">
                    <Label>Registros com Erro</Label>
                    <p className="text-2xl font-bold text-red-600">{importResult.failed}</p>
                  </div>
                </div>

                {importResult.message && (
                  <Alert className={importResult.success ? "border-green-200" : "border-red-200"}>
                    <AlertDescription>{importResult.message}</AlertDescription>
                  </Alert>
                )}

                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="space-y-2">
                    <Label>Erros Encontrados:</Label>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {importResult.errors.map((error, index) => (
                        <p key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          {error}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
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