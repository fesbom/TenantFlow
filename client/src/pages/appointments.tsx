import { useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import CalendarView from "@/components/calendar/calendar-view";

export default function Appointments() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="lg:pl-64">
        <Header title="Agenda" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6">
          <CalendarView />
        </main>
      </div>
    </div>
  );
}