import { useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import CalendarView from "@/components/calendar/calendar-view";

export default function Appointments() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />
      
      <div 
        className={`flex-1 w-full ${
          sidebarExpanded ? "main-content-expanded" : "main-content-collapsed"
        }`}
        data-sidebar-state={sidebarExpanded ? "expanded" : "collapsed"}
        style={{
          marginLeft: sidebarExpanded ? '256px' : '80px',
          transition: 'margin-left 0.3s ease-in-out'
        }}
      >
        <Header title="Agenda" onMenuClick={() => setSidebarOpen(true)} />
        
        <main className="p-4 lg:p-6 w-full max-w-none">
          <CalendarView className="w-full" />
        </main>
      </div>
    </div>
  );
}