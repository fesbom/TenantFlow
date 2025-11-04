import { Storage, File } from "@google-cloud/storage";

// --- INÍCIO DA CORREÇÃO DE AUTENTICAÇÃO ---

// 1. Validar e carregar o Secret
let credentialsJson;
if (!process.env.GOOGLE_CREDENTIALS) {
  throw new Error(
    "FATAL: Secret 'GOOGLE_CREDENTIALS' não foi encontrado. " +
    "Por favor, crie o Secret com o JSON da Conta de Serviço do Google Cloud."
  );
}

try {
  credentialsJson = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (e) {
  console.error(
    "FATAL: Erro ao fazer parse do Secret 'GOOGLE_CREDENTIALS'. " +
    "Verifique se você copiou o JSON inteiro corretamente."
  );
  throw e;
}

// 2. Inicializar o Storage com as credenciais CORRETAS
const objectStorageClient = new Storage({
  credentials: credentialsJson,
  projectId: credentialsJson.project_id, // Pega o ID do projeto de dentro do JSON
});

// --- FIM DA CORREÇÃO DE AUTENTICAÇÃO ---
// O código antigo do REPLIT_SIDECAR_ENDPOINT foi removido

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var (e.g., /bucket-name/uploads)."
      );
    }
    return dir;
  }

  async uploadFile(fileBuffer: Buffer, filename: string, mimeType: string): Promise<string> {
    try {
      const privateObjectDir = this.getPrivateObjectDir();
      const timestamp = Date.now();
      const fullPath = `${privateObjectDir}/${timestamp}-${filename}`;

      const { bucketName, objectName } = this.parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      await file.save(fileBuffer, {
        contentType: mimeType,
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });

      // --- CORREÇÃO DA EXPIRAÇÃO (MÁXIMO DE 7 DIAS) ---
      const maxExpiration = 7 * 24 * 60 * 60 * 1000; // 7 dias em milissegundos

      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + maxExpiration, // Corrigido para 7 dias
      });

      // Esta URL será algo como: "https://storage.googleapis.com/..."
      return url;

    } catch (error: any) {
      console.error(
        "Falha grave no ObjectStorageService.uploadFile:", 
        error.message, 
        error
      );
      // Lança o erro para que o 'catch' do app.post seja ativado
      throw new Error(error.message || "Failed to upload file to object storage");
    }
  }

  // ... (O restante do arquivo: deleteFile, downloadFile, etc.) ...
  // O restante do seu arquivo parece correto, apenas cole o código acima
  // no lugar do `uploadFile` e da inicialização do `objectStorageClient`.

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const objectPath = this.extractObjectPathFromUrl(fileUrl);
      if (!objectPath) {
        return;
      }

      const { bucketName, objectName } = this.parseObjectPath(objectPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
      }
    } catch (error) {
      console.error("Error deleting file from object storage:", error);
    }
  }

  private extractObjectPathFromUrl(url: string): string | null {
    try {
      if (url.startsWith('gcs://')) {
        return `/${url.replace('gcs://', '')}`;
      }
      if (url.startsWith('http')) {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        return pathname;
      }
      return url;
    } catch {
      return null;
    }
  }

  private parseObjectPath(path: string): {
    bucketName: string;
    objectName: string;
  } {
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }
    const pathParts = path.split("/").filter(p => p.length > 0);
    if (pathParts.length < 2) {
      throw new Error("Invalid path: must contain at least a bucket name and object name");
    }

    const bucketName = pathParts[0];
    const objectName = pathParts.slice(1).join("/");

    return {
      bucketName,
      objectName,
    };
  }
}