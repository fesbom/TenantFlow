import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { FEATURES, type FeatureKey } from "@shared/features";
import { BrandingProvider } from "@/contexts/branding-context";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import Dashboard from "@/pages/dashboard";
import Patients from "@/pages/patients";
import Appointments from "@/pages/appointments";
import MedicalRecords from "@/pages/medical-records";
import Anamnesis from "@/pages/anamnesis";
import Budgets from "@/pages/budgets";
import Receivables from "@/pages/receivables";
import Settings from "@/pages/settings";
import ImportData from "@/pages/import-data";
import BatchUpload from "@/pages/batch-upload";
import Support from "@/pages/support";
import Availability from "@/pages/availability";
import Communications from "@/pages/communications";
import PrintSchedule from "@/pages/print-schedule";
import AdminSimulator from "@/pages/admin-simulator";
import { AdminAudit, AdminForbidden, AdminHome, ClinicDetail } from "@/pages/admin";

function AccessDenied() {
  const { can } = usePermissions();
  const target = FEATURES.find((feature) => can(feature.key));
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-xl font-semibold">Acesso bloqueado</h1>
      <p className="text-gray-600">Você não tem permissão para acessar esta funcionalidade. Fale com o administrador.</p>
      {target && <a className="text-primary underline" href={FEATURE_ROUTES[target.key]}>Ir para {target.label}</a>}
    </div>
  );
}

const FEATURE_ROUTES: Record<FeatureKey, string> = {
  dashboard: "/dashboard",
  patients: "/patients",
  appointments: "/appointments",
  availability: "/availability",
  "medical-records": "/medical-records",
  anamnesis: "/anamnesis",
  receivables: "/receivables",
  support: "/support",
  communications: "/communications",
  "batch-upload": "/batch-upload",
  "import-data": "/import-data",
};

function ProtectedRoute({ component: Component, feature }: { component: React.ComponentType; feature?: FeatureKey }) {
  const authContext = useAuth();
  const { can } = usePermissions();
  const isAuthenticated = authContext?.isAuthenticated;
  const isSuperadmin = authContext?.user?.role === "superadmin";
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isSuperadmin) {
      navigate("/admin");
    }
  }, [isSuperadmin, navigate]);

  if (!isAuthenticated) {
    return <Login />;
  }

  // Superadmin has no clinicId, so clinic-scoped pages are not applicable; redirect above handles navigation
  if (isSuperadmin) {
    return null;
  }

  if (feature && !can(feature)) {
    return <AccessDenied />;
  }

  return <Component />;
}

function Router() {
  const authContext = useAuth();
  const isAuthenticated = authContext?.isAuthenticated;
  const isSuperadmin = authContext?.user?.role === "superadmin";

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/reset-password" component={() => <ResetPassword />} />
      
      {/* Protected routes */}
      {!isAuthenticated ? (
        <Route component={() => <Login />} />
      ) : (
        <>
          <Route path="/admin" component={() => isSuperadmin ? <AdminHome /> : <AdminForbidden />} />
          <Route path="/admin/audit" component={() => isSuperadmin ? <AdminAudit /> : <AdminForbidden />} />
          <Route path="/admin/clinics/:id/simulator" component={() => isSuperadmin ? <AdminSimulator /> : <AdminForbidden />} />
          <Route path="/admin/clinics/:id" component={() => isSuperadmin ? <ClinicDetail /> : <AdminForbidden />} />
          <Route path="/" component={() => isSuperadmin ? <AdminHome /> : <ProtectedRoute component={Dashboard} feature="dashboard" />} />
          <Route path="/dashboard" component={() => isSuperadmin ? <AdminHome /> : <ProtectedRoute component={Dashboard} feature="dashboard" />} />
          <Route path="/patients" component={() => <ProtectedRoute component={Patients} feature="patients" />} />
          <Route path="/appointments" component={() => <ProtectedRoute component={Appointments} feature="appointments" />} />
          <Route path="/medical-records" component={() => <ProtectedRoute component={MedicalRecords} feature="medical-records" />} />
          <Route path="/anamnesis" component={() => <ProtectedRoute component={Anamnesis} feature="anamnesis" />} />
          <Route path="/budgets" component={() => <ProtectedRoute component={Budgets} />} />
          <Route path="/receivables" component={() => <ProtectedRoute component={Receivables} feature="receivables" />} />
          <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
          <Route path="/import-data" component={() => <ProtectedRoute component={ImportData} feature="import-data" />} />
          <Route path="/batch-upload" component={() => <ProtectedRoute component={BatchUpload} feature="batch-upload" />} />
          <Route path="/support" component={() => <ProtectedRoute component={Support} feature="support" />} />
          <Route path="/availability" component={() => <ProtectedRoute component={Availability} feature="availability" />} />
          <Route path="/communications" component={() => <ProtectedRoute component={Communications} feature="communications" />} />
          <Route path="/print-schedule" component={() => <ProtectedRoute component={PrintSchedule} />} />
          <Route component={NotFound} />
        </>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrandingProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </BrandingProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
