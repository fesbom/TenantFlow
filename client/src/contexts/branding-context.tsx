import { createContext, useContext, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

interface BrandingData {
  clinicName: string;
  logoUrl: string | null;
}

interface BrandingContextType {
  branding: BrandingData;
  isLoading: boolean;
  refreshBranding: () => void;
}

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState<BrandingData>({
    clinicName: "DentiCare",
    logoUrl: null,
  });

  // Fetch clinic data for branding
  const { data: clinic, isLoading, refetch } = useQuery({
    queryKey: ["/api/clinic"],
    enabled: !!user?.clinicId,
  });

  useEffect(() => {
    if (clinic) {
      setBranding({
        clinicName: clinic.name || "DentiCare",
        logoUrl: clinic.logoUrl || null,
      });
    }
  }, [clinic]);

  const refreshBranding = () => {
    refetch();
  };

  return (
    <BrandingContext.Provider
      value={{
        branding,
        isLoading,
        refreshBranding,
      }}
    >
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
}