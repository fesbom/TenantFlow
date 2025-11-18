import { Storage, File } from "@google-cloud/storage";

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

      // Generate signed URL (valid for 100 anos - Google Cloud max)
      const maxExpiration = Date.now() + 100 * 365 * 24 * 60 * 60 * 1000;

      const [url] = await file.getSignedUrl({
        version: 'v2',
        action: 'read',
        expires: Date.now() + maxExpiration,
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

  async deleteFile(fileUrl: string): Promise<void> {
    try {
      const objectPath = this.extractObjectPathFromUrl(fileUrl);
      if (!objectPath) {
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

  private extractObjectPathFromUrl(url: string): string | null {
    try {
      if (url.startsWith('http')) {
        // Extract path from signed URL
        // URL format: https://storage.googleapis.com/bucket-name/path/to/file?X-Goog-Algorithm=...
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        
        // Remove leading slash and bucket name
        // pathname is like: /bucket-name/clinicId/patients/...
        const pathParts = pathname.split('/').filter(p => p.length > 0);
        
        // Remove bucket name (first part) and return the rest
        if (pathParts.length > 1) {
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
