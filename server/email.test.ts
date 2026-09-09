import { beforeEach, describe, expect, it, vi } from "vitest";

const proxy = vi.hoisted(() => vi.fn());

vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = proxy;
  },
}));

import {
  generatePasswordResetEmail,
  handleBrevoEmailWebhook,
  sendEmail,
} from "./email";

function response() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.send = vi.fn(() => res);
  return res;
}

function serializedCalls(spy: ReturnType<typeof vi.spyOn>) {
  return JSON.stringify(spy.mock.calls);
}

describe("password reset email safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BREVO_WEBHOOK_SECRET = "webhook-test-secret";
    delete process.env.BREVO_API_KEY;
    delete process.env.PASSWORD_RESET_BASE_URL;
  });

  it("builds reset links from the published HTTPS URL", () => {
    const email = generatePasswordResetEmail(
      "person@example.test",
      "secret-reset-token",
      "https://app.example.test/public/",
    );

    expect(email.text).toContain(
      "https://app.example.test/public/reset-password?token=secret-reset-token",
    );
    expect(email.html).toContain(
      "https://app.example.test/public/reset-password?token=secret-reset-token",
    );
  });

  it.each(["http://app.example.test", "not-a-url", ""])(
    "rejects a non-published reset base URL: %s",
    (baseUrl) => {
      expect(() =>
        generatePasswordResetEmail("person@example.test", "token", baseUrl),
      ).toThrow(/PASSWORD_RESET_BASE_URL/);
    },
  );

  it("does not log provider content or reset tokens when Brevo rejects a message", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    proxy.mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "invalid_parameter",
          message: "Rejected body containing secret-reset-token and private email content",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );

    const sent = await sendEmail({
      to: "person@example.test",
      from: "sender@example.test",
      subject: "secret-reset-token",
      html: "<p>private email content secret-reset-token</p>",
    });

    expect(sent).toBe(false);
    expect(serializedCalls(errorLog)).not.toContain("secret-reset-token");
    expect(serializedCalls(errorLog)).not.toContain("private email content");
    expect(errorLog).toHaveBeenCalledWith(
      "[email] Brevo rejected message",
      expect.objectContaining({ statusCode: 400, code: "invalid_parameter" }),
    );
  });

  it("does not log connector error messages that may include email content", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    proxy.mockRejectedValue(
      new Error("request failed with secret-reset-token and private email content"),
    );

    await sendEmail({
      to: "person@example.test",
      from: "sender@example.test",
      subject: "Password reset",
      html: "<p>secret-reset-token</p>",
    });

    expect(serializedCalls(errorLog)).not.toContain("secret-reset-token");
    expect(serializedCalls(errorLog)).not.toContain("private email content");
  });
});

describe("Brevo webhook authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BREVO_WEBHOOK_SECRET = "webhook-test-secret";
  });

  it("rejects calls without the configured secret", () => {
    const req: any = { get: vi.fn(() => undefined), body: {} };
    const res = response();

    handleBrevoEmailWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized webhook" });
  });

  it("accepts authenticated events without logging free-form failure content", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const req: any = {
      get: vi.fn(() => "webhook-test-secret"),
      body: {
        event: "hard_bounce",
        email: "person@example.test",
        reason: "secret-reset-token and private email content",
      },
    };
    const res = response();

    handleBrevoEmailWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
    expect(serializedCalls(log)).not.toContain("secret-reset-token");
    expect(serializedCalls(log)).not.toContain("private email content");
  });
});