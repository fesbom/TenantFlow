import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

const storageMock = vi.hoisted(() => ({
  getUserById: vi.fn(),
  getClinicById: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: storageMock }));

import { authenticateToken } from "./auth";

function response() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

const activeUser = {
  id: "user-a",
  email: "a@example.test",
  role: "dentist",
  clinicId: "clinic-a",
  fullName: "User A",
  isActive: true,
  tokenVersion: 3,
};

describe("authenticateToken clinic isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = "test-secret";
  });

  it("blocks an inactive user", async () => {
    const token = jwt.sign({ userId: activeUser.id, tokenVersion: 3 }, process.env.SESSION_SECRET!);
    storageMock.getUserById.mockResolvedValue({ ...activeUser, isActive: false });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = response();
    const next = vi.fn();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "USUARIO_INATIVO" }));
    expect(next).not.toHaveBeenCalled();
    expect(storageMock.getClinicById).not.toHaveBeenCalled();
  });

  it("blocks a suspended clinic", async () => {
    const token = jwt.sign({ userId: activeUser.id, tokenVersion: 3 }, process.env.SESSION_SECRET!);
    storageMock.getUserById.mockResolvedValue(activeUser);
    storageMock.getClinicById.mockResolvedValue({ id: "clinic-a", status: "suspended" });
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = response();
    const next = vi.fn();

    await authenticateToken(req, res, next);

    expect(storageMock.getClinicById).toHaveBeenCalledWith("clinic-a");
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "CLINICA_SUSPENSA" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("revokes a signed token when tokenVersion changes", async () => {
    const token = jwt.sign({ userId: activeUser.id, tokenVersion: 2 }, process.env.SESSION_SECRET!);
    storageMock.getUserById.mockResolvedValue(activeUser);
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = response();
    const next = vi.fn();

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_REVOGADO" }));
    expect(next).not.toHaveBeenCalled();
    expect(storageMock.getClinicById).not.toHaveBeenCalled();
  });
});