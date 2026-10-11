export type Task = {
  id: string;
  title: string;
  date: string;
  time: string;
  done: boolean;
};
export type Workout = {
  id: string;
  day: number;
  title: string;
  sets: number;
  reps: string;
  notes: string;
};
export type Transaction = {
  id: string;
  kind: "income" | "expense";
  category: string;
  cents: number;
  date: string;
  notes: string;
};
export type Project = {
  id: string;
  title: string;
  description: string;
  deadline: string;
  status: "active" | "paused" | "done";
  tasks: { id: string; title: string; done: boolean }[];
};
export type Goal = {
  id: string;
  title: string;
  deadline: string;
  unit: string;
  target: number;
  current: number;
};
export type Reminder = {
  id: string;
  title: string;
  at: string;
  enabled: boolean;
};
export type Data = {
  schema: 1;
  tasks: Task[];
  workouts: Workout[];
  transactions: Transaction[];
  projects: Project[];
  goals: Goal[];
  reminders: Reminder[];
  settings: { compact: boolean; accent: "lime" | "sage" };
};
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function moneyToCents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized))
    throw new Error(
      "Укажите положительную сумму, не более двух знаков после запятой.",
    );
  const [rub, kop = ""] = normalized.split(".");
  const result = Number(rub) * 100 + Number(kop.padEnd(2, "0"));
  if (result <= 0) throw new Error("Сумма должна быть больше нуля.");
  return result;
}
export const money = (cents: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(
    cents / 100,
  );
export const progress = (current: number, total: number) =>
  total ? Math.min(100, Math.round((current / total) * 100)) : 0;
export const dateLabel = (value: string) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("ru-RU")
    : "Без срока";
export function localInput(iso: string) {
  const d = new Date(iso);
  return `${localDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function reminderISO(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()) || localInput(d.toISOString()) !== value)
    throw new Error("Некорректное местное время.");
  return d.toISOString();
}
