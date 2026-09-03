import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  createJob: vi.fn(),
  getClinicDetail: vi.fn(),
  getJob: vi.fn(),
  listAudits: vi.fn(),
  listClinics: vi.fn(),
  queryRows: vi.fn(),
  setClinicStatus: vi.fn(),
  setUserActive: vi.fn(),
}));
const jobs = vi.hoisted(() => ({
  getExportPath: vi.fn(),
  processAdminJob: vi.fn(),
  resumePendingAdminJobs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./adminRepository", () => repository);
vi.mock("./adminJobService", () => jobs);
vi.mock("../db", () => ({ pool: { connect: vi.fn() } }));
vi.mock("../storage", () => ({ storage: {} }));

import { registerAdminRoutes } from "./adminRoutes";

type CapturedRoute = { method: string; path: string; handlers: any[] };

function captureRoutes() {
  const routes: CapturedRoute[] = [];
  const app: any = {};
  for (const method of ["get", "post", "patch"]) {
    app[method] = (path: string, ...handlers: any[]) => routes.push({ method, path, handlers });
  }
  registerAdminRoutes(app);
  return routes;
}

function response() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.download = vi.fn();
  return res;
}

describe("admin route isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("protects every /api/admin route except bootstrap from ordinary users", () => {
    const routes = captureRoutes().filter((route) => route.path !== "/api/admin/bootstrap");
    expect(routes.length).toBeGreaterThan(0);

    for (const route of routes) {
      const req: any = { user: { id: "user-a", role: "dentist", clinicId: "clinic-a" } };
      const res = response();
      const next = vi.fn();
      route.handlers[1](req, res, next);
      expect(res.status, route.path).toHaveBeenCalledWith(403);
      expect(res.json, route.path).toHaveBeenCalledWith(expect.objectContaining({ code: "PERMISSAO_INSUFICIENTE" }));
      expect(next, route.path).not.toHaveBeenCalled();
    }
  });

  it.each([
    { scan: null, label: "missing" },
    { scan: { id: "scan-1", clinicId: "clinic-b", type: "orphan_media_scan", status: "completed", result: {} }, label: "other clinic" },
    { scan: { id: "scan-1", clinicId: "clinic-a", type: "orphan_media_scan", status: "running", result: {} }, label: "unfinished" },
  ])("rejects orphan cleanup when the scan is $label", async ({ scan }) => {
    const route = captureRoutes().find((item) => item.path.endsWith("/orphan-media/cleanup"))!;
    repository.getClinicDetail.mockResolvedValue({ clinic: { name: "Clinic A" } });
    repository.getJob.mockResolvedValue(scan);
    const req: any = {
      params: { clinicId: "clinic-a" },
      body: { confirm: true, typedClinicName: "Clinic A", scanJobId: "scan-1" },
      user: { id: "admin", role: "superadmin", clinicId: "" },
    };
    const res = response();

    await route.handlers.at(-1)(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "VARREDURA_INVALIDA" }));
    expect(repository.createJob).not.toHaveBeenCalled();
  });

  it("uses only objects from a completed scan belonging to the same clinic", async () => {
    const route = captureRoutes().find((item) => item.path.endsWith("/orphan-media/cleanup"))!;
    repository.getClinicDetail.mockResolvedValue({ clinic: { name: "Clinic A" } });
    repository.getJob.mockResolvedValue({
      id: "scan-a", clinicId: "clinic-a", type: "orphan_media_scan", status: "completed",
      result: { objects: ["clinic-a/orphan.jpg"] },
    });
    repository.createJob.mockResolvedValue({ id: "cleanup-a" });
    const req: any = {
      params: { clinicId: "clinic-a" },
      body: { confirm: true, typedClinicName: "Clinic A", scanJobId: "scan-a" },
      user: { id: "admin", role: "superadmin", clinicId: "" },
    };
    const res = response();

    await route.handlers.at(-1)(req, res);

    expect(repository.createJob).toHaveBeenCalledWith("orphan_media_cleanup", "clinic-a", "admin", {
      confirm: true, scanJobId: "scan-a", objects: ["clinic-a/orphan.jpg"],
    });
    expect(res.status).toHaveBeenCalledWith(202);
  });
});