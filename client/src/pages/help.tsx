import { useState } from "react";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";

export default function Help() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  return (
    <div className="app-container bg-slate-50">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isExpanded={sidebarExpanded}
        onToggleExpanded={() => setSidebarExpanded(!sidebarExpanded)}
      />
      <div className="main-content">
        <Header title="Ajuda do Sistema" onMenuClick={() => setSidebarOpen(true)} />
        <main>
          <iframe
            title="Apresentação e guia interativo do DentalCare"
            src="/dentalcare-help.html"
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
            className="h-[calc(100dvh-3.5rem)] min-h-[600px] w-full border-0 bg-slate-50"
          />
        </main>
      </div>
    </div>
  );
}
