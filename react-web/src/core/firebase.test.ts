import { describe, expect, it } from "vitest";
import {
  assertProductWritesEnabled,
  expectedFirebaseProjectId,
  firebaseWritesEnabled,
} from "./firebase";

describe("modo conservador do Firebase", () => {
  it("mantém o projeto esperado fixo", () => {
    expect(expectedFirebaseProjectId).toBe("entaobora");
  });

  it("bloqueia escritas de produto no ambiente de teste", () => {
    expect(firebaseWritesEnabled).toBe(false);
    expect(() => assertProductWritesEnabled("Bora")).toThrow(
      "modo conservador",
    );
  });
});
