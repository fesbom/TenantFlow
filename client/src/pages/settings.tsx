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
import { Settings, Plus, Edit, Trash2, Users, Shield, Building2, Upload } from "lucide-react";

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
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
