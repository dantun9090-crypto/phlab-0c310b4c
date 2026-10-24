import { beforeEach, describe, expect, it, vi } from "vitest";
import { logSecurityEvent } from "./security-events";

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as null | { uid: string } },
  addDoc: vi.fn(),
  collection: vi.fn(() => ({ collectionName: "securityEvents" })),
  serverTimestamp: vi.fn(() => "server-timestamp"),
}));

vi.mock("@/lib/firebase", () => ({
  auth: mocks.auth,
  db: {},
  addDoc: mocks.addDoc,
  collection: mocks.collection,
}));

vi.mock("firebase/firestore", () => ({
  serverTimestamp: mocks.serverTimestamp,
}));

describe("logSecurityEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addDoc.mockResolvedValue(undefined);
    mocks.auth.currentUser = { uid: "current-user" };
  });

  it("uses the actor UID captured before auth state is cleared", async () => {
    mocks.auth.currentUser = null;

    logSecurityEvent({ type: "admin_idle_logout", actorUid: "admin-user" });

    await vi.waitFor(() => {
      expect(mocks.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ uid: "admin-user" }),
      );
    });
  });

  it("keeps an explicitly anonymous actor instead of using the current user", async () => {
    logSecurityEvent({ type: "admin_logout", actorUid: null });

    await vi.waitFor(() => {
      expect(mocks.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ uid: null }),
      );
    });
  });

  it("falls back to the current user when no actor UID is provided", async () => {
    logSecurityEvent({ type: "password_changed" });

    await vi.waitFor(() => {
      expect(mocks.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ uid: "current-user" }),
      );
    });
  });
});
