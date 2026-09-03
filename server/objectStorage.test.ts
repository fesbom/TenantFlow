import { beforeEach, describe, expect, it, vi } from "vitest";

const gcs = vi.hoisted(() => {
  const file = { exists: vi.fn(), delete: vi.fn() };
  const bucket = { file: vi.fn(() => file), getFiles: vi.fn() };
  return { file, bucket, storage: { bucket: vi.fn(() => bucket) } };
});

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket = gcs.storage.bucket;
  },
  File: class {},
}));

process.env.GOOGLE_CREDENTIALS ||= JSON.stringify({ project_id: "test" });
process.env.PRIVATE_OBJECT_DIR ||= "test-bucket";

import { ObjectStorageService } from "./objectStorage";

describe("ObjectStorageService clinic prefix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gcs.file.exists.mockResolvedValue([true]);
    gcs.file.delete.mockResolvedValue(undefined);
  });

  it("deletes a file only when its path belongs to the expected clinic", async () => {
    const service = new ObjectStorageService();
    await service.deleteFile(
      `https://storage.googleapis.com/${service.getBucketName()}/clinic-a/patients/photo.jpg?signature=x`,
      "clinic-a",
    );
    expect(gcs.bucket.file).toHaveBeenCalledWith("clinic-a/patients/photo.jpg");
    expect(gcs.file.delete).toHaveBeenCalledOnce();
  });

  it.each([
    "clinic-b/patients/photo.jpg",
    "clinic-a2/patients/photo.jpg",
  ])("does not delete a cross-clinic path: %s", async (objectPath) => {
    const service = new ObjectStorageService();
    await service.deleteFile(
      `https://storage.googleapis.com/${service.getBucketName()}/${objectPath}`,
      "clinic-a",
    );
    expect(gcs.bucket.file).not.toHaveBeenCalled();
    expect(gcs.file.delete).not.toHaveBeenCalled();
  });

  it("does not delete a URL from an untrusted host", async () => {
    const service = new ObjectStorageService();
    await service.deleteFile(
      `https://evil.example/${service.getBucketName()}/clinic-a/patients/photo.jpg`,
      "clinic-a",
    );
    expect(gcs.bucket.file).not.toHaveBeenCalled();
    expect(gcs.file.delete).not.toHaveBeenCalled();
  });
});