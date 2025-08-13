import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Stethoscope } from "lucide-react";

export default function Login() {
  const { login, registerClinic } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
    remember: false,
  });

  const [registerForm, setRegisterForm] = useState({
    clinicName: "",
    clinicEmail: "",
    adminName: "",
    adminEmail: "",
    password: "",
    confirmPassword: "",
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(loginForm.email, loginForm.password);
      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo ao DentiCare",
      });
    } catch (error) {
      toast({
        title: "Erro no login",
        description: "Email ou senha incorretos",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (registerForm.password !== registerForm.confirmPassword) {
      toast({
        title: "Erro no cadastro",
        description: "As senhas não coincidem",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await registerClinic({
        clinicName: registerForm.clinicName,
        clinicEmail: registerForm.clinicEmail,
        adminName: registerForm.adminName,
        adminEmail: registerForm.adminEmail,
        password: registerForm.password,
      });
      toast({
        title: "Clínica cadastrada com sucesso!",
        description: "Bem-vindo ao DentiCare",
      });
    } catch (error) {
      toast({
        title: "Erro no cadastro",
        description: "Verifique os dados e tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-blue-50 p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary rounded-xl flex items-center justify-center mb-4">
            <Stethoscope className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">DentiCare</h2>
          <p className="mt-2 text-sm text-gray-600">Sistema de Gestão Odontológica</p>
        </div>

        <Card className="shadow-lg border border-gray-100">
          <CardHeader>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" data-testid="tab-login">Entrar</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">Cadastrar</TabsTrigger>
              </TabsList>

              {/* Login Tab */}
              <TabsContent value="login" className="space-y-4">
                <CardTitle className="text-center">Entre na sua conta</CardTitle>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      placeholder="seu@email.com"
                      required
                      data-testid="input-email"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      placeholder="••••••••"
                      required
                      data-testid="input-password"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="remember"
                        checked={loginForm.remember}
                        onCheckedChange={(checked) => 
                          setLoginForm({ ...loginForm, remember: checked as boolean })
                        }
                        data-testid="checkbox-remember"
                      />
                      <Label htmlFor="remember" className="text-sm">Lembrar-me</Label>
                    </div>
                    <a href="#" className="text-sm font-medium text-primary hover:text-primary/80">
                      Esqueceu a senha?
                    </a>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-login"
                  >
                    {isLoading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              {/* Register Tab */}
              <TabsContent value="register" className="space-y-4">
                <CardTitle className="text-center">Cadastrar Nova Clínica</CardTitle>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="clinicName">Nome da Clínica</Label>
                      <Input
                        id="clinicName"
                        value={registerForm.clinicName}
                        onChange={(e) => setRegisterForm({ ...registerForm, clinicName: e.target.value })}
                        placeholder="Nome da sua clínica"
                        required
                        data-testid="input-clinic-name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="clinicEmail">Email da Clínica</Label>
                      <Input
                        id="clinicEmail"
                        type="email"
                        value={registerForm.clinicEmail}
                        onChange={(e) => setRegisterForm({ ...registerForm, clinicEmail: e.target.value })}
                        placeholder="contato@clinica.com"
                        required
                        data-testid="input-clinic-email"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="adminName">Nome do Administrador</Label>
                      <Input
                        id="adminName"
                        value={registerForm.adminName}
                        onChange={(e) => setRegisterForm({ ...registerForm, adminName: e.target.value })}
                        placeholder="Seu nome completo"
                        required
                        data-testid="input-admin-name"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="adminEmail">Email do Administrador</Label>
                      <Input
                        id="adminEmail"
                        type="email"
                        value={registerForm.adminEmail}
                        onChange={(e) => setRegisterForm({ ...registerForm, adminEmail: e.target.value })}
                        placeholder="seu@email.com"
                        required
                        data-testid="input-admin-email"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="registerPassword">Senha</Label>
                      <Input
                        id="registerPassword"
                        type="password"
                        value={registerForm.password}
                        onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                        placeholder="••••••••"
                        required
                        data-testid="input-register-password"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={registerForm.confirmPassword}
                        onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                        placeholder="••••••••"
                        required
                        data-testid="input-confirm-password"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-register"
                  >
                    {isLoading ? "Cadastrando..." : "Cadastrar Clínica"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
