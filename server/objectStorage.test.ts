import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import jwt from "jsonwebtoken";
import fs from "fs";
import os from "os";
import path from "path";

const gcs = vi.hoisted(() => {
  const file = { exists: vi.fn(), delete: vi.fn() };
  const bucket = { file: vi.fn(() => file), getFiles: vi.fn() };
  return { file, bucket, storage: { bucket: vi.fn(() => bucket) } };
});
const authStorage = vi.hoisted(() => ({
  getUserById: vi.fn(),
  getClinicById: vi.fn(),
}));

vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    bucket = gcs.storage.bucket;
  },
  File: class {},
}));
vi.mock("./storage", () => ({ storage: authStorage }));

process.env.GOOGLE_CREDENTIALS ||= JSON.stringify({ project_id: "test" });
process.env.PRIVATE_OBJECT_DIR ||= "test-bucket";

import {
  authorizeLocalUpload,
  isLocalUploadPathOwnedByClinic,
  mountLocalUploads,
  ObjectStorageService,
} from "./objectStorage";

describe("local upload tenant authorization", () => {
  it.each([
    "/clinic-a/patients/photo.jpg",
    "/clinic-a/profile/logo.png?cache=1",
  ])("allows a path inside the authenticated clinic: %s", (requestPath) => {
    expect(isLocalUploadPathOwnedByClinic(requestPath, "clinic-a")).toBe(true);
  });

  it.each([
    "/clinic-b/patients/photo.jpg",
    "/clinic-a2/patients/photo.jpg",
    "/clinic-a-extra/patients/photo.jpg",
    "/clinic-a/../clinic-b/patients/photo.jpg",
    "/clinic-a%2F..%2Fclinic-b/patients/photo.jpg",
  ])("rejects a cross-clinic or ambiguous path: %s", (requestPath) => {
    expect(isLocalUploadPathOwnedByClinic(requestPath, "clinic-a")).toBe(false);
  });

  it("requires an authenticated user", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();

    authorizeLocalUpload(
      { url: "/clinic-a/profile/logo.png" } as any,
      { status, json } as any,
      next,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a valid user requesting another clinic's media", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();

    authorizeLocalUpload(
      {
        url: "/clinic-b/patients/photo.jpg",
        user: { clinicId: "clinic-a" },
      } as any,
      { status, json } as any,
      next,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("enforces authentication and exact clinic ownership on the mounted route", async () => {
    const uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clinic-uploads-"));
    const clinicAPath = path.join(uploadsRoot, "clinic-a");
    const clinicA2Path = path.join(uploadsRoot, "clinic-a2");
    fs.mkdirSync(clinicAPath, { recursive: true });
    fs.mkdirSync(clinicA2Path, { recursive: true });
    fs.writeFileSync(path.join(clinicAPath, "photo.txt"), "clinic-a-media");
    fs.writeFileSync(path.join(clinicA2Path, "photo.txt"), "clinic-a2-media");

    process.env.SESSION_SECRET = "upload-route-test-secret";
    authStorage.getUserById.mockImplementation(async (userId: string) => ({
      id: userId,
      email: `${userId}@example.test`,
      fullName: userId,
      role: "dentist",
      clinicId: userId === "user-a" ? "clinic-a" : "clinic-b",
      isActive: true,
      tokenVersion: 0,
    }));
    authStorage.getClinicById.mockResolvedValue({ status: "active" });

    const app = express();
    mountLocalUploads(app, uploadsRoot);
    const server = app.listen(0);

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not bind to a TCP port");
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const tokenA = jwt.sign(
        { userId: "user-a", tokenVersion: 0 },
        process.env.SESSION_SECRET,
      );
      const tokenB = jwt.sign(
        { userId: "user-b", tokenVersion: 0 },
        process.env.SESSION_SECRET,
      );

      const anonymous = await fetch(`${baseUrl}/uploads/clinic-a/photo.txt`);
      expect(anonymous.status).toBe(401);

      const owner = await fetch(`${baseUrl}/uploads/clinic-a/photo.txt`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      expect(owner.status).toBe(200);
      expect(await owner.text()).toBe("clinic-a-media");

      const crossClinic = await fetch(`${baseUrl}/uploads/clinic-a/photo.txt`, {
        headers: { Authorization: `Bearer ${tokenB}` },
      });
      expect(crossClinic.status).toBe(403);

      const similarPrefix = await fetch(`${baseUrl}/uploads/clinic-a2/photo.txt`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      expect(similarPrefix.status).toBe(403);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      fs.rmSync(uploadsRoot, { recursive: true, force: true });
    }
  });
});

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