import { Storage, File } from "@google-cloud/storage";
import path from "path";
import express, { type Express, type NextFunction, type Response } from "express";
import {
  authenticateToken,
  type AuthenticatedRequest,
} from "./middleware/auth";

// Validate and load credentials
let credentialsJson;
if (!process.env.GOOGLE_CREDENTIALS) {
  throw new Error(
    "FATAL: Secret 'GOOGLE_CREDENTIALS' not found. " +
    "Please create the Secret with the Google Cloud Service Account JSON."
  );
}

try {
  credentialsJson = JSON.parse(process.env.GOOGLE_CREDENTIALS);
} catch (e) {
  console.error(
    "FATAL: Error parsing Secret 'GOOGLE_CREDENTIALS'. " +
    "Verify that you copied the complete JSON correctly."
  );
  throw e;
}

// Initialize Storage with credentials
const objectStorageClient = new Storage({
  credentials: credentialsJson,
  projectId: credentialsJson.project_id,
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// GOOGLE_CREDENTIALS is guaranteed present here (throws above otherwise); only the bucket name is optional
export function isObjectStorageConfigured(): boolean {
  return Boolean(process.env.PRIVATE_OBJECT_DIR);
}

export function isLocalUploadPathOwnedByClinic(
  requestPath: string,
  expectedClinicId: string,
): boolean {
  if (!expectedClinicId || !/^[a-zA-Z0-9_-]+$/.test(expectedClinicId)) {
    return false;
  }

  try {
    const decodedPath = decodeURIComponent(requestPath.split("?")[0]).replace(/\\/g, "/");
    if (decodedPath.includes("\0")) return false;

    const normalizedPath = path.posix.normalize(`/${decodedPath}`);
    const [clinicId] = normalizedPath.split("/").filter(Boolean);
    return clinicId === expectedClinicId;
  } catch {
    return false;
  }
}

export function authorizeLocalUpload(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({
      code: "AUTENTICACAO_OBRIGATORIA",
      message: "Autenticação obrigatória.",
    });
  }

  if (!isLocalUploadPathOwnedByClinic(req.url, req.user.clinicId)) {
    return res.status(403).json({
      code: "MIDIA_DE_OUTRA_CLINICA",
      message: "Acesso à mídia não autorizado.",
    });
  }

  next();
}

export function mountLocalUploads(
  app: Express,
  uploadsRoot = path.join(process.cwd(), "uploads"),
) {
  app.use(
    "/uploads",
    authenticateToken,
    authorizeLocalUpload,
    express.static(uploadsRoot),
  );
}

export class ObjectStorageService {
  constructor() {}

  getBucketName(): string {
    const bucketName = process.env.PRIVATE_OBJECT_DIR || "";
    if (!bucketName) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var to the bucket name (e.g., dentalcare-fotos)."
      );
    }
    return bucketName;
  }

  async uploadFile(fileBuffer: Buffer, fullObjectPath: string, mimeType: string): Promise<string> {
    try {
      const bucket = objectStorageClient.bucket(this.getBucketName());
      const file = bucket.file(fullObjectPath);

      await file.save(fileBuffer, {
        contentType: mimeType,
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });

      const [url] = await file.getSignedUrl({
        version: 'v2',
        action: 'read',
        // V2 signed URLs use a Unix timestamp and cannot exceed 2038.
        expires: new Date("2038-01-18T00:00:00.000Z"),
      });

      return url;
    } catch (error: any) {
      console.error(
        "Fatal error in ObjectStorageService.uploadFile:", 
        error.message, 
        error
      );
      throw new Error(error.message || "Failed to upload file to object storage");
    }
  }

  async deleteFile(fileUrl: string, expectedClinicId: string): Promise<void> {
    try {
      const objectPath = this.extractObjectPathFromUrl(fileUrl);
      if (!objectPath || !objectPath.startsWith(`${expectedClinicId}/`)) {
        return;
      }

      const bucket = objectStorageClient.bucket(this.getBucketName());
      const file = bucket.file(objectPath);

      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
      }
    } catch (error) {
      console.error("Error deleting file from object storage:", error);
    }
  }

  async listObjectPaths(prefix: string): Promise<string[]> {
    const bucket = objectStorageClient.bucket(this.getBucketName());
    const [files] = await bucket.getFiles({ prefix });
    return files.map((file) => file.name);
  }

  async deleteObjectPath(objectPath: string): Promise<boolean> {
    const bucket = objectStorageClient.bucket(this.getBucketName());
    const file = bucket.file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return false;
    await file.delete();
    return true;
  }

  extractObjectPathFromUrl(url: string): string | null {
    try {
      if (url.startsWith('http')) {
        // Extract path from signed URL
        // URL format: https://storage.googleapis.com/bucket-name/path/to/file?X-Goog-Algorithm=...
        const urlObj = new URL(url);
        if (urlObj.protocol !== "https:" || urlObj.hostname !== "storage.googleapis.com") {
          return null;
        }
        const pathname = urlObj.pathname;
        
        // Remove leading slash and bucket name
        // pathname is like: /bucket-name/clinicId/patients/...
        const pathParts = pathname.split('/').filter(p => p.length > 0);
        
        // Remove bucket name (first part) and return the rest
        if (pathParts.length > 1 && pathParts[0] === this.getBucketName()) {
          return pathParts.slice(1).join('/');
        }
      }
      
      // For local paths (/uploads/...), return as is
      return url.startsWith('/') ? url.substring(1) : url;
    } catch {
      return null;
    }
  }
}
