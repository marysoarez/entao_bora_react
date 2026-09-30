import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("modo conservador do Firebase", () => {
  it("mantém o projeto esperado fixo", async () => {
    const { expectedFirebaseProjectId } = await import("./firebase");
    expect(expectedFirebaseProjectId).toBe("entaobora");
  });

  it.each([undefined, "false", "TRUE"])(
    "bloqueia escritas sem habilitação explícita (%s)",
    async (value) => {
      vi.stubEnv("VITE_FIREBASE_WRITES_ENABLED", value);
      const { assertProductWritesEnabled, firebaseWritesEnabled } =
        await import("./firebase");
      expect(firebaseWritesEnabled).toBe(false);
      expect(() => assertProductWritesEnabled("Bora")).toThrow(
        "modo conservador",
      );
    },
  );
});
