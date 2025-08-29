import { Menu, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBranding } from "@/contexts/branding-context";

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

export default function Header({ title, onMenuClick }: HeaderProps) {
  const { branding } = useBranding();
  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3 lg:px-6 sticky top-0 z-30">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
            data-testid="button-menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-semibold text-gray-900" data-testid="text-page-title">
            {title}
          </h1>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Temporarily hidden - notifications feature not implemented
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5" />
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              3
            </Badge>
          </Button>
          */}
          
          <div className="flex items-center space-x-3">
            {branding.logoUrl && (
              <img
                src={branding.logoUrl}
                alt={`Logo ${branding.clinicName}`}
                className="h-8 w-8 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className="text-sm text-gray-700 font-medium" data-testid="text-clinic-name">
              {branding.clinicName}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
