import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { canAccessFeature, sanitizeFeatureAccess, type FeatureAccess, type FeatureKey } from "@shared/features";

// Permissões vêm do servidor para refletir alterações feitas pelo admin sem novo login.
export function usePermissions() {
  const { user, isAuthenticated } = useAuth();
  const { data } = useQuery<{ role: string; featureAccess: FeatureAccess }>({
    queryKey: ["/api/auth/permissions"],
    enabled: isAuthenticated && !!user && user.role !== "superadmin",
    refetchInterval: 60_000,
    retry: false,
  });
  const access = data?.featureAccess ?? sanitizeFeatureAccess((user as { featureAccess?: unknown } | null)?.featureAccess);
  return {
    can: (feature: FeatureKey) => canAccessFeature(data?.role ?? user?.role, access, feature),
  };
}
