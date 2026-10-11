import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { loadData, saveData, exportBackup, readBackup } from "./storage";
import { PwaSettings, startReminders, testNotification } from "./pwa";
import {
  type Data,
  type Project,
  localDate,
  money,
  moneyToCents,
  progress,
  dateLabel,
  localInput,
  reminderISO,
} from "./model";
import { quoteForDay } from "./quotes";

const pages = [
  "Главная",
  "Тренировки",
  "Финансы",
  "Проекты",
  "Цели",
  "Напоминания",
  "Настройки",
];
const days = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
type Kind =
  "tasks" | "workouts" | "transactions" | "projects" | "goals" | "reminders";
type Editor = { kind: Kind; item?: Record<string, any> };
const id = () => crypto.randomUUID();
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Meter({ value }: { value: number }) {
  return (
    <div
      className="meter"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <i style={{ width: `${value}%` }} />
    </div>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export default function App() {
  const [data, setData] = useState<Data>();
  const [page, setPage] = useState(0);
  const [date, setDate] = useState(localDate());
  const [today, setToday] = useState(localDate());
  const [editor, setEditor] = useState<Editor>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const revision = useRef(0);
  const importInput = useRef<HTMLInputElement>(null);
  const [confirmation, setConfirmation] = useState<{
    text: string;
    action: () => Promise<void>;
  }>();
  useEffect(() => {
    loadData()
      .then((snapshot) => {
        revision.current = snapshot.revision;
        setData(snapshot.data);
      })
      .catch((e) => setError(String(e)));
    const stopReminders = startReminders((message) =>
      setError(`Напоминания: ${message}`),
    );
    let previousDay = localDate();
    const timer = setInterval(() => {
      const nextDay = localDate();
      if (nextDay !== previousDay) {
        const oldDay = previousDay;
        setDate((selectedDay) =>
          selectedDay === oldDay ? nextDay : selectedDay,
        );
        setToday(nextDay);
        previousDay = nextDay;
      }
    }, 30000);
    return () => {
      clearInterval(timer);
      stopReminders();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.accent = data?.settings.accent ?? "lime";
    document.documentElement.dataset.compact = String(
      data?.settings.compact ?? false,
    );
  }, [data?.settings]);
  async function save(next: Data) {
    if (saving.current) throw new Error("Дождитесь завершения сохранения.");
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      revision.current = await saveData(next, revision.current);
      setData(next);
    } catch (e) {
      setError(String(e));
      throw e;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function attempt(action: () => Promise<unknown>) {
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(String(e));
    }
  }
  function remove(kind: Kind, itemId: string) {
    setConfirmation({
      text: "Удалить запись? Это действие нельзя отменить.",
      action: async () => {
        if (data)
          await save({
            ...data,
            [kind]: data[kind].filter((x) => x.id !== itemId),
          });
      },
    });
  }
  const actions = (kind: Kind, item: { id: string }) => (
    <div className="actions">
      <button disabled={busy} onClick={() => setEditor({ kind, item })}>
        Изменить
      </button>
      <button
        disabled={busy}
        className="danger"
        onClick={() => remove(kind, item.id)}
      >
        Удалить
      </button>
    </div>
  );
  const add = (kind: Kind, label: string) => (
    <button
      className="primary"
      disabled={busy}
      onClick={() => setEditor({ kind })}
    >
      + {label}
    </button>
  );
  if (!data)
    return (
      <main className="loading">
        <div className="brand">
          NG<span>U</span>
        </div>
        <h1>Not Give Up</h1>
        <p role="alert">{error || "Открываем локальную базу…"}</p>
      </main>
    );
  const selected = data.tasks
    .filter((t) => t.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
  const done = selected.filter((t) => t.done).length;
  const quote = quoteForDay(today);
  const income = data.transactions
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.cents, 0);
  const expense = data.transactions
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.cents, 0);
  const updateProject = (project: Project) =>
    save({
      ...data,
      projects: data.projects.map((p) => (p.id === project.id ? project : p)),
    });
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          NG<span>U</span>
        </div>
        <div className="brand-name">NOT GIVE UP</div>
        <p className="tagline">Шаг за шагом. Каждый день.</p>
        <nav aria-label="Основные разделы">
          {pages.map((p, i) => (
            <button
              key={p}
              aria-current={page === i ? "page" : undefined}
              className={page === i ? "active" : ""}
              onClick={() => {
                setPage(i);
                setNotice("");
              }}
            >
              <span className="nav-index">0{i + 1}</span>
              {p}
            </button>
          ))}
        </nav>
        <footer>
          <span className="dot" /> Локально · Без интернета
          <br />
          <small>Ваш ритм. Ваши данные.</small>
        </footer>
      </aside>
      <main>
        <header>
          <div>
            <p className="eyebrow">ЛИЧНОЕ ПРОСТРАНСТВО</p>
            <h1>{pages[page]}</h1>
          </div>
          <span className="header-date">
            {new Date(`${today}T12:00:00`).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              weekday: "long",
            })}
          </span>
        </header>
        {error && (
          <div className="message error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Закрыть ошибку">
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="message" role="status">
            {notice}
          </div>
        )}
        <fieldset className="workspace" disabled={busy}>
          {page === 0 && (
            <>
              <section className="daily-top">
                <div>
                  <p className="eyebrow">ПРОГРЕСС ДНЯ</p>
                  <div className="big-number">
                    {done}
                    <span> / {selected.length}</span>
                  </div>
                  <p className="muted">
                    дел выполнено · {progress(done, selected.length)}%
                  </p>
                  <Meter value={progress(done, selected.length)} />
                </div>
                <blockquote>
                  «{quote.text}»
                  <cite>
                    {quote.author}
                    <small>{quote.source}</small>
                  </cite>
                </blockquote>
              </section>
              <section className="panel">
                <div className="section-head">
                  <div>
                    <h2>Расписание</h2>
                    <div className="date-tools">
                      <input
                        aria-label="Дата расписания"
                        type="date"
                        required
                        value={date}
                        onChange={(e) => {
                          if (e.target.value) setDate(e.target.value);
                        }}
                      />
                      <button onClick={() => setDate(today)}>Сегодня</button>
                    </div>
                  </div>
                  {add("tasks", "Действие")}
                </div>
                {selected.length === 0 && (
                  <Empty>На этот день пока ничего не запланировано.</Empty>
                )}
                {selected.map((t) => (
                  <div
                    className={`task-row ${t.done ? "completed" : ""}`}
                    key={t.id}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Выполнено: ${t.title}`}
                      checked={t.done}
                      onChange={() =>
                        void attempt(() =>
                          save({
                            ...data,
                            tasks: data.tasks.map((x) =>
                              x.id === t.id ? { ...x, done: !x.done } : x,
                            ),
                          }),
                        )
                      }
                    />
                    <time>{t.time}</time>
                    <span className="row-title">{t.title}</span>
                    {actions("tasks", t)}
                  </div>
                ))}
              </section>
              <p className="hint">
                Для переноса действия измените его дату или время.
              </p>
            </>
          )}
          {page === 1 && (
            <>
              <div className="section-head">
                <p className="muted">Ваш редактируемый недельный план</p>
                {add("workouts", "Упражнение")}
              </div>
              {days.map((day, index) => (
                <section className="panel week" key={day}>
                  <div className="day-label">
                    <span className="eyebrow">0{index + 1}</span>
                    <h2>{day}</h2>
                  </div>
                  <div className="day-content">
                    {!data.workouts.some((w) => w.day === index) && (
                      <p className="muted">Восстановление / свободный день</p>
                    )}
                    {data.workouts
                      .filter((w) => w.day === index)
                      .map((w) => (
                        <div className="exercise" key={w.id}>
                          <div>
                            <h3>{w.title}</h3>
                            <p className="accent">
                              {w.sets} подхода · {w.reps} повторений / время
                            </p>
                            {w.notes && <p className="muted">{w.notes}</p>}
                          </div>
                          {actions("workouts", w)}
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            </>
          )}
          {page === 2 && (
            <>
              <div className="stats">
                <div>
                  <p>Текущий баланс</p>
                  <strong>{money(income - expense)}</strong>
                </div>
                <div>
                  <p>Всего доходов</p>
                  <strong className="accent">{money(income)}</strong>
                </div>
                <div>
                  <p>Всего расходов</p>
                  <strong>{money(expense)}</strong>
                </div>
              </div>
              <section className="panel">
                <div className="section-head">
                  <h2>История операций</h2>
                  {add("transactions", "Операция")}
                </div>
                {!data.transactions.length && (
                  <Empty>Добавьте первый доход или расход.</Empty>
                )}
                {[...data.transactions]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((t) => (
                    <div className="transaction" key={t.id}>
                      <time>{dateLabel(t.date)}</time>
                      <div className="row-title">
                        <h3>{t.category}</h3>
                        <p className="muted">
                          {t.notes ||
                            (t.kind === "income" ? "Доход" : "Расход")}
                        </p>
                      </div>
                      <strong className={t.kind === "income" ? "accent" : ""}>
                        {t.kind === "income" ? "+" : "−"}
                        {money(t.cents)}
                      </strong>
                      {actions("transactions", t)}
                    </div>
                  ))}
              </section>
            </>
          )}
          {page === 3 && (
            <>
              <div className="section-head">
                <p className="muted">От замысла до результата</p>
                {add("projects", "Проект")}
              </div>
              {!data.projects.length && (
                <Empty>Создайте проект и разбейте его на задачи.</Empty>
              )}
              {data.projects.map((p) => (
                <section className="panel project" key={p.id}>
                  <div className="section-head">
                    <div>
                      <span className="badge">
                        {
                          {
                            active: "В работе",
                            paused: "На паузе",
                            done: "Завершён",
                          }[p.status]
                        }
                      </span>
                      <h2>{p.title}</h2>
                    </div>
                    {actions("projects", p)}
                  </div>
                  <p className="description">{p.description}</p>
                  <div className="progress-label">
                    <span>Срок: {dateLabel(p.deadline)}</span>
                    <span>
                      {p.tasks.filter((t) => t.done).length} / {p.tasks.length}{" "}
                      задач
                    </span>
                  </div>
                  <Meter
                    value={progress(
                      p.tasks.filter((t) => t.done).length,
                      p.tasks.length,
                    )}
                  />
                  {p.tasks.map((t) => (
                    <div className="task-row" key={t.id}>
                      <input
                        type="checkbox"
                        checked={t.done}
                        aria-label={`Выполнено: ${t.title}`}
                        onChange={() =>
                          void attempt(() =>
                            updateProject({
                              ...p,
                              tasks: p.tasks.map((x) =>
                                x.id === t.id ? { ...x, done: !x.done } : x,
                              ),
                            }),
                          )
                        }
                      />
                      <span
                        className={t.done ? "row-title strike" : "row-title"}
                      >
                        {t.title}
                      </span>
                    </div>
                  ))}
                  <p className="hint">
                    Добавление, изменение и удаление задач — в редакторе
                    проекта.
                  </p>
                </section>
              ))}
            </>
          )}
          {page === 4 && (
            <>
              <div className="section-head">
                <p className="muted">
                  Измеримый результат, понятный следующий шаг
                </p>
                {add("goals", "Цель")}
              </div>
              {!data.goals.length && (
                <Empty>Добавьте цель с результатом и сроком.</Empty>
              )}
              {data.goals.map((g) => (
                <section className="panel" key={g.id}>
                  <div className="section-head">
                    <h2>{g.title}</h2>
                    {actions("goals", g)}
                  </div>
                  <div className="goal-value">
                    {g.current.toLocaleString("ru-RU")}
                    <span>
                      {" "}
                      / {g.target.toLocaleString("ru-RU")} {g.unit}
                    </span>
                  </div>
                  <Meter value={progress(g.current, g.target)} />
                  <div className="progress-label">
                    <span>До {dateLabel(g.deadline)}</span>
                    <span>{progress(g.current, g.target)}%</span>
                  </div>
                </section>
              ))}
            </>
          )}
          {page === 5 && (
            <>
              <div className="section-head">
                <p className="muted">
                  Однократные напоминания по местному времени
                </p>
                {add("reminders", "Напоминание")}
              </div>
              <div className="info">
                Проверка напоминаний работает при открытом приложении. В фоне
                браузер может приостановить её; после закрытия уведомления по
                расписанию недоступны. Пропущенные напоминания будут обработаны
                при следующем открытии, если системные уведомления разрешены. На
                iPhone установите PWA на экран Домой.
              </div>
              <button
                onClick={() =>
                  void attempt(async () => {
                    await testNotification();
                    setNotice(
                      "Запрос передан системе. Проверьте центр уведомлений.",
                    );
                  })
                }
              >
                Проверить системное уведомление
              </button>
              <section className="panel reminders">
                {!data.reminders.length && <Empty>Напоминаний пока нет.</Empty>}
                {[...data.reminders]
                  .sort((a, b) => a.at.localeCompare(b.at))
                  .map((r) => (
                    <div className="task-row" key={r.id}>
                      <input
                        type="checkbox"
                        checked={r.enabled}
                        aria-label={`Включено: ${r.title}`}
                        onChange={() =>
                          void attempt(() =>
                            save({
                              ...data,
                              reminders: data.reminders.map((x) =>
                                x.id === r.id
                                  ? { ...x, enabled: !x.enabled }
                                  : x,
                              ),
                            }),
                          )
                        }
                      />
                      <div className="row-title">
                        <h3>{r.title}</h3>
                        <p className="muted">
                          {new Date(r.at).toLocaleString("ru-RU", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                          {!r.enabled
                            ? " · Отключено"
                            : new Date(r.at) < new Date()
                              ? " · Время наступило"
                              : ""}
                        </p>
                      </div>
                      {actions("reminders", r)}
                    </div>
                  ))}
              </section>
            </>
          )}
          {page === 6 && (
            <>
              <section className="panel settings">
                <h2>Внешний вид и поведение</h2>
                <Field label="Акцент">
                  <select
                    value={data.settings.accent}
                    onChange={(e) =>
                      void attempt(() =>
                        save({
                          ...data,
                          settings: {
                            ...data.settings,
                            accent: e.target.value as "lime" | "sage",
                          },
                        }),
                      )
                    }
                  >
                    <option value="lime">Салатовый</option>
                    <option value="sage">Приглушённый зелёный</option>
                  </select>
                </Field>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={data.settings.compact}
                    onChange={(e) =>
                      void attempt(() =>
                        save({
                          ...data,
                          settings: {
                            ...data.settings,
                            compact: e.target.checked,
                          },
                        }),
                      )
                    }
                  />
                  Компактный интерфейс
                </label>
              </section>
              <PwaSettings />
              <section className="panel settings">
                <h2>Резервная копия</h2>
                <p className="muted">
                  JSON содержит все разделы и настройки. Импорт полностью
                  заменяет текущие данные. Сначала сохраните резервную копию.
                </p>
                <div className="button-row">
                  <button
                    onClick={() =>
                      void attempt(async () => {
                        exportBackup(data);
                        setNotice(
                          "JSON-копия передана браузеру для скачивания.",
                        );
                      })
                    }
                  >
                    Экспорт JSON
                  </button>
                  <button onClick={() => importInput.current?.click()}>
                    Импорт JSON
                  </button>
                  <input
                    ref={importInput}
                    type="file"
                    accept=".json,application/json"
                    aria-label="Файл резервной копии"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      void attempt(async () => {
                        const next = await readBackup(file);
                        setConfirmation({
                          text: "Файл проверен. Полностью заменить текущие данные данными из резервной копии?",
                          action: async () => {
                            await save(next);
                            setNotice("Резервная копия восстановлена.");
                          },
                        });
                      });
                    }}
                  />
                </div>
              </section>
              <p className="hint">
                Not Give Up 0.2.0 · PWA · Данные хранятся только на этом
                устройстве.
              </p>
            </>
          )}
        </fieldset>
      </main>
      {editor && (
        <EditDialog
          editor={editor}
          date={date}
          busy={busy}
          onClose={() => setEditor(undefined)}
          onSave={async (item) => {
            const rows = data[editor.kind] as { id: string }[];
            await save({
              ...data,
              [editor.kind]: editor.item
                ? rows.map((x) => (x.id === item.id ? item : x))
                : [...rows, item],
            });
            setEditor(undefined);
          }}
        />
      )}
      {confirmation && (
        <Modal
          title="Подтверждение"
          onClose={() => {
            if (!busy) setConfirmation(undefined);
          }}
        >
          <p>{confirmation.text}</p>
          <div className="button-row">
            <button disabled={busy} onClick={() => setConfirmation(undefined)}>
              Отмена
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void attempt(async () => {
                  await confirmation.action();
                  setConfirmation(undefined);
                })
              }
            >
              Подтвердить
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="section-head">
        <h2>{title}</h2>
        <button type="button" aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function EditDialog({
  editor,
  date,
  busy,
  onClose,
  onSave,
}: {
  editor: Editor;
  date: string;
  busy: boolean;
  onClose: () => void;
  onSave: (item: any) => Promise<void>;
}) {
  const { kind, item = {} } = editor;
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<Project["tasks"]>(item.tasks ?? []);
  const names: Record<Kind, string> = {
    tasks: "Действие",
    workouts: "Упражнение",
    transactions: "Операция",
    projects: "Проект",
    goals: "Цель",
    reminders: "Напоминание",
  };
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? "").trim();
    const num = (k: string) => Number(str(k));
    try {
      let row: Record<string, unknown> = { id: item.id ?? id() };
      if (kind !== "transactions") row.title = str("title");
      if (kind === "tasks")
        row = {
          ...row,
          date: str("date"),
          time: str("time"),
          done: item.done ?? false,
        };
      if (kind === "workouts")
        row = {
          ...row,
          day: num("day"),
          sets: num("sets"),
          reps: str("reps"),
          notes: str("notes"),
        };
      if (kind === "transactions")
        row = {
          ...row,
          kind: str("kind"),
          category: str("category"),
          cents: moneyToCents(str("amount")),
          date: str("date"),
          notes: str("notes"),
        };
      if (kind === "projects")
        row = {
          ...row,
          description: str("description"),
          deadline: str("deadline"),
          status: str("status"),
          tasks: tasks.map((t) => ({ ...t, title: t.title.trim() })),
        };
      if (kind === "goals")
        row = {
          ...row,
          deadline: str("deadline"),
          unit: str("unit"),
          target: num("target"),
          current: num("current"),
        };
      if (kind === "reminders")
        row = { ...row, at: reminderISO(str("at")), enabled: f.has("enabled") };
      await onSave(row);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <Modal
      title={`${editor.item ? "Изменить" : "Добавить"}: ${names[kind].toLowerCase()}`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(e) => void submit(e)}>
        <fieldset disabled={busy} className="edit-fields">
          {kind !== "transactions" && (
            <Field label="Название">
              <input
                name="title"
                required
                maxLength={500}
                defaultValue={item.title}
                autoFocus
              />
            </Field>
          )}
          {(kind === "tasks" || kind === "transactions") && (
            <Field label="Дата">
              <input
                name="date"
                type="date"
                required
                defaultValue={item.date ?? date}
              />
            </Field>
          )}
          {kind === "tasks" && (
            <Field label="Время">
              <input
                name="time"
                type="time"
                required
                defaultValue={item.time ?? "09:00"}
              />
            </Field>
          )}
          {kind === "workouts" && (
            <>
              <Field label="День недели">
                <select name="day" defaultValue={item.day ?? 0}>
                  {days.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Подходы">
                  <input
                    name="sets"
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    required
                    defaultValue={item.sets ?? 3}
                  />
                </Field>
                <Field label="Повторения / время">
                  <input
                    name="reps"
                    required
                    defaultValue={item.reps ?? "12"}
                  />
                </Field>
              </div>
            </>
          )}
          {kind === "transactions" && (
            <>
              <Field label="Тип">
                <select name="kind" defaultValue={item.kind ?? "expense"}>
                  <option value="expense">Расход</option>
                  <option value="income">Доход</option>
                </select>
              </Field>
              <Field label="Категория">
                <input
                  name="category"
                  required
                  maxLength={200}
                  defaultValue={item.category}
                  list="categories"
                />
                <datalist id="categories">
                  {[
                    "Продукты",
                    "Транспорт",
                    "Дом",
                    "Здоровье",
                    "Досуг",
                    "Зарплата",
                    "Другое",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </datalist>
              </Field>
              <Field label="Сумма, ₽">
                <input
                  name="amount"
                  inputMode="decimal"
                  required
                  placeholder="0,00"
                  defaultValue={
                    item.cents !== undefined
                      ? (item.cents / 100).toFixed(2)
                      : ""
                  }
                />
              </Field>
            </>
          )}
          {(kind === "workouts" || kind === "transactions") && (
            <Field label="Комментарий">
              <textarea
                name="notes"
                maxLength={5000}
                defaultValue={item.notes}
              />
            </Field>
          )}
          {kind === "projects" && (
            <>
              <Field label="Описание">
                <textarea
                  name="description"
                  maxLength={5000}
                  defaultValue={item.description}
                />
              </Field>
              <Field label="Статус">
                <select name="status" defaultValue={item.status ?? "active"}>
                  <option value="active">В работе</option>
                  <option value="paused">На паузе</option>
                  <option value="done">Завершён</option>
                </select>
              </Field>
            </>
          )}
          {(kind === "projects" || kind === "goals") && (
            <Field
              label={kind === "goals" ? "Дедлайн" : "Дедлайн (необязательно)"}
            >
              <input
                name="deadline"
                type="date"
                required={kind === "goals"}
                defaultValue={item.deadline}
              />
            </Field>
          )}
          {kind === "projects" && (
            <div className="project-editor">
              <h3>Задачи проекта</h3>
              {tasks.map((t, i) => (
                <div className="task-edit" key={t.id}>
                  <input
                    type="checkbox"
                    aria-label={`Выполнена задача ${i + 1}`}
                    checked={t.done}
                    onChange={(e) =>
                      setTasks(
                        tasks.map((x) =>
                          x.id === t.id ? { ...x, done: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  <input
                    aria-label={`Название задачи ${i + 1}`}
                    required
                    maxLength={500}
                    value={t.title}
                    onChange={(e) =>
                      setTasks(
                        tasks.map((x) =>
                          x.id === t.id ? { ...x, title: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="danger"
                    aria-label={`Удалить задачу ${i + 1}`}
                    onClick={() => setTasks(tasks.filter((x) => x.id !== t.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setTasks([...tasks, { id: id(), title: "", done: false }])
                }
              >
                + Задача
              </button>
            </div>
          )}
          {kind === "goals" && (
            <>
              <Field label="Единица измерения">
                <input
                  name="unit"
                  required
                  placeholder="км, книг, часов…"
                  defaultValue={item.unit}
                />
              </Field>
              <div className="form-grid">
                <Field label="Целевой результат">
                  <input
                    name="target"
                    type="number"
                    min="0.001"
                    max="1000000000000"
                    step="any"
                    required
                    defaultValue={item.target ?? 1}
                  />
                </Field>
                <Field label="Достигнуто">
                  <input
                    name="current"
                    type="number"
                    min="0"
                    max="1000000000000"
                    step="any"
                    required
                    defaultValue={item.current ?? 0}
                  />
                </Field>
              </div>
            </>
          )}
          {kind === "reminders" && (
            <>
              <Field label="Дата и время на этом компьютере">
                <input
                  name="at"
                  type="datetime-local"
                  required
                  defaultValue={
                    item.at ? localInput(item.at) : `${localDate()}T09:00`
                  }
                />
              </Field>
              <label className="toggle">
                <input
                  name="enabled"
                  type="checkbox"
                  defaultChecked={item.enabled ?? true}
                />
                Включено
              </label>
              <p className="hint">
                При открытом приложении и разрешённых уведомлениях прошедшее
                время обрабатывается при ближайшей проверке. В фоне возможна
                задержка.
              </p>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-footer">
            <button type="button" onClick={onClose}>
              Отмена
            </button>
            <button className="primary" type="submit">
              {busy ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
