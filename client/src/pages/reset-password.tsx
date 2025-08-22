import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { Stethoscope, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [token, setToken] = useState("");
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  const [formData, setFormData] = useState({
    newPassword: "",
    confirmPassword: "",
  });

  // Password validation rules
  const passwordValidation = {
    minLength: formData.newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(formData.newPassword),
    hasLowercase: /[a-z]/.test(formData.newPassword),
    hasNumber: /\d/.test(formData.newPassword),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(formData.newPassword),
  };

  const isPasswordValid = Object.values(passwordValidation).every(Boolean);
  const passwordsMatch = formData.newPassword === formData.confirmPassword && formData.confirmPassword.length > 0;

  useEffect(() => {
    // Get token from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('token');
    
    if (!resetToken) {
      toast({
        title: "Link inválido",
        description: "Token de redefinição não encontrado",
        variant: "destructive",
      });
      setLocation("/");
      return;
    }

    setToken(resetToken);
    validateToken(resetToken);
  }, []);

  const validateToken = async (resetToken: string) => {
    try {
      await apiRequest('POST', '/api/auth/validate-reset-token', { token: resetToken });
      setIsValidToken(true);
    } catch (error) {
      setIsValidToken(false);
      toast({
        title: "Link expirado",
        description: "Este link de redefinição é inválido ou expirou",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isPasswordValid) {
      toast({
        title: "Senha inválida",
        description: "Por favor, atenda a todos os critérios de segurança",
        variant: "destructive",
      });
      return;
    }

    if (!passwordsMatch) {
      toast({
        title: "Senhas não coincidem",
        description: "As senhas devem ser idênticas",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      await apiRequest('POST', '/api/auth/confirm-reset-password', {
        token,
        newPassword: formData.newPassword,
      });

      toast({
        title: "Senha redefinida!",
        description: "Sua senha foi alterada com sucesso",
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        setLocation("/");
      }, 2000);
    } catch (error) {
      toast({
        title: "Erro ao redefinir senha",
        description: "Tente novamente ou solicite um novo link",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-blue-50 p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-gray-600">Validando link...</p>
        </div>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-blue-50 p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Link Inválido</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              Este link de redefinição é inválido ou expirou.
            </p>
            <Button onClick={() => setLocation("/")} className="w-full">
              Voltar ao Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-blue-50 p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary rounded-xl flex items-center justify-center mb-4">
            <Stethoscope className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">DentiCare</h2>
          <p className="mt-2 text-sm text-gray-600">Redefinir Senha</p>
        </div>

        <Card className="shadow-lg border border-gray-100">
          <CardHeader>
            <CardTitle className="text-center">Nova Senha</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={formData.newPassword}
                    onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                    placeholder="Digite sua nova senha"
                    required
                    data-testid="input-new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Password validation indicators */}
                {formData.newPassword && (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="font-medium text-gray-700">Critérios de segurança:</p>
                    <div className="space-y-1">
                      <div className={`flex items-center gap-2 ${passwordValidation.minLength ? 'text-green-600' : 'text-red-600'}`}>
                        {passwordValidation.minLength ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        <span>Mínimo 8 caracteres</span>
                      </div>
                      <div className={`flex items-center gap-2 ${passwordValidation.hasUppercase ? 'text-green-600' : 'text-red-600'}`}>
                        {passwordValidation.hasUppercase ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        <span>Ao menos uma letra maiúscula</span>
                      </div>
                      <div className={`flex items-center gap-2 ${passwordValidation.hasLowercase ? 'text-green-600' : 'text-red-600'}`}>
                        {passwordValidation.hasLowercase ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        <span>Ao menos uma letra minúscula</span>
                      </div>
                      <div className={`flex items-center gap-2 ${passwordValidation.hasNumber ? 'text-green-600' : 'text-red-600'}`}>
                        {passwordValidation.hasNumber ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        <span>Ao menos um número</span>
                      </div>
                      <div className={`flex items-center gap-2 ${passwordValidation.hasSpecialChar ? 'text-green-600' : 'text-red-600'}`}>
                        {passwordValidation.hasSpecialChar ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        <span>Ao menos um caractere especial</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Confirme sua nova senha"
                    required
                    data-testid="input-confirm-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                {formData.confirmPassword && (
                  <div className={`flex items-center gap-2 text-sm ${passwordsMatch ? 'text-green-600' : 'text-red-600'}`}>
                    {passwordsMatch ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    <span>{passwordsMatch ? 'Senhas coincidem' : 'Senhas não coincidem'}</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !isPasswordValid || !passwordsMatch}
                data-testid="button-reset-password"
              >
                {isLoading ? "Redefinindo..." : "Redefinir Senha"}
              </Button>

              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setLocation("/")}
                  className="text-sm"
                >
                  Voltar ao Login
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}