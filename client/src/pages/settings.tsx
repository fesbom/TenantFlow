import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { formatDateBR } from "@/lib/date-formatter";
import { User, Clinic } from "@/types";
import { Settings, Plus, Edit, Trash2, Users, Shield, Building2, Upload, Wifi, WifiOff, QrCode, RefreshCw, CheckCircle2 } from "lucide-react";

export default function SettingsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    username: "",
    password: "",
    role: "secretary" as "admin" | "dentist" | "secretary",
    defaultAppointmentDuration: undefined as number | undefined,
  });

  const [clinicFormData, setClinicFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    logoUrl: "",
  });

  const [wppFormData, setWppFormData] = useState({
    evolutionInstanceName: "",
    evolutionApiKey: "",
  });
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<string | null>(null);

  // Fetch users
  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: currentUser?.role === "admin",
  });

  // Fetch clinic data
  const { data: clinic, isLoading: clinicLoading } = useQuery<Clinic>({
    queryKey: ["/api/clinic"],
    enabled: currentUser?.role === "admin",
  });

  // Load clinic data into form when it's fetched
  useEffect(() => {
    if (clinic) {
      setClinicFormData({
        name: clinic.name || "",
        email: clinic.email || "",
        phone: clinic.phone || "",
        address: clinic.address || "",
        logoUrl: clinic.logoUrl || "",
      });
    }
  }, [clinic]);

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/users", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Usuário criado",
        description: "Usuário criado com sucesso",
      });
      resetForm();
      setIsModalOpen(false);
    },
    onError: () => {
      toast({
        title: "Erro ao criar usuário",
        description: "Não foi possível criar o usuário",
        variant: "destructive",
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: typeof formData & { id: string }) => {
      const response = await apiRequest("PUT", `/api/users/${data.id}`, data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Erro ao atualizar usuário" }));
        throw new Error(errorData.message || "Não foi possível atualizar os dados do usuário");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Usuário atualizado",
        description: "Dados do usuário atualizados com sucesso",
      });
      resetForm();
      setIsModalOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar usuário",
        description: error.message || "Não foi possível atualizar os dados do usuário",
        variant: "destructive",
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Usuário excluído",
        description: "Usuário excluído com sucesso",
      });
      setUserToDelete(null);
    },
    onError: () => {
      toast({
        title: "Erro ao excluir usuário",
        description: "Não foi possível excluir o usuário",
        variant: "destructive",
      });
    },
  });

  // Update clinic mutation
  const updateClinicMutation = useMutation({
    mutationFn: async (data: typeof clinicFormData) => {
      const response = await apiRequest("PUT", "/api/clinic", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic"] });
      toast({
        title: "Dados da clínica atualizados",
        description: "Os dados da clínica foram atualizados com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar dados da clínica",
        description: error.message || "Não foi possível atualizar os dados da clínica",
        variant: "destructive",
      });
    },
  });

  // WhatsApp status query
  const { data: wppStatus, isLoading: wppStatusLoading, refetch: refetchWppStatus } = useQuery<{
    connected: boolean; status: string; phone?: string; profileName?: string;
    instanceName?: string; connectedPhone?: string;
  }>({
    queryKey: ["/api/whatsapp/status"],
    enabled: currentUser?.role === "admin",
    refetchInterval: 15000,
  });

  // Load wpp form from clinic data
  useEffect(() => {
    if (clinic) {
      setWppFormData({
        evolutionInstanceName: (clinic as any).evolutionInstanceName || "",
        evolutionApiKey: (clinic as any).evolutionApiKey || "",
      });
    }
  }, [clinic]);

  // Save WhatsApp config mutation
  const saveWppConfigMutation = useMutation({
    mutationFn: async (data: typeof wppFormData) => {
      const response = await apiRequest("PATCH", "/api/clinic/whatsapp", data);
      if (!response.ok) throw new Error("Erro ao salvar configuração");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({ title: "Configuração salva", description: "Configuração do WhatsApp salva com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro", description: "Não foi possível salvar a configuração", variant: "destructive" });
    },
  });

  // Generate QR code mutation
  const connectWppMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/whatsapp/connect", {});
      if (!response.ok) throw new Error("Erro ao gerar QR code");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.qrCode) {
        setQrCodeData(data.qrCode);
        setQrStatus("scan");
      } else if (data.status === "connected") {
        setQrCodeData(null);
        setQrStatus("connected");
        refetchWppStatus();
      } else {
        setQrStatus(data.status || "pending");
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
    },
  });

  // Upload logo mutation
  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);
      
      const token = localStorage.getItem('dental_token');
      
      const response = await fetch('/api/clinic/upload-logo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: Upload failed`);
      }
      
      const result = await response.json();
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic"] });
      setClinicFormData({ ...clinicFormData, logoUrl: data.logoUrl });
      toast({
        title: "Logo atualizado",
        description: "O logo da clínica foi atualizado com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao fazer upload do logo",
        description: error.message || "Não foi possível fazer upload do logo",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      fullName: "",
      email: "",
      username: "",
      password: "",
      role: "secretary",
      defaultAppointmentDuration: undefined,
    });
    setSelectedUser(null);
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setFormData({
      fullName: user.fullName,
      email: user.email,
      username: (user as any).username || user.email,
      password: "", // Don't pre-fill password for security
      role: user.role as "admin" | "dentist" | "secretary",
      defaultAppointmentDuration: (user as any).defaultAppointmentDuration || undefined,
    });
    setIsModalOpen(true);
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
  };

  const confirmDeleteUser = () => {
    if (userToDelete) {
      deleteUserMutation.mutate(userToDelete.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (selectedUser) {
      // Update existing user
      updateUserMutation.mutate({ ...formData, id: selectedUser.id });
    } else {
      // Create new user
      createUserMutation.mutate(formData);
    }
  };

  const handleClinicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateClinicMutation.mutate(clinicFormData);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadLogoMutation.mutate(file);
    }
  };

  const getRoleBadge = (role: string) => {
    const roleMap = {
      admin: { label: "Administrador", variant: "destructive" as const },
      dentist: { label: "Dentista", variant: "default" as const },
      secretary: { label: "Secretária", variant: "secondary" as const },
    };

    const config = roleMap[role as keyof typeof roleMap] || roleMap.secretary;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };


  return (
    <div className="app-container bg-slate-50">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />
      
      <div className="main-content">
        <Header title="Configurações" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6 flex-grow">
          {currentUser?.role !== "admin" ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500">
                <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Acesso restrito a administradores</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Users Management */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <Users className="h-5 w-5" />
                        <span>Gerenciamento de Usuários</span>
                      </CardTitle>
                      <p className="text-sm text-gray-600 mt-1">
                        Gerencie os usuários com acesso ao sistema
                      </p>
                    </div>
                    
                    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                      <DialogTrigger asChild>
                        <Button onClick={() => resetForm()} data-testid="button-new-user">
                          <Plus className="h-4 w-4 mr-2" />
                          Novo Usuário
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>
                            {selectedUser ? "Editar Usuário" : "Criar Novo Usuário"}
                          </DialogTitle>
                        </DialogHeader>
                        
                        <form onSubmit={handleSubmit} className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2 space-y-2">
                              <Label htmlFor="fullName">Nome Completo *</Label>
                              <Input
                                id="fullName"
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                placeholder="Digite o nome completo"
                                required
                                data-testid="input-user-fullname"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="email">Email *</Label>
                              <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="email@exemplo.com"
                                required
                                data-testid="input-user-email"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="username">Nome de Usuário *</Label>
                              <Input
                                id="username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                placeholder="nome.usuario"
                                required
                                data-testid="input-user-username"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="password">
                                Senha{selectedUser ? "" : " *"}
                              </Label>
                              <Input
                                id="password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder={selectedUser ? "Deixe em branco para não alterar" : "••••••••"}
                                required={!selectedUser}
                                data-testid="input-user-password"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="role">Função *</Label>
                              <Select
                                value={formData.role}
                                onValueChange={(value: "admin" | "dentist" | "secretary") =>
                                  setFormData({ ...formData, role: value })
                                }
                                required
                              >
                                <SelectTrigger data-testid="select-user-role">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="secretary">Secretária</SelectItem>
                                  <SelectItem value="dentist">Dentista</SelectItem>
                                  <SelectItem value="admin">Administrador</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {formData.role === "dentist" && (
                              <div className="space-y-2">
                                <Label htmlFor="defaultAppointmentDuration">
                                  Duração Padrão da Consulta (minutos)
                                </Label>
                                <Input
                                  id="defaultAppointmentDuration"
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={formData.defaultAppointmentDuration || ""}
                                  onChange={(e) => 
                                    setFormData({ 
                                      ...formData, 
                                      defaultAppointmentDuration: e.target.value ? parseInt(e.target.value) : undefined 
                                    })
                                  }
                                  placeholder="60"
                                  data-testid="input-default-duration"
                                />
                              </div>
                            )}
                          </div>

                          <div className="flex justify-end space-x-3 pt-4 border-t">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setIsModalOpen(false)}
                              data-testid="button-cancel-user"
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="submit"
                              disabled={createUserMutation.isPending || updateUserMutation.isPending}
                              data-testid="button-save-user"
                            >
                              {createUserMutation.isPending || updateUserMutation.isPending
                                ? "Salvando..."
                                : selectedUser
                                ? "Atualizar Usuário"
                                : "Criar Usuário"}
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="text-center py-8 text-gray-500">Carregando usuários...</div>
                  ) : users.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                      <p>Nenhum usuário encontrado</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Função</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Cadastrado em</TableHead>
                            <TableHead>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map((user) => (
                            <TableRow key={user.id} data-testid={`user-${user.id}`}>
                              <TableCell>
                                <div className="font-medium">{user.fullName}</div>
                              </TableCell>
                              <TableCell>{user.email}</TableCell>
                              <TableCell>{getRoleBadge(user.role)}</TableCell>
                              <TableCell>
                                <Badge variant="default">Ativo</Badge>
                              </TableCell>
                              <TableCell>-</TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={user.id === currentUser?.id}
                                    onClick={() => handleEditUser(user)}
                                    data-testid={`button-edit-user-${user.id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  
                                  <AlertDialog open={userToDelete?.id === user.id} onOpenChange={(open) => !open && setUserToDelete(null)}>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={user.id === currentUser?.id}
                                        onClick={() => handleDeleteUser(user)}
                                        className="text-red-600 hover:text-red-700"
                                        data-testid={`button-delete-user-${user.id}`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Tem certeza que deseja excluir o usuário "{user.fullName}"? 
                                          Esta ação não pode ser desfeita.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel data-testid="button-cancel-delete-user">
                                          Cancelar
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={confirmDeleteUser}
                                          className="bg-red-600 hover:bg-red-700"
                                          disabled={deleteUserMutation.isPending}
                                          data-testid="button-confirm-delete-user"
                                        >
                                          {deleteUserMutation.isPending ? "Excluindo..." : "Excluir"}
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Clinic Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Building2 className="h-5 w-5" />
                    <span>Dados da Clínica</span>
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Gerencie as informações da sua clínica
                  </p>
                </CardHeader>
                <CardContent>
                  {clinicLoading ? (
                    <div className="text-center py-8 text-gray-500">Carregando dados da clínica...</div>
                  ) : (
                    <form onSubmit={handleClinicSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="clinicName">Nome da Clínica *</Label>
                            <Input
                              id="clinicName"
                              value={clinicFormData.name}
                              onChange={(e) => setClinicFormData({ ...clinicFormData, name: e.target.value })}
                              placeholder="Nome da clínica"
                              required
                              data-testid="input-clinic-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="clinicEmail">Email da Clínica *</Label>
                            <Input
                              id="clinicEmail"
                              type="email"
                              value={clinicFormData.email}
                              onChange={(e) => setClinicFormData({ ...clinicFormData, email: e.target.value })}
                              placeholder="contato@clinica.com"
                              required
                              data-testid="input-clinic-email"
                            />
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="clinicPhone">Telefone</Label>
                            <Input
                              id="clinicPhone"
                              value={clinicFormData.phone}
                              onChange={(e) => setClinicFormData({ ...clinicFormData, phone: e.target.value })}
                              placeholder="+55 11 99999-9999"
                              data-testid="input-clinic-phone"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="clinicAddress">Endereço</Label>
                            <Textarea
                              id="clinicAddress"
                              value={clinicFormData.address}
                              onChange={(e) => setClinicFormData({ ...clinicFormData, address: e.target.value })}
                              placeholder="Endereço completo da clínica"
                              rows={3}
                              data-testid="input-clinic-address"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Logo Upload Section */}
                      <div className="space-y-4">
                        <div className="flex items-start space-x-6">
                          <div className="flex-1 space-y-4">
                            <div>
                              <Label>Logo da Clínica</Label>
                              <p className="text-sm text-gray-600 mt-1">
                                Faça upload do logo da sua clínica (PNG, JPG ou SVG)
                              </p>
                            </div>
                            
                            <div className="space-y-3">
                              <div className="flex items-center space-x-3">
                                <input
                                  type="file"
                                  id="logoUpload"
                                  accept="image/*"
                                  onChange={handleLogoUpload}
                                  className="hidden"
                                  data-testid="input-upload-logo"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => document.getElementById('logoUpload')?.click()}
                                  disabled={uploadLogoMutation.isPending}
                                  data-testid="button-upload-logo"
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  {uploadLogoMutation.isPending ? "Fazendo upload..." : "Selecionar Arquivo"}
                                </Button>
                              </div>
                              
                              <div>
                                <Label htmlFor="logoUrl">Ou informe URL da imagem</Label>
                                <Input
                                  id="logoUrl"
                                  value={clinicFormData.logoUrl}
                                  onChange={(e) => setClinicFormData({ ...clinicFormData, logoUrl: e.target.value })}
                                  placeholder="https://exemplo.com/logo.png"
                                  data-testid="input-clinic-logo-url"
                                />
                              </div>
                            </div>
                          </div>
                          
                          {clinicFormData.logoUrl && (
                            <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border">
                              <img
                                src={clinicFormData.logoUrl}
                                alt="Logo da clínica"
                                className="max-w-full max-h-full object-contain"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <Button 
                          type="submit" 
                          disabled={updateClinicMutation.isPending}
                          data-testid="button-save-clinic"
                        >
                          {updateClinicMutation.isPending ? "Salvando..." : "Salvar Dados da Clínica"}
                        </Button>
                      </div>
                    </form>
                  )}
                </CardContent>
              </Card>
              {/* WhatsApp Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <QrCode className="h-5 w-5" />
                    <span>WhatsApp</span>
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Configure a instância Evolution API desta clínica e conecte o WhatsApp
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Status banner */}
                  {wppStatusLoading ? (
                    <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-500">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Verificando status...
                    </div>
                  ) : wppStatus?.connected ? (
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-green-800">WhatsApp conectado</p>
                        {wppStatus.connectedPhone && (
                          <p className="text-xs text-green-700">
                            Número: +{wppStatus.connectedPhone}
                            {wppStatus.profileName ? ` · ${wppStatus.profileName}` : ""}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => refetchWppStatus()}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <WifiOff className="h-5 w-5 text-yellow-600 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-yellow-800">WhatsApp desconectado</p>
                        <p className="text-xs text-yellow-700">
                          {wppStatus?.status === "not_configured"
                            ? "Instância não configurada"
                            : `Status: ${wppStatus?.status || "desconhecido"}`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => refetchWppStatus()}
                      >
                        <RefreshCw className="h-3 w-3" />
                      </Button>
                    </div>
                  )}

                  {/* Config form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveWppConfigMutation.mutate(wppFormData);
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="wppInstance">Nome da Instância *</Label>
                      <Input
                        id="wppInstance"
                        value={wppFormData.evolutionInstanceName}
                        onChange={(e) => setWppFormData({ ...wppFormData, evolutionInstanceName: e.target.value })}
                        placeholder="minha-clinica"
                      />
                      <p className="text-xs text-gray-500">
                        Nome único da instância configurada na Evolution API
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="wppApiKey">API Key da Instância</Label>
                      <Input
                        id="wppApiKey"
                        type="password"
                        value={wppFormData.evolutionApiKey}
                        onChange={(e) => setWppFormData({ ...wppFormData, evolutionApiKey: e.target.value })}
                        placeholder="Deixe em branco para usar a chave global"
                      />
                      <p className="text-xs text-gray-500">
                        Se vazia, usa a chave global configurada no servidor
                      </p>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <Button type="submit" disabled={saveWppConfigMutation.isPending}>
                        {saveWppConfigMutation.isPending ? "Salvando..." : "Salvar Configuração"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={connectWppMutation.isPending || !wppFormData.evolutionInstanceName}
                        onClick={() => {
                          setQrCodeData(null);
                          setQrStatus(null);
                          connectWppMutation.mutate();
                        }}
                      >
                        {connectWppMutation.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Gerando QR...
                          </>
                        ) : (
                          <>
                            <QrCode className="h-4 w-4 mr-2" />
                            Conectar WhatsApp
                          </>
                        )}
                      </Button>
                    </div>
                  </form>

                  {/* QR Code display */}
                  {qrStatus === "scan" && qrCodeData && (
                    <div className="flex flex-col items-center gap-3 p-4 bg-gray-50 rounded-lg border">
                      <p className="text-sm font-medium text-gray-700">
                        Escaneie o QR code com o WhatsApp
                      </p>
                      <img
                        src={qrCodeData.startsWith("data:") ? qrCodeData : `data:image/png;base64,${qrCodeData}`}
                        alt="QR Code WhatsApp"
                        className="w-56 h-56 rounded-lg border"
                      />
                      <p className="text-xs text-gray-500 text-center">
                        Abra o WhatsApp → Dispositivos conectados → Conectar um dispositivo
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setQrCodeData(null);
                          setQrStatus(null);
                          refetchWppStatus();
                        }}
                      >
                        <RefreshCw className="h-3 w-3 mr-2" />
                        Verificar conexão
                      </Button>
                    </div>
                  )}
                  {qrStatus === "connected" && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg text-sm text-green-700 border border-green-200">
                      <CheckCircle2 className="h-4 w-4" />
                      WhatsApp conectado com sucesso!
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
