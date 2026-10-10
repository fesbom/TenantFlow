import type { Appointment } from "@/types";

export function snapAppointmentStartTime(
  appointments: Appointment[],
  dentistId: string | undefined,
  scheduledDate: string,
): string {
  const [datePart, timePart] = scheduledDate.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart || "").split(":").map(Number);
  if (
    ![year, month, day, hour, minute].every(Number.isFinite) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) return scheduledDate;

  const selectedMinute = hour * 60 + minute;
  let nearestEndMinute: number | null = null;
  let nearestDistance = 31;

  if (dentistId) {
    for (const existing of appointments) {
      if (
        existing.dentistId !== dentistId ||
        existing.status === "cancelled" ||
        existing.status === "cancelled_no_response"
      ) continue;

      const existingStart = new Date(existing.scheduledDate);
      if (Number.isNaN(existingStart.getTime())) continue;
      const existingDate = [
        existingStart.getUTCFullYear(),
        String(existingStart.getUTCMonth() + 1).padStart(2, "0"),
        String(existingStart.getUTCDate()).padStart(2, "0"),
      ].join("-");
      if (existingDate !== datePart) continue;

      const startMinute = existingStart.getUTCHours() * 60 + existingStart.getUTCMinutes();
      if (startMinute > selectedMinute) continue;

      const endMinute = startMinute + (existing.duration || 60);
      const distance = selectedMinute - endMinute;
      if (endMinute <= selectedMinute && endMinute < 24 * 60 && distance <= 30 && distance < nearestDistance) {
        nearestEndMinute = endMinute;
        nearestDistance = distance;
      }
    }
  }

  const startMinute = nearestEndMinute ?? Math.floor(selectedMinute / 30) * 30;
  const startHour = String(Math.floor(startMinute / 60)).padStart(2, "0");
  const startMinutePart = String(startMinute % 60).padStart(2, "0");
  return `${datePart}T${startHour}:${startMinutePart}`;
}
