import { expect, it } from "vitest";
import { parseQrTableNumber, qrPath } from "./qrContext";

it("creates stable physical paths without a session identifier", () => {
  expect(qrPath("heavy-beer")).toBe("/checkin/heavy-beer");
  expect(qrPath("heavy-beer", 5)).toBe("/checkin/heavy-beer?table=05");
  expect(qrPath("bar & rock", 12)).toBe("/checkin/bar%20%26%20rock?table=12");
  for (const path of [qrPath("heavy-beer"), qrPath("heavy-beer", 5)])
    expect(path).not.toMatch(/session|service/i);
});
it("parses optional table numbers and rejects ambiguous inputs", () => {
  expect(parseQrTableNumber(null)).toBeNull();
  expect(parseQrTableNumber("")).toBeNull();
  expect(parseQrTableNumber("05")).toBe(5);
  for (const value of ["0", "-1", "5.5", "five", "1/2", "9007199254740992"])
    expect(() => parseQrTableNumber(value)).toThrow("inválido");
});
