import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  claimJob: vi.fn(),
  queryRows: vi.fn(),
  updateJob: vi.fn(),
}));
const database = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  return { client, pool: { connect: vi.fn(async () => client) } };
});
const objectStorage = vi.hoisted(() => ({
  listObjectPaths: vi.fn(),
  deleteObjectPath: vi.fn(),
  extractObjectPathFromUrl: vi.fn((value: string) => {
    const marker = "/test-bucket/";
    const index = value.indexOf(marker);
    return index >= 0 ? value.slice(index + marker.length).split("?")[0] : null;
  }),
}));

vi.mock("./adminRepository", () => repository);
vi.mock("../db", () => ({ pool: database.pool }));
vi.mock("../objectStorage", () => ({
  ObjectStorageService: class {
    listObjectPaths = objectStorage.listObjectPaths;
    deleteObjectPath = objectStorage.deleteObjectPath;
    extractObjectPathFromUrl = objectStorage.extractObjectPathFromUrl;
  },
}));

import { processAdminJob } from "./adminJobService";

describe("administrative jobs clinic isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "production";
    database.client.query.mockResolvedValue({ rowCount: 1 });
    objectStorage.deleteObjectPath.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env.NODE_ENV = "test";
  });

  it("runs selective cleanup SQL and media deletion only for the target clinic", async () => {
    repository.claimJob.mockResolvedValue({
      id: "job-a", type: "clinic_cleanup", clinicId: "clinic-a", payload: { modules: ["records"] },
    });
    repository.queryRows.mockResolvedValue([
      { type: "medical_record_images", owner_id: "record-a", value: JSON.stringify([
        "https://storage.googleapis.com/test-bucket/clinic-a/records/a.jpg",
        "https://storage.googleapis.com/test-bucket/clinic-b/records/b.jpg",
      ]) },
    ]);

    await processAdminJob("job-a");

    const mutatingCalls = database.client.query.mock.calls.filter(([sql]) => !["BEGIN", "COMMIT"].includes(sql));
    expect(mutatingCalls).toHaveLength(1);
    expect(mutatingCalls[0][0]).toContain("DELETE FROM medical_records WHERE clinic_id=$1");
    expect(mutatingCalls[0][1]).toEqual(["clinic-a"]);
    expect(objectStorage.deleteObjectPath).toHaveBeenCalledTimes(1);
    expect(objectStorage.deleteObjectPath).toHaveBeenCalledWith("clinic-a/records/a.jpg");
    expect(repository.updateJob).toHaveBeenLastCalledWith("job-a", expect.objectContaining({ status: "completed" }));
  });

  it("scans only the clinic prefix even if storage returns a cross-clinic object", async () => {
    repository.claimJob.mockResolvedValue({
      id: "scan-a", type: "orphan_media_scan", clinicId: "clinic-a", payload: { dryRun: true },
    });
    objectStorage.listObjectPaths.mockResolvedValue([
      "clinic-a/orphan.jpg",
      "clinic-b/private.jpg",
    ]);
    repository.queryRows.mockResolvedValue([]);

    await processAdminJob("scan-a");

    expect(objectStorage.listObjectPaths).toHaveBeenCalledWith("clinic-a/");
    expect(repository.updateJob).toHaveBeenLastCalledWith("scan-a", expect.objectContaining({
      status: "completed",
      result: expect.objectContaining({ objects: ["clinic-a/orphan.jpg"], orphanCount: 1 }),
    }));
  });

  it("removes only reviewed, still-orphaned objects with the target clinic prefix", async () => {
    repository.claimJob.mockResolvedValue({
      id: "cleanup-a", type: "orphan_media_cleanup", clinicId: "clinic-a",
      payload: {
        confirm: true,
        objects: ["clinic-a/orphan.jpg", "clinic-a/referenced.jpg", "clinic-b/private.jpg"],
      },
    });
    objectStorage.listObjectPaths.mockResolvedValue([
      "clinic-a/orphan.jpg",
      "clinic-a/referenced.jpg",
      "clinic-b/private.jpg",
    ]);
    repository.queryRows.mockResolvedValue([
      { type: "patient_photo", owner_id: "patient-a", value: "https://storage.googleapis.com/test-bucket/clinic-a/referenced.jpg" },
    ]);

    await processAdminJob("cleanup-a");

    expect(objectStorage.deleteObjectPath).toHaveBeenCalledTimes(1);
    expect(objectStorage.deleteObjectPath).toHaveBeenCalledWith("clinic-a/orphan.jpg");
    expect(objectStorage.deleteObjectPath).not.toHaveBeenCalledWith("clinic-b/private.jpg");
  });
});