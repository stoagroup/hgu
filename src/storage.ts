import { type Data, localDate } from "./model";

export const DB_NAME = "not-give-up";
export function seed(): Data {
  const date = localDate();
  return {
    schema: 1,
    tasks: [
      "Наметить три главных дела",
      "Прогулка без телефона",
      "Подвести итоги дня",
    ].map((title, i) => ({
      id: `sample-task-${i}`,
      title,
      date,
      time: ["08:30", "18:00", "21:00"][i],
      done: false,
    })),
    workouts: ["Приседания", "Отжимания", "Планка"].map((title, i) => ({
      id: `sample-workout-${i}`,
      title,
      day: i * 2,
      sets: 3,
      reps: i === 2 ? "30 секунд" : "12",
      notes: "Редактируемый пример — подберите нагрузку под себя",
    })),
    transactions: [],
    projects: [],
    goals: [],
    reminders: [],
    settings: { compact: false, accent: "lime" },
  };
}
// Validate before any write, including imported desktop backups. Return only supported fields.
export function validateData(value: unknown): Data {
  const fail = (message: string): never => {
    throw new Error(`Некорректные данные: ${message}`);
  };
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : fail("ожидается объект");
  const text = (v: unknown, required = true): string =>
    typeof v === "string" && v.length <= 10000 && (!required || !!v.trim())
      ? v
      : fail("текстовое поле");
  const bool = (v: unknown): boolean =>
    typeof v === "boolean" ? v : fail("логическое поле");
  const number = (
    v: unknown,
    min: number,
    max = 1e12,
    integer = false,
  ): number =>
    typeof v === "number" &&
    Number.isFinite(v) &&
    v >= min &&
    v <= max &&
    (!integer || Number.isInteger(v))
      ? v
      : fail("число вне допустимого диапазона");
  const choice = <T extends string>(v: unknown, choices: T[]): T =>
    choices.includes(v as T) ? (v as T) : fail("неизвестное значение");
  const date = (v: unknown, optional = false): string => {
    const s = text(v, !optional);
    if (optional && !s) return s;
    const d = new Date(`${s}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      !Number.isFinite(d.getTime()) ||
      d.toISOString().slice(0, 10) !== s
    )
      fail("дата");
    return s;
  };
  const list = (v: unknown): Record<string, unknown>[] =>
    Array.isArray(v) && v.length <= 10000
      ? v.map(obj)
      : fail("список или его размер");
  const ids = new Set<string>();
  const id = (v: unknown) => {
    const s = text(v);
    if (s.length > 100 || ids.has(s)) fail("повторяющийся идентификатор");
    ids.add(s);
    return s;
  };
  const d = obj(value);
  if (d.schema !== 1) fail("неподдерживаемая версия");
  const settings = obj(d.settings);
  let total = 0;
  return {
    schema: 1,
    tasks: list(d.tasks).map((r) => {
      const time = text(r.time);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fail("время");
      return {
        id: id(r.id),
        title: text(r.title),
        date: date(r.date),
        time,
        done: bool(r.done),
      };
    }),
    workouts: list(d.workouts).map((r) => ({
      id: id(r.id),
      title: text(r.title),
      day: number(r.day, 0, 6, true),
      sets: number(r.sets, 1, 1000, true),
      reps: text(r.reps),
      notes: text(r.notes, false),
    })),
    transactions: list(d.transactions).map((r) => {
      const cents = number(r.cents, 1, 999999999999, true);
      total += cents;
      if (!Number.isSafeInteger(total)) fail("общая сумма слишком велика");
      return {
        id: id(r.id),
        kind: choice(r.kind, ["income", "expense"]),
        category: text(r.category),
        cents,
        date: date(r.date),
        notes: text(r.notes, false),
      };
    }),
    projects: list(d.projects).map((r) => ({
      id: id(r.id),
      title: text(r.title),
      description: text(r.description, false),
      deadline: date(r.deadline, true),
      status: choice(r.status, ["active", "paused", "done"]),
      tasks: list(r.tasks).map((t) => ({
        id: id(t.id),
        title: text(t.title),
        done: bool(t.done),
      })),
    })),
    goals: list(d.goals).map((r) => ({
      id: id(r.id),
      title: text(r.title),
      deadline: date(r.deadline),
      unit: text(r.unit),
      target: number(r.target, Number.MIN_VALUE),
      current: number(r.current, 0),
    })),
    reminders: list(d.reminders).map((r) => {
      const at = text(r.at);
      if (
        !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
          at,
        ) ||
        !Number.isFinite(Date.parse(at))
      )
        fail("время напоминания");
      date(at.slice(0, 10));
      return {
        id: id(r.id),
        title: text(r.title),
        at: new Date(at).toISOString(),
        enabled: bool(r.enabled),
      };
    }),
    settings: {
      compact: bool(settings.compact),
      accent: choice(settings.accent, ["lime", "sage"]),
    },
  };
}
let connection: Promise<IDBDatabase> | undefined;
export function openDatabase(): Promise<IDBDatabase> {
  if (!connection)
    connection = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error("Этот браузер не поддерживает IndexedDB."));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("state");
        request.result.createObjectStore("deliveries");
      };
      request.onerror = () => {
        connection = undefined;
        reject(request.error);
      };
      request.onblocked = () => {
        connection = undefined;
        reject(
          new Error("Закройте другие вкладки приложения для обновления базы."),
        );
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => {
          request.result.close();
          connection = undefined;
        };
        resolve(request.result);
      };
    });
  return connection;
}
export type Snapshot = { data: Data; revision: number };
export async function loadData(): Promise<Snapshot> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    const store = tx.objectStore("state");
    const request = store.get("current");
    let snapshot: Snapshot;
    request.onsuccess = () => {
      try {
        snapshot = request.result ?? { data: seed(), revision: 0 };
        snapshot.data = validateData(snapshot.data);
        if (!request.result) store.put(snapshot, "current");
      } catch (e) {
        reject(e);
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(snapshot);
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error("Не удалось открыть данные."));
  });
}
export async function saveData(value: Data, revision: number): Promise<number> {
  const data = validateData(value);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    const store = tx.objectStore("state");
    const request = store.get("current");
    let conflict = false;
    request.onsuccess = () => {
      if (request.result?.revision !== revision) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put({ data, revision: revision + 1 }, "current");
    };
    tx.oncomplete = () => resolve(revision + 1);
    tx.onabort = tx.onerror = () =>
      reject(
        conflict
          ? new Error(
              "Данные изменены в другой вкладке. Перезагрузите приложение перед сохранением.",
            )
          : (tx.error ?? new Error("Не удалось сохранить данные.")),
      );
  });
}
export async function delivery(key: string, mark = false): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("deliveries", mark ? "readwrite" : "readonly");
    const store = tx.objectStore("deliveries");
    const request = mark ? store.put(true, key) : store.get(key);
    tx.oncomplete = () => resolve(!!request.result);
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export function exportBackup(data: Data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(validateData(data), null, 2)], {
      type: "application/json",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `not-give-up-${localDate()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function readBackup(file: File): Promise<Data> {
  if (file.size > 20000000) throw new Error("Файл больше 20 МБ.");
  return validateData(JSON.parse(await file.text()));
}
