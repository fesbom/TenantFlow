import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Users,
  Calendar,
  FileText,
  ClipboardList,
  DollarSign,
  Settings,
  LogOut,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  Upload,
  Images,
  MessageSquare,
  Clock,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3, roles: ["admin", "dentist", "secretary"] },
  { name: "Pacientes", href: "/patients", icon: Users, roles: ["admin", "dentist", "secretary"] },
  { name: "Agendamentos", href: "/appointments", icon: Calendar, roles: ["admin", "dentist", "secretary"] },
  { name: "Disponibilidade", href: "/availability", icon: Clock, roles: ["admin", "dentist"] },
  { name: "Prontuários", href: "/medical-records", icon: FileText, roles: ["admin", "dentist"] },
  { name: "Anamnese", href: "/anamnesis", icon: ClipboardList, roles: ["admin", "secretary"] },
  { name: "Atendimento", href: "/support", icon: MessageSquare, roles: ["admin", "secretary"], badge: true },
  { name: "Importar Dados", href: "/import-data", icon: Upload, roles: ["admin"] },
  { name: "Upload Fotos", href: "/batch-upload", icon: Images, roles: ["admin", "secretary"] },
  { name: "Configurações", href: "/settings", icon: Settings, roles: ["admin"] },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}

export default function Sidebar({ isOpen, onClose, isExpanded = true, onToggleExpanded }: SidebarProps) {
  const [location] = useLocation();
  const authContext = useAuth();
  const user = authContext?.user;
  const logout = authContext?.logout;

  // Polling de conversas para o badge de não lidas (10s).
  // TanStack Query deduplica com a mesma query do support.tsx — sem requisição dupla.
  const { data: conversations = [] } = useQuery<any[]>({
    queryKey: ["/api/conversations"],
    refetchInterval: 10_000,
    enabled: !!user,
  });

  // "Não lida" = conversa onde o paciente enviou a última mensagem e ainda não foi encerrada
  const unreadCount = conversations.filter(
    (c) => c.lastMessageSender === "patient" && c.status !== "closed"
  ).length;

  const filteredNavigation = navigation.filter((item) =>
    item.roles.includes(user?.role || "")
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden bg-black bg-opacity-50"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "sidebar bg-white shadow-lg border-r border-gray-200",
          "fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isExpanded ? "sidebar-expanded" : ""
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 border-b border-gray-200 px-4">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <Stethoscope className="h-4 w-4 text-white" />
            </div>
            {isExpanded && (
              <span className="text-xl font-bold text-gray-900 transition-opacity duration-300">
                DentiCare
              </span>
            )}
          </div>

          {onToggleExpanded && (
            <button
              onClick={onToggleExpanded}
              className="hidden lg:flex p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              title={isExpanded ? "Recolher menu" : "Expandir menu"}
            >
              {isExpanded ? (
                <ChevronLeft className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-500" />
              )}
            </button>
          )}
        </div>

        {/* User info */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-primary font-medium text-sm">
                {user?.fullName?.charAt(0) || "U"}
              </span>
            </div>
            {isExpanded && (
              <div className="transition-opacity duration-300 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.fullName}</p>
                <p className="text-xs text-gray-500 capitalize truncate">{user?.role}</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-4 space-y-2 flex-1">
          {filteredNavigation.map((item) => {
            const isActive = location === item.href;
            const showBadge = item.badge && unreadCount > 0;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center rounded-lg text-sm font-medium transition-colors group relative",
                  isExpanded ? "space-x-3 px-3 py-2" : "justify-center px-2 py-3",
                  isActive
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-primary/5 hover:text-primary"
                )}
                data-testid={`nav-${item.name.toLowerCase()}`}
                title={!isExpanded ? item.name : undefined}
              >
                {/* Ícone com badge posicionado quando menu recolhido */}
                <div className="relative flex-shrink-0">
                  <item.icon
                    className={cn(
                      "h-5 w-5",
                      isActive ? "text-white" : "text-gray-400 group-hover:text-primary"
                    )}
                  />
                  {showBadge && !isExpanded && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </div>

                {isExpanded && (
                  <>
                    <span className="transition-opacity duration-300 truncate flex-1">
                      {item.name}
                    </span>
                    {showBadge && (
                      <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white leading-none">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={logout}
            className={cn(
              "flex items-center w-full text-sm text-gray-600 hover:text-gray-900 transition-colors",
              isExpanded ? "space-x-3 px-3 py-2" : "justify-center px-2 py-3"
            )}
            data-testid="button-logout"
            title={!isExpanded ? "Sair" : undefined}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {isExpanded && (
              <span className="transition-opacity duration-300">Sair</span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
