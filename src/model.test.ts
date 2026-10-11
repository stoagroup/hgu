import { describe, expect, it } from "vitest";
import {
  localDate,
  moneyToCents,
  progress,
  reminderISO,
  localInput,
} from "./model";
describe("Деньги и даты", () => {
  it("точно переводит рубли в копейки", () => {
    expect(moneyToCents("0,29")).toBe(29);
    expect(moneyToCents("100.01")).toBe(10001);
  });
  it("не принимает округление и неверные суммы", () => {
    for (const s of ["0", "-1", "1.001", "NaN", "1e5", ""])
      expect(() => moneyToCents(s)).toThrow();
  });
  it("сохраняет местную календарную дату", () =>
    expect(localDate(new Date(2026, 0, 2, 0, 1))).toBe("2026-01-02"));
  it("переводит время туда и обратно", () =>
    expect(localInput(reminderISO("2026-10-11T14:30"))).toBe(
      "2026-10-11T14:30",
    ));
  it("ограничивает прогресс", () => {
    expect(progress(1, 3)).toBe(33);
    expect(progress(0, 0)).toBe(0);
    expect(progress(12, 10)).toBe(100);
  });
});
