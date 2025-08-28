import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ResetPassword from "@/pages/reset-password";
import Dashboard from "@/pages/dashboard";
import Patients from "@/pages/patients";
import Appointments from "@/pages/appointments";
import MedicalRecords from "@/pages/medical-records";
import Anamnesis from "@/pages/anamnesis";
import Budgets from "@/pages/budgets";
import Settings from "@/pages/settings";
import ImportData from "@/pages/import-data";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const authContext = useAuth();
  const isAuthenticated = authContext?.isAuthenticated;
  
  if (!isAuthenticated) {
    return <Login />;
  }
  
  return <Component />;
}

function Router() {
  const authContext = useAuth();
  const isAuthenticated = authContext?.isAuthenticated;

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/reset-password" component={() => <ResetPassword />} />
      
      {/* Protected routes */}
      {!isAuthenticated ? (
        <Route component={() => <Login />} />
      ) : (
        <>
          <Route path="/" component={() => <Dashboard />} />
          <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} />} />
          <Route path="/patients" component={() => <ProtectedRoute component={Patients} />} />
          <Route path="/appointments" component={() => <ProtectedRoute component={Appointments} />} />
          <Route path="/medical-records" component={() => <ProtectedRoute component={MedicalRecords} />} />
          <Route path="/anamnesis" component={() => <ProtectedRoute component={Anamnesis} />} />
          <Route path="/budgets" component={() => <ProtectedRoute component={Budgets} />} />
          <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
          <Route path="/import-data" component={() => <ProtectedRoute component={ImportData} />} />
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
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
