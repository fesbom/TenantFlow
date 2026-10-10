import { describe, expect, it } from "vitest";
import type { Appointment } from "@/types";
import { snapAppointmentStartTime } from "./appointment-time";

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: "appointment-1",
  patientId: "patient-1",
  dentistId: "dentist-1",
  clinicId: "clinic-1",
  scheduledDate: "2026-10-10T08:00:00.000Z",
  duration: 60,
  status: "scheduled",
  createdAt: "",
  updatedAt: "",
  ...overrides,
});

describe("snapAppointmentStartTime", () => {
  it("aligns a click to the previous half-hour boundary when there is no previous appointment", () => {
    expect(snapAppointmentStartTime([], undefined, "2026-10-10T09:07")).toBe("2026-10-10T09:00");
    expect(snapAppointmentStartTime([], undefined, "2026-10-10T09:44")).toBe("2026-10-10T09:30");
  });

  it("uses the exact end of the previous appointment when the click is within 30 minutes", () => {
    expect(snapAppointmentStartTime(
      [appointment()],
      "dentist-1",
      "2026-10-10T09:20",
    )).toBe("2026-10-10T09:00");
  });

  it("keeps the half-hour boundary when the previous appointment ended more than 30 minutes earlier", () => {
    expect(snapAppointmentStartTime(
      [appointment()],
      "dentist-1",
      "2026-10-10T09:31",
    )).toBe("2026-10-10T09:30");
  });

  it("does not snap to another dentist's or a future appointment", () => {
    expect(snapAppointmentStartTime(
      [appointment({ dentistId: "dentist-2" })],
      "dentist-1",
      "2026-10-10T09:20",
    )).toBe("2026-10-10T09:00");
    expect(snapAppointmentStartTime(
      [appointment({ scheduledDate: "2026-10-10T08:30:00.000Z" })],
      "dentist-1",
      "2026-10-10T09:00",
    )).toBe("2026-10-10T09:00");
  });

  it("preserves the exact end time when an appointment ends between grid boundaries", () => {
    expect(snapAppointmentStartTime(
      [appointment({ duration: 45 })],
      "dentist-1",
      "2026-10-10T08:50",
    )).toBe("2026-10-10T08:45");
  });
});
