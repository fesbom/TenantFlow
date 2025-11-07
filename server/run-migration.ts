import { Storage } from "@google-cloud/storage";
import { DatabaseStorage } from "./storage";
import { db } from "./db";
import { patients } from "@shared/schema";
import { eq } from "drizzle-orm";

console.log(`[DEBUG] Script iniciado. DATABASE_URL lida: ${process.env.DATABASE_URL}`);

// Validate and load credentials
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

// Initialize Storage with credentials
const objectStorageClient = new Storage({
  credentials: credentialsJson,
  projectId: credentialsJson.project_id,
});

const bucketName = process.env.PRIVATE_OBJECT_DIR || "";
if (!bucketName) {
  console.error(
    "FATAL: PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
    "tool and set PRIVATE_OBJECT_DIR env var to the bucket name (e.g., dentalcare-fotos)."
  );
  process.exit(1);
}

async function main() {
  // Read parameter from command line
  const param = process.argv[2];
  
  if (!param) {
    console.error("Uso: npm run migrate [0 para todos | ID_DO_PACIENTE]");
    process.exit(1);
  }

  const storage = new DatabaseStorage();
  const patientsToMigrate: any[] = [];

  // Fetch patients based on parameter
  if (param === "0") {
    console.log("[INFO] Buscando todos os pacientes...");
    const allPatients = await storage.getAllPatients();
    patientsToMigrate.push(...allPatients);
    console.log(`[INFO] Encontrados ${patientsToMigrate.length} pacientes no total`);
  } else {
    console.log(`[INFO] Buscando paciente com ID: ${param}...`);
    // Since getPatientById requires clinicId, we'll query directly
    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, param))
      .limit(1);
    
    if (!patient) {
      console.error(`[ERRO.] Paciente não encontrado: ${param}`);
      process.exit(1);
    }
    
    patientsToMigrate.push(patient);
    console.log("[INFO] Paciente encontrado");
  }

  // Process each patient
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const patient of patientsToMigrate) {
    try {
      // Filter: check if photo_url exists and points to old folder
      if (!patient.photoUrl || !patient.photoUrl.includes("/uploads_foto/")) {
        console.log(`[INFO] Paciente ${patient.id} (${patient.name}) não precisa de migração.`);
        skipCount++;
        continue;
      }

      console.log(`[PROCESSAR] Migrando Paciente ${patient.id} (${patient.name})...`);

      // Extract old object path from URL
      // URL format: https://storage.googleapis.com/bucket-name/uploads_foto/filename?X-Goog-Algorithm=...
      const oldPhotoUrl = patient.photoUrl;
      let oldObjectPath: string;

      try {
        const urlObj = new URL(oldPhotoUrl);
        const pathname = urlObj.pathname;
        
        // pathname is like: /bucket-name/uploads_foto/176...-photo.jpg
        const pathParts = pathname.split('/').filter(p => p.length > 0);
        
        // Remove bucket name (first part) and get the rest
        if (pathParts.length > 1) {
          oldObjectPath = pathParts.slice(1).join('/');
        } else {
          throw new Error("Invalid URL format");
        }
      } catch (error) {
        console.error(`[ERRO] Paciente ${patient.id}: URL inválida - ${oldPhotoUrl}`);
        errorCount++;
        continue;
      }

      // Extract filename from old path
      // oldObjectPath is like: uploads_foto/1762...-photo.jpg
      const filename = oldObjectPath.split('/').pop();
      if (!filename) {
        console.error(`[ERRO] Paciente ${patient.id}: Não foi possível extrair o nome do arquivo`);
        errorCount++;
        continue;
      }

      // Define new object path with multi-tenant structure
      const newObjectPath = `${patient.clinicId}/patients/${patient.id}/${filename}`;

      console.log(`  -> De: ${oldObjectPath}`);
      console.log(`  -> Para: ${newObjectPath}`);

      // Move file in Google Cloud Storage
      const bucket = objectStorageClient.bucket(bucketName);
      const oldFile = bucket.file(oldObjectPath);
      
      // Check if old file exists
      const [exists] = await oldFile.exists();
      if (!exists) {
        console.error(`[ERRO] Paciente ${patient.id}: Arquivo não encontrado no storage - ${oldObjectPath}`);
        errorCount++;
        continue;
      }

      // Move the file
      await oldFile.move(newObjectPath);

      // Generate new signed URL (7 days - Google Cloud max)
      const newFile = bucket.file(newObjectPath);
      const maxExpiration = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
      
      const [newSignedUrl] = await newFile.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + maxExpiration,
      });

      // Update database
      await db
        .update(patients)
        .set({ photoUrl: newSignedUrl })
        .where(eq(patients.id, patient.id));

      console.log(`[OK] Migrado Paciente ${patient.id} (${patient.name})`);
      successCount++;

    } catch (error: any) {
      console.error(`[ERRO] Paciente ${patient.id}: ${error.message}`);
      errorCount++;
    }
  }

  // Summary
  console.log("\n========== RESUMO DA MIGRAÇÃO ==========");
  console.log(`Total de pacientes processados: ${patientsToMigrate.length}`);
  console.log(`✅ Migrados com sucesso: ${successCount}`);
  console.log(`⏭️  Pulados (não precisam migração): ${skipCount}`);
  console.log(`❌ Erros: ${errorCount}`);
  console.log("========================================\n");

  process.exit(0);
}

main().catch((error) => {
  console.error("[FATAL]", error);
  process.exit(1);
});
