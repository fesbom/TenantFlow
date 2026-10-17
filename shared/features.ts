export type FeatureKey =
  | "dashboard"
  | "patients"
  | "appointments"
  | "availability"
  | "medical-records"
  | "anamnesis"
  | "receivables"
  | "support"
  | "communications"
  | "batch-upload"
  | "import-data"
  | "settings";

export type FeatureOverride = "allow" | "deny";
export type FeatureAccess = Partial<Record<FeatureKey, FeatureOverride>>;

export const FEATURES: ReadonlyArray<{ key: FeatureKey; label: string; roles: readonly string[] }> = [
  { key: "dashboard", label: "Dashboard", roles: ["admin", "dentist", "secretary"] },
  { key: "patients", label: "Pacientes", roles: ["admin", "dentist", "secretary"] },
  { key: "appointments", label: "Agendamentos", roles: ["admin", "dentist", "secretary"] },
  { key: "availability", label: "Disponibilidade", roles: ["admin", "dentist"] },
  { key: "medical-records", label: "Prontuários", roles: ["admin", "dentist"] },
  { key: "anamnesis", label: "Anamnese", roles: ["admin", "secretary"] },
  { key: "receivables", label: "Contas a Receber", roles: ["admin", "dentist", "secretary"] },
  { key: "support", label: "Atendimento", roles: ["admin", "secretary"] },
  { key: "communications", label: "Comunicação Ativa", roles: ["admin", "dentist", "secretary"] },
  { key: "batch-upload", label: "Upload Fotos", roles: ["admin", "secretary"] },
  { key: "import-data", label: "Importar Dados", roles: ["admin"] },
  { key: "settings", label: "Configurações", roles: ["admin"] },
];

const FEATURE_KEYS = new Set<string>(FEATURES.map((feature) => feature.key));

// Prefixos de API de cada funcionalidade. Rotas compartilhadas entre telas (ex.: /api/patients) não entram aqui.
export const FEATURE_API_PREFIXES: Partial<Record<FeatureKey, string[]>> = {
  dashboard: ["/api/dashboard"],
  availability: ["/api/availability"],
  "medical-records": ["/api/medical-records"],
  anamnesis: ["/api/anamnesis"],
  receivables: ["/api/receivables"],
  support: ["/api/conversations", "/api/whatsapp/conversations"],
  communications: ["/api/communications"],
  "import-data": ["/api/import-csv"],
  settings: ["/api/users", "/api/clinic", "/api/whatsapp/instances", "/api/whatsapp/connect", "/api/whatsapp/simulation"],
};

// Funcionalidades cujo bloqueio é imposto também na API (as demais têm endpoints usados por outras telas).
export const API_DENY_ENFORCED: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "dashboard", "anamnesis", "receivables", "support", "communications", "import-data", "medical-records",
]);

export function sanitizeFeatureAccess(value: unknown): FeatureAccess {
  const result: FeatureAccess = {};
  if (!value || typeof value !== "object") return result;
  for (const [key, override] of Object.entries(value as Record<string, unknown>)) {
    if (FEATURE_KEYS.has(key) && (override === "allow" || override === "deny")) {
      result[key as FeatureKey] = override;
    }
  }
  return result;
}

export function featureForPath(url: string | undefined): FeatureKey | undefined {
  if (!url) return undefined;
  const path = url.split("?")[0];
  for (const [feature, prefixes] of Object.entries(FEATURE_API_PREFIXES)) {
    if (prefixes!.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return feature as FeatureKey;
  }
  return undefined;
}

export function canAccessFeature(role: string | undefined, access: FeatureAccess | undefined, feature: FeatureKey): boolean {
  const override = access?.[feature];
  if (override === "deny") return false;
  if (override === "allow") return true;
  return FEATURES.find((item) => item.key === feature)?.roles.includes(role ?? "") ?? false;
}
