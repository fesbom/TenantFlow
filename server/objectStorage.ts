import { Storage, File } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "dentalcare_fesbom",
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

      // Generate signed URL (valid for 100 years)
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
      });

      return url;
    } catch (error: any) {
      console.error("Falha no ObjectStorageService.uploadFile:", error.message, error);
      throw new Error(error.message || "Failed to upload file to object storage");
    }
  }

  async downloadFile(fileUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      if (!fileUrl.startsWith('gcs://')) {
        throw new Error('Invalid GCS URL format');
      }

      const urlWithoutProtocol = fileUrl.replace('gcs://', '');
      const { bucketName, objectName } = this.parseObjectPath(`/${urlWithoutProtocol}`);

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (!exists) {
        throw new ObjectNotFoundError();
      }

      const [metadata] = await file.getMetadata();
      const [buffer] = await file.download();

      return {
        buffer,
        contentType: metadata.contentType || 'application/octet-stream'
      };
    } catch (error: any) {
      if (error instanceof ObjectNotFoundError) {
        throw error;
      }
      console.error("Error downloading file from object storage:", error);
      throw new Error("Failed to download file from object storage");
    }
  }

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
