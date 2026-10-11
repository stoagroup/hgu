import { describe, it, expect } from "vitest";
import { seed, validateData, readBackup } from "./storage";
describe("проверка данных и совместимость копий", () => {
  it("принимает примеры и старый desktop JSON, убирает настройку трея", () => {
    const data = seed();
    const old = { ...data, settings: { ...data.settings, closeToTray: true } };
    expect(validateData(old)).toEqual(data);
  });
  it("отклоняет неверные даты, время, ID и значения", () => {
    for (const mutate of [
      (d: any) => (d.tasks[0].date = "2026-02-30"),
      (d: any) => (d.tasks[0].time = "25:10"),
      (d: any) => (d.tasks[1].id = d.tasks[0].id),
      (d: any) => (d.workouts[0].sets = 0),
      (d: any) => (d.settings.compact = "false"),
      (d: any) => (d.schema = 2),
    ]) {
      const data = seed();
      mutate(data);
      expect(() => validateData(data)).toThrow();
    }
  });
  it("проверяет копейки без округления", () => {
    const data = seed();
    data.transactions = [
      {
        id: "finance",
        kind: "income",
        category: "Тест",
        cents: 29,
        date: "2026-10-11",
        notes: "",
      },
    ];
    expect(validateData(data).transactions[0].cents).toBe(29);
    data.transactions[0].cents = 0.29;
    expect(() => validateData(data)).toThrow();
  });
  it("проверяет цели и задачи проектов", () => {
    const data = seed();
    data.goals = [
      {
        id: "goal",
        title: "Чтение",
        deadline: "2027-01-01",
        unit: "книг",
        target: 0,
        current: 0,
      },
    ];
    expect(() => validateData(data)).toThrow();
    data.goals[0].target = 10;
    data.projects = [
      {
        id: "p",
        title: "Проект",
        description: "",
        deadline: "",
        status: "active",
        tasks: [{ id: "goal", title: "Задача", done: false }],
      },
    ];
    expect(() => validateData(data)).toThrow();
  });
  it("импортирует JSON и отклоняет повреждённый файл", async () => {
    const data = seed();
    expect(
      await readBackup(new File([JSON.stringify(data)], "backup.json")),
    ).toEqual(data);
    await expect(
      readBackup(new File(["{wrong"], "bad.json")),
    ).rejects.toThrow();
  });
});
