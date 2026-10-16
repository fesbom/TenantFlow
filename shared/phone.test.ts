import { describe, expect, it } from "vitest";
import { normalizeWhatsappPhone } from "./phone";

describe("normalizeWhatsappPhone", () => {
  it.each([
    ["04899321247", "5548999321247"],
    ["048999321247", "5548999321247"],
    ["(48) 99932-1247", "5548999321247"],
    ["5548999321247", "5548999321247"],
  ])("aceita %s", (input, expected) => expect(normalizeWhatsappPhone(input)).toBe(expected));

  it.each(["04834383230", "04834370437", "048", "", null, "999"])("rejeita %s", (input) =>
    expect(normalizeWhatsappPhone(input as string | null)).toBeNull());
});
