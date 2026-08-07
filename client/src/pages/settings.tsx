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
import { Settings, Plus, Edit, Pencil, Trash2, Users, Shield, Building2, Upload, Wifi, WifiOff, QrCode, RefreshCw, CheckCircle2, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_INVOICE_FIELDS, DEFAULT_INVOICE_FIELDS } from "@/components/modals/invoice-copy-modal";

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

  // Invoice fields state
  const [invoiceFields, setInvoiceFields] = useState<string[]>(DEFAULT_INVOICE_FIELDS);

  // WhatsApp multi-instance state
  type WppInstance = { id: string; label: string; instanceName: string; apiKey: string | null; connectedPhone: string | null; dentistIds: string[]; createdAt: string };
  const [showInstanceDialog, setShowInstanceDialog] = useState(false);
  const [editingInstance, setEditingInstance] = useState<WppInstance | null>(null);
  const [instanceForm, setInstanceForm] = useState({ label: "", instanceName: "", apiKey: "", dentistIds: [] as string[] });
  const [qrState, setQrState] = useState<{ instanceId: string; qrCode: string | null; status: string } | null>(null);
  const [instanceToDelete, setInstanceToDelete] = useState<WppInstance | null>(null);
  const qrPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // WhatsApp instances query
  const { data: wppInstances = [], isLoading: instancesLoading, refetch: refetchInstances } = useQuery<(any & { dentistIds: string[] })[]>({
    queryKey: ["/api/whatsapp/instances"],
    enabled: currentUser?.role === "admin",
    refetchInterval: 20000,
  });

  // Create instance mutation
  const createInstanceMutation = useMutation({
    mutationFn: async (data: typeof instanceForm) => {
      const res = await apiRequest("POST", "/api/whatsapp/instances", data);
      if (!res.ok) throw new Error("Erro ao criar instância");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/instances"] });
      toast({ title: "Instância criada", description: "Número de WhatsApp cadastrado com sucesso" });
      setShowInstanceDialog(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Update instance mutation
  const updateInstanceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof instanceForm }) => {
      const res = await apiRequest("PATCH", `/api/whatsapp/instances/${id}`, data);
      if (!res.ok) throw new Error("Erro ao atualizar instância");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/instances"] });
      toast({ title: "Instância atualizada" });
      setShowInstanceDialog(false);
      setEditingInstance(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Delete instance mutation
  const deleteInstanceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/whatsapp/instances/${id}`);
      if (!res.ok) throw new Error("Erro ao excluir instância");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/instances"] });
      toast({ title: "Instância excluída" });
      setInstanceToDelete(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  // Start polling the status endpoint directly (bypasses React effect scheduling)
  function startQrPolling(instanceId: string) {
    if (qrPollingRef.current) clearInterval(qrPollingRef.current);
    let attempts = 0;
    const maxAttempts = 30; // 30 × 4s = 120s
    console.log("[QR Poll] iniciando polling para", instanceId);
    qrPollingRef.current = setInterval(async () => {
      attempts++;
      try {
        const token = localStorage.getItem("dental_token");
        const res = await fetch(`/api/whatsapp/instances/${instanceId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        const data = await res.json();
        console.log(`[QR Poll] tentativa ${attempts}:`, data);
        if (data.connected) {
          clearInterval(qrPollingRef.current!);
          qrPollingRef.current = null;
          setQrState(null);
          refetchInstances();
          toast({
            title: "WhatsApp conectado!",
            description: data.phone ? `Número: ${data.phone}` : "Conectado com sucesso",
          });
          return;
        }
      } catch (e) {
        console.warn("[QR Poll] erro na tentativa", attempts, e);
      }
      if (attempts >= maxAttempts) {
        clearInterval(qrPollingRef.current!);
        qrPollingRef.current = null;
        console.warn("[QR Poll] timeout — encerrando polling");
      }
    }, 4000);
  }

  // Connect (QR code) mutation
  const connectInstanceMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const res = await apiRequest("POST", `/api/whatsapp/instances/${instanceId}/connect`, {});
      if (!res.ok) throw new Error("Erro ao gerar QR code");
      return res.json();
    },
    onSuccess: (data, instanceId) => {
      if (data.qrCode) {
        setQrState({ instanceId, qrCode: data.qrCode, status: "scan" });
        startQrPolling(instanceId);
      } else if (data.status === "connected") {
        setQrState({ instanceId, qrCode: null, status: "connected" });
        refetchInstances();
      } else {
        setQrState({ instanceId, qrCode: null, status: data.status || "pending" });
      }
    },
    onError: (e: any) => toast({ title: "Erro ao conectar", description: e.message, variant: "destructive" }),
  });

  const openNewInstance = () => {
    setEditingInstance(null);
    setInstanceForm({ label: "", instanceName: "", apiKey: "", dentistIds: [] });
    setQrState(null);
    setShowInstanceDialog(true);
  };

  const openEditInstance = (inst: any) => {
    setEditingInstance(inst);
    setInstanceForm({ label: inst.label, instanceName: inst.instanceName, apiKey: "", dentistIds: inst.dentistIds });
    setQrState(null);
    setShowInstanceDialog(true);
  };

  const submitInstanceForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingInstance) {
      updateInstanceMutation.mutate({ id: editingInstance.id, data: instanceForm });
    } else {
      createInstanceMutation.mutate(instanceForm);
    }
  };

  const toggleDentist = (id: string) => {
    setInstanceForm((f) => ({
      ...f,
      dentistIds: f.dentistIds.includes(id) ? f.dentistIds.filter((d) => d !== id) : [...f.dentistIds, id],
    }));
  };

  // Invoice fields query
  const { data: invoiceFieldsData } = useQuery<{ fields: string[] }>({
    queryKey: ["/api/clinic/invoice-fields"],
    enabled: currentUser?.role === "admin",
    queryFn: async () => {
      const res = await fetch("/api/clinic/invoice-fields", {
        headers: { Authorization: `Bearer ${localStorage.getItem("dental_token")}` },
      });
      if (!res.ok) return { fields: DEFAULT_INVOICE_FIELDS };
      return res.json();
    },
  });

  // Sync invoice fields from server
  useEffect(() => {
    if (invoiceFieldsData?.fields) setInvoiceFields(invoiceFieldsData.fields);
  }, [invoiceFieldsData]);

  // Save invoice fields mutation
  const saveInvoiceFieldsMutation = useMutation({
    mutationFn: async (fields: string[]) => {
      const res = await apiRequest("PUT", "/api/clinic/invoice-fields", { fields });
      if (!res.ok) throw new Error("Erro ao salvar campos");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clinic/invoice-fields"] });
      toast({ title: "Configuração salva", description: "Campos de nota fiscal atualizados com sucesso" });
    },
    onError: () => toast({ title: "Erro", description: "Não foi possível salvar os campos", variant: "destructive" }),
  });

  const toggleInvoiceField = (key: string) => {
    setInvoiceFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

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
              {/* ── WhatsApp Multi-Instance ── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <QrCode className="h-5 w-5" />
                        <span>WhatsApp — Números</span>
                      </CardTitle>
                      <p className="text-sm text-gray-600 mt-1">
                        Gerencie múltiplos números de WhatsApp e vincule-os a dentistas
                      </p>
                    </div>
                    <Button onClick={openNewInstance}>
                      <Plus className="h-4 w-4 mr-2" />
                      Novo Número
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {instancesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Carregando instâncias...
                    </div>
                  ) : wppInstances.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <QrCode className="h-10 w-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">Nenhum número configurado</p>
                      <p className="text-xs mt-1">Clique em "Novo Número" para adicionar o primeiro</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {wppInstances.map((inst: any) => {
                        const linkedDentists = (users as User[]).filter(
                          (u) => u.role === "dentist" && inst.dentistIds?.includes(u.id),
                        );
                        const isConnected = !!inst.connectedPhone;
                        return (
                          <div key={inst.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{inst.label}</span>
                                  <Badge variant={isConnected ? "default" : "secondary"} className="text-xs">
                                    {isConnected ? `✓ ${inst.connectedPhone}` : "Desconectado"}
                                  </Badge>
                                </div>
                                <p className="text-xs text-gray-500 mt-1 font-mono">{inst.instanceName}</p>
                                {linkedDentists.length > 0 && (
                                  <p className="text-xs text-gray-600 mt-1">
                                    Dentista{linkedDentists.length > 1 ? "s" : ""}: {linkedDentists.map((d) => d.fullName).join(", ")}
                                  </p>
                                )}
                                {linkedDentists.length === 0 && (
                                  <p className="text-xs text-gray-400 mt-1">Nenhum dentista vinculado (atendimento geral)</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEditInstance(inst)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setInstanceToDelete(inst)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            {/* QR / Connect area for this instance */}
                            {qrState?.instanceId === inst.id ? (
                              qrState.status === "scan" && qrState.qrCode ? (
                                <div className="flex flex-col items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                                  <p className="text-sm font-medium text-gray-700">Escaneie o QR code</p>
                                  <img
                                    src={qrState.qrCode.startsWith("data:") ? qrState.qrCode : `data:image/png;base64,${qrState.qrCode}`}
                                    alt="QR Code"
                                    className="w-48 h-48 rounded-lg border"
                                  />
                                  <p className="text-xs text-gray-500 text-center">
                                    WhatsApp → Dispositivos conectados → Conectar um dispositivo
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => { setQrState(null); refetchInstances(); }}
                                  >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Verificar conexão
                                  </Button>
                                </div>
                              ) : qrState.status === "connected" ? (
                                <div className="flex items-center gap-2 p-2 bg-green-50 rounded text-xs text-green-700 border border-green-200">
                                  <CheckCircle2 className="h-4 w-4" />
                                  Conectado com sucesso!
                                </div>
                              ) : (
                                <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
                                  Status: {qrState.status}
                                </div>
                              )
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={connectInstanceMutation.isPending}
                                onClick={() => connectInstanceMutation.mutate(inst.id)}
                              >
                                {connectInstanceMutation.isPending && connectInstanceMutation.variables === inst.id ? (
                                  <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Gerando QR...</>
                                ) : (
                                  <><QrCode className="h-3 w-3 mr-1" />{isConnected ? "Reconectar" : "Conectar WhatsApp"}</>
                                )}
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Dialog: Add / Edit Instance */}
              <Dialog open={showInstanceDialog} onOpenChange={(open) => { if (!open) { setShowInstanceDialog(false); setEditingInstance(null); } }}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingInstance ? "Editar Número de WhatsApp" : "Novo Número de WhatsApp"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={submitInstanceForm} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Identificação *</Label>
                      <Input
                        value={instanceForm.label}
                        onChange={(e) => setInstanceForm({ ...instanceForm, label: e.target.value })}
                        placeholder="Ex.: Consultório Principal, Dr. João"
                        required
                      />
                      <p className="text-xs text-gray-500">Nome amigável para identificar este número</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Nome da Instância (Evolution API) *</Label>
                      <Input
                        value={instanceForm.instanceName}
                        onChange={(e) => setInstanceForm({ ...instanceForm, instanceName: e.target.value })}
                        placeholder="minha-clinica-01"
                        required
                      />
                      <p className="text-xs text-gray-500">Nome exato da instância configurada na Evolution API</p>
                    </div>
                    <div className="space-y-2">
                      <Label>API Key (opcional)</Label>
                      <Input
                        type="password"
                        value={instanceForm.apiKey}
                        onChange={(e) => setInstanceForm({ ...instanceForm, apiKey: e.target.value })}
                        placeholder="Deixe em branco para usar a chave global"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Dentistas vinculados</Label>
                      <p className="text-xs text-gray-500">
                        Sem seleção = atendimento geral. 1 dentista = atendimento exclusivo. 2+ = atendimento compartilhado.
                      </p>
                      <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                        {(users as User[]).filter((u) => u.role === "dentist").length === 0 ? (
                          <p className="text-xs text-gray-400">Nenhum dentista cadastrado</p>
                        ) : (
                          (users as User[])
                            .filter((u) => u.role === "dentist")
                            .map((d) => (
                              <label key={d.id} className="flex items-center gap-2 cursor-pointer text-sm">
                                <input
                                  type="checkbox"
                                  checked={instanceForm.dentistIds.includes(d.id)}
                                  onChange={() => toggleDentist(d.id)}
                                  className="accent-primary"
                                />
                                {d.fullName}
                              </label>
                            ))
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="outline" onClick={() => setShowInstanceDialog(false)}>
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={createInstanceMutation.isPending || updateInstanceMutation.isPending}
                      >
                        {(createInstanceMutation.isPending || updateInstanceMutation.isPending)
                          ? "Salvando..."
                          : editingInstance
                          ? "Salvar Alterações"
                          : "Criar Número"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>

              {/* Confirm delete instance */}
              <AlertDialog open={!!instanceToDelete} onOpenChange={(open) => { if (!open) setInstanceToDelete(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir número de WhatsApp?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A instância <strong>{instanceToDelete?.label}</strong> ({instanceToDelete?.instanceName}) será removida permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => instanceToDelete && deleteInstanceMutation.mutate(instanceToDelete.id)}
                    >
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* ── Nota Fiscal — Campos para Cópia Rápida ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <FileText className="h-5 w-5" />
                    <span>Nota Fiscal — Campos para Cópia Rápida</span>
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Selecione quais campos do paciente aparecerão na tela de cópia ágil (ícone <FileText className="inline h-3.5 w-3.5" /> na lista de pacientes)
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-5">
                    {["Identificação", "Contato", "Endereço", "Responsável"].map((group) => {
                      const groupFields = ALL_INVOICE_FIELDS.filter((f) => f.group === group);
                      return (
                        <div key={group}>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{group}</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {groupFields.map((field) => (
                              <label
                                key={field.key}
                                className="flex items-center gap-2.5 cursor-pointer group rounded-lg border px-3 py-2 hover:bg-gray-50 transition-colors"
                              >
                                <Checkbox
                                  checked={invoiceFields.includes(field.key)}
                                  onCheckedChange={() => toggleInvoiceField(field.key)}
                                  id={`inv-${field.key}`}
                                />
                                <span className="text-sm text-gray-700 select-none">{field.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-4 mt-4 border-t flex items-center gap-3">
                    <Button
                      onClick={() => saveInvoiceFieldsMutation.mutate(invoiceFields)}
                      disabled={saveInvoiceFieldsMutation.isPending}
                    >
                      {saveInvoiceFieldsMutation.isPending ? "Salvando..." : "Salvar Configuração"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setInvoiceFields(DEFAULT_INVOICE_FIELDS)}
                      className="text-gray-500"
                    >
                      Restaurar padrão
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
