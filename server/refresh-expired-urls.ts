import { Storage } from "@google-cloud/storage";
import { db } from "./db";
// IMPORTANTE: Certifique-se que medicalRecords está sendo importado corretamente
import { patients, clinics, medicalRecords } from "@shared/schema"; 
import { eq } from "drizzle-orm";

console.log(`[DEBUG] Script iniciado. DATABASE_URL lida: ${process.env.DATABASE_URL}`);

// --- 1. Configuração e Validação de Credenciais ---

let credentialsJson;
if (!process.env.GOOGLE_CREDENTIALS) {
  console.error(
    "FATAL: Secret 'GOOGLE_CREDENTIALS' not found. " +
    "Please create the Secret with the Google Cloud Service Account JSON."
  );
  process.exit(1);
}

try {
  credentialsJson = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (e) {
  console.error(
    "FATAL: Error parsing Secret 'GOOGLE_CREDENTIALS'. " +
    "Verify that you copied the complete JSON correctly."
  );
  process.exit(1);
}

const objectStorageClient = new Storage({
  credentials: credentialsJson,
  projectId: credentialsJson.project_id,
});

const bucketName = process.env.PRIVATE_OBJECT_DIR || "";
if (!bucketName) {
  console.error(
    "FATAL: PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
    "tool and set PRIVATE_OBJECT_DIR env var to the bucket name."
  );
  process.exit(1);
}

// --- 2. Função Auxiliar para Gerar Nova URL ---

async function refreshSignedUrl(oldUrl: string, id: string, type: string): Promise<string | null> {
  try {
    // Se não for uma URL do Google Storage, ignora
    if (!oldUrl || !oldUrl.includes("storage.googleapis.com")) {
      return null;
    }

    const urlObj = new URL(oldUrl);
    const pathname = urlObj.pathname; 

    const pathParts = pathname.split('/').filter(p => p.length > 0);

    if (pathParts.length < 2) {
      // URL mal formada ou local
      return null;
    }

    // Remove o nome do bucket (primeiro item) para pegar o caminho do objeto
    const objectPath = pathParts.slice(1).join('/'); 

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectPath);

    const [exists] = await file.exists();
    if (!exists) {
      console.error(`[ERRO] Arquivo físico não encontrado para ${type} ${id}: ${objectPath}`);
      return null;
    }

    // Gera nova URL com 100 anos de validade
    const maxExpiration = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;

    const [newSignedUrl] = await file.getSignedUrl({
      version: 'v2', // <--- MUDANÇA CRÍTICA: V2 permite expiração longa
      action: 'read',
      expires: maxExpiration,
    });

    return newSignedUrl;

  } catch (error) {
    console.error(`[ERRO FATAL] Falha ao processar URL de ${type} ${id}:`, error);
    return null;
  }
}

// --- 3. Função Principal ---

async function main() {
  console.log("🚀 Iniciando atualização de URLs expiradas...");

  let updatedCount = 0;
  let errorCount = 0;

  // === PARTE A: PACIENTES ===
  console.log("\n--- Processando Pacientes ---");
  // Removemos o .where(isNotNull) para evitar erros de SQL e filtramos no loop
  const allPatients = await db.select().from(patients);

  for (const patient of allPatients) {
    if (!patient.photoUrl) continue;

    const newUrl = await refreshSignedUrl(patient.photoUrl, String(patient.id), "Paciente");

    if (newUrl) {
      await db.update(patients)
        .set({ photoUrl: newUrl })
        .where(eq(patients.id, patient.id));
      console.log(`[OK] Paciente ${patient.id} atualizado.`);
      updatedCount++;
    } else {
      errorCount++;
    }
  }

  // === PARTE B: CLÍNICAS (LOGOS) ===
  console.log("\n--- Processando Clínicas ---");
  const allClinics = await db.select().from(clinics);

  for (const clinic of allClinics) {
    if (!clinic.logoUrl) continue;

    const newUrl = await refreshSignedUrl(clinic.logoUrl, String(clinic.id), "Clínica");

    if (newUrl) {
      await db.update(clinics)
        .set({ logoUrl: newUrl })
        .where(eq(clinics.id, clinic.id));
      console.log(`[OK] Clínica ${clinic.id} atualizada.`);
      updatedCount++;
    } else {
      errorCount++;
    }
  }

  // === PARTE C: MOVIMENTAÇÕES (Medical Records) ===
  console.log("\n--- Processando Movimentações (Medical Records) ---");

  try {
      const allRecords = await db.select().from(medicalRecords);

      for (const record of allRecords) {
        // Verifica se tem foto
        if (!record.photoUrl) continue;

        const newUrl = await refreshSignedUrl(record.photoUrl, String(record.id), "Movimentação");

        if (newUrl) {
          await db.update(medicalRecords)
            .set({ photoUrl: newUrl })
            .where(eq(medicalRecords.id, record.id));
          console.log(`[OK] Movimentação ${record.id} atualizada.`);
          updatedCount++;
        } else {
          errorCount++;
        }
      }
  } catch (e: any) {
      console.error("[ERRO EM MOVIMENTAÇÕES]", e.message);
  }

  console.log("\n========== RESUMO ==========");
  console.log(`✅ Registros atualizados: ${updatedCount}`);
  console.log(`❌ Falhas: ${errorCount}`);
  console.log("============================");

  process.exit(0);
}

main().catch((error) => {
  console.error("[FATAL] Erro no script principal:", error);
  process.exit(1);
});