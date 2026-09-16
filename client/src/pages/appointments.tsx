import { useState } from "react";
import { useLocation } from "wouter";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import CalendarView from "@/components/calendar/calendar-view";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export default function Appointments() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [, navigate] = useLocation();

  return (
    <div className="app-container bg-slate-50">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />
      
      <div className="main-content">
        <Header
          title="Agenda"
          onMenuClick={() => setSidebarOpen(true)}
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate("/print-schedule")} className="gap-2">
              <Printer className="h-4 w-4" />
              Imprimir Agenda
            </Button>
          }
        />
        
        <main className="flex min-h-0 flex-grow flex-col p-4 lg:p-6">
          <CalendarView className="h-full w-full" />
        </main>
      </div>
    </div>
  );
}