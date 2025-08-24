import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
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
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: BarChart3, roles: ["admin", "dentist", "secretary"] },
  { name: "Pacientes", href: "/patients", icon: Users, roles: ["admin", "dentist", "secretary"] },
  { name: "Agendamentos", href: "/appointments", icon: Calendar, roles: ["admin", "dentist", "secretary"] },
  { name: "Prontuários", href: "/medical-records", icon: FileText, roles: ["admin", "dentist"] },
  { name: "Anamnese", href: "/anamnesis", icon: ClipboardList, roles: ["admin", "secretary"] },
  { name: "Configurações", href: "/settings", icon: Settings, roles: ["admin"] },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const filteredNavigation = navigation.filter(item =>
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
          "fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-center h-16 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <Stethoscope className="h-4 w-4 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">DentiCare</span>
          </div>
        </div>

        {/* User info */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary font-medium text-sm">
                {user?.fullName?.charAt(0) || "U"}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{user?.fullName}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-4 px-4 space-y-2 flex-1">
          {filteredNavigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                  isActive
                    ? "bg-primary text-white"
                    : "text-gray-700 hover:bg-primary/5 hover:text-primary"
                )}
                data-testid={`nav-${item.name.toLowerCase()}`}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5",
                    isActive ? "text-white" : "text-gray-400 group-hover:text-primary"
                  )}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={logout}
            className="flex items-center space-x-3 w-full px-3 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            data-testid="button-logout"
          >
            <LogOut className="h-5 w-5" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </>
  );
}
