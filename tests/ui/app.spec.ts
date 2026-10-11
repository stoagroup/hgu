import { test, expect, chromium, type Page } from "@playwright/test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";

test("browser restart preserves IndexedDB and opens fully offline", async () => {
  const profile = await mkdtemp(join(tmpdir(), "ngu-pwa-test-"));
  let browserContext;
  try {
    browserContext = await chromium.launchPersistentContext(profile, {
      channel: "msedge",
      headless: true,
    });
    let page = await browserContext.newPage();
    await page.goto("http://127.0.0.1:4173/");
    await page.getByRole("button", { name: "+ Действие" }).click();
    await page
      .getByLabel("Название", { exact: true })
      .fill("После перезапуска браузера");
    await submit(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const cdp = await browserContext.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors).toEqual([]);
    await cdp.detach();
    await browserContext.close();
    browserContext = await chromium.launchPersistentContext(profile, {
      channel: "msedge",
      headless: true,
    });
    await browserContext.setOffline(true);
    page = await browserContext.newPage();
    await page.goto("http://127.0.0.1:4173/");
    await expect(
      page.getByText("После перезапуска браузера", { exact: true }),
    ).toBeVisible();
  } finally {
    await browserContext?.close();
    if (
      dirname(resolve(profile)) === resolve(tmpdir()) &&
      profile.includes("ngu-pwa-test-")
    )
      await rm(profile, { recursive: true, force: true });
  }
});

test("reminder requests system API once and persists delivery receipt", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["notifications"]);
  await page.addInitScript(() => {
    (window as any).sent = [];
    ServiceWorkerRegistration.prototype.showNotification = async function (
      title,
      options,
    ) {
      (window as any).sent.push({ title, options });
    };
  });
  await page.reload();
  await nav(page, "Напоминания");
  await page.getByRole("button", { name: "+ Напоминание" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Проверка доставки");
  await page
    .getByLabel("Дата и время на этом компьютере")
    .fill("2020-01-01T10:00");
  await submit(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect
    .poll(() => page.evaluate(() => (window as any).sent.length))
    .toBe(1);
  expect(await page.evaluate(() => (window as any).sent[0].options.body)).toBe(
    "Проверка доставки",
  );
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.open("not-give-up", 1);
        request.onsuccess = () => {
          const db = request.result;
          const count = db
            .transaction("deliveries")
            .objectStore("deliveries")
            .count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result === 1);
          };
        };
      }),
  );
  await page.reload();
  await nav(page, "Напоминания");
  await page.getByRole("button", { name: "+ Напоминание" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Вторая доставка");
  await page
    .getByLabel("Дата и время на этом компьютере")
    .fill("2020-01-02T10:00");
  await submit(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).sent.map((n: any) => n.options.body)),
    )
    .toEqual(["Вторая доставка"]);
});

test("JSON download, restore, old backup compatibility and invalid import", async ({
  page,
}) => {
  await nav(page, "Настройки");
  await page.getByLabel("Компактный интерфейс").click();
  await expect(page.locator("html")).toHaveAttribute("data-compact", "true");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const download = await downloaded;
  const backup = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(backup.settings.compact).toBe(true);
  backup.settings.closeToTray = true;
  await page.getByLabel("Компактный интерфейс").click();
  await page
    .getByLabel("Файл резервной копии")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-compact", "true");
  await page.reload();
  await nav(page, "Настройки");
  await expect(page.getByLabel("Компактный интерфейс")).toBeChecked();
  await page
    .getByLabel("Файл резервной копии")
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schema":99}'),
    });
  await expect(page.getByRole("alert")).toContainText(
    "неподдерживаемая версия",
  );
  await expect(page.getByLabel("Компактный интерфейс")).toBeChecked();
});

test("installed app shell and IndexedDB reopen with all network offline", async ({
  page,
  context,
}) => {
  await page.getByRole("button", { name: "+ Действие" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Офлайн-задача");
  await submit(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await page.evaluate(
    async () => await (await fetch("manifest.webmanifest")).json(),
  );
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((i: any) => i.sizes === "512x512")).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Офлайн-задача", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Выполнено: Офлайн-задача" })
    .click();
  const other = await context.newPage();
  await other.goto("http://127.0.0.1:4173/");
  await page.close();
  await expect(
    other.getByRole("checkbox", { name: "Выполнено: Офлайн-задача" }),
  ).toBeChecked();
  for (const name of [
    "Тренировки",
    "Финансы",
    "Проекты",
    "Цели",
    "Напоминания",
    "Настройки",
  ]) {
    await nav(other, name);
    await expect(
      other.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(other.getByText("Готово к работе без интернета.")).toBeVisible();
});

test("mobile navigation and forms fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const name of [
    "Главная",
    "Тренировки",
    "Финансы",
    "Проекты",
    "Цели",
    "Напоминания",
    "Настройки",
  ]) {
    await nav(page, name);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await nav(page, "Главная");
  await page.getByRole("button", { name: "+ Действие" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Мобильная задача");
  await submit(page);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("concurrent tabs cannot silently overwrite newer data", async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await second.goto("http://127.0.0.1:4173/");
  await expect(second.locator("h1")).toBeVisible();
  await page.getByRole("button", { name: "+ Действие" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Первая вкладка");
  await submit(page);
  await second.getByRole("button", { name: "+ Действие" }).click();
  await second
    .getByLabel("Название", { exact: true })
    .fill("Устаревшая запись");
  await second.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(second.getByRole("dialog").getByRole("alert")).toContainText(
    "другой вкладке",
  );
  await second.reload();
  await expect(
    second.getByText("Первая вкладка", { exact: true }),
  ).toBeVisible();
  await expect(
    second.getByText("Устаревшая запись", { exact: true }),
  ).toHaveCount(0);
});

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(async () => {
    const request = indexedDB.open("not-give-up", 1);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("state")) {
          db.close();
          resolve(false);
          return;
        }
        const tx = db.transaction("state", "readwrite");
        const store = tx.objectStore("state");
        const get = store.get("current");
        let ready = false;
        get.onsuccess = () => {
          if (!get.result) return;
          const snapshot = get.result;
          for (const kind of [
            "tasks",
            "workouts",
            "transactions",
            "projects",
            "goals",
            "reminders",
          ])
            snapshot.data[kind] = [];
          store.put(snapshot, "current");
          ready = true;
        };
        tx.oncomplete = () => {
          db.close();
          resolve(ready);
        };
      };
    });
  });
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
});
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation")
    .getByRole("button", { name: new RegExp(name) })
    .click();
}
async function submit(page: Page) {
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function removeFirst(page: Page) {
  await page
    .getByRole("button", { name: "Удалить", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test("schedule create, edit, move, completion, reload and delete", async ({
  page,
}) => {
  await page.getByRole("button", { name: "+ Действие" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Прогулка");
  await submit(page);
  await page.getByRole("checkbox", { name: "Выполнено: Прогулка" }).click();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.screenshot({
    path: "test-results/home-preview.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page.getByLabel("Название", { exact: true }).fill("Длинная прогулка");
  await page.getByLabel("Дата", { exact: true }).fill("2027-01-15");
  await submit(page);
  await expect(
    page.getByText("На этот день пока ничего не запланировано."),
  ).toBeVisible();
  await page.getByLabel("Дата расписания").fill("2027-01-15");
  await expect(
    page.getByText("Длинная прогулка", { exact: true }),
  ).toBeVisible();
  await removeFirst(page);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});
test("workouts, money, project tasks, goals and reminders CRUD", async ({
  page,
}) => {
  await nav(page, "Тренировки");
  await page.getByRole("button", { name: "+ Упражнение" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Планка");
  await page.getByLabel("День недели").selectOption("4");
  await submit(page);
  await expect(page.getByText("Планка", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page.getByLabel("Подходы", { exact: true }).fill("4");
  await submit(page);
  await expect(page.getByText(/4 подхода/)).toBeVisible();
  await removeFirst(page);
  await nav(page, "Финансы");
  for (const [kind, amount] of [
    ["income", "100,29"],
    ["expense", "0,28"],
  ]) {
    await page.getByRole("button", { name: "+ Операция" }).click();
    await page
      .getByRole("combobox", { name: "Тип", exact: true })
      .selectOption(kind);
    await page.getByLabel("Категория").fill("Тест");
    await page.getByLabel("Сумма, ₽").fill(amount);
    await submit(page);
  }
  await expect(page.locator(".stats").getByText(/100,01/)).toBeVisible();
  await page
    .getByRole("button", { name: "Изменить", exact: true })
    .first()
    .click();
  await page.getByLabel("Сумма, ₽").fill("200");
  await submit(page);
  await removeFirst(page);
  await removeFirst(page);
  await nav(page, "Проекты");
  await page.getByRole("button", { name: "+ Проект" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Книга");
  await page.getByRole("button", { name: "+ Задача", exact: true }).click();
  await page.getByLabel("Название задачи 1").fill("Глава 1");
  await submit(page);
  await page.getByRole("checkbox", { name: "Выполнено: Глава 1" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "100",
  );
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page.getByLabel("Название задачи 1").fill("Глава 2");
  await page.getByLabel("Статус").selectOption("done");
  await submit(page);
  await expect(page.getByText("Глава 2", { exact: true })).toBeVisible();
  await removeFirst(page);
  await nav(page, "Цели");
  await page.getByRole("button", { name: "+ Цель" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Чтение");
  await page.getByLabel("Дедлайн", { exact: true }).fill("2027-01-01");
  await page.getByLabel("Единица измерения").fill("книг");
  await page.getByLabel("Целевой результат").fill("10");
  await page.getByLabel("Достигнуто").fill("2");
  await submit(page);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "20",
  );
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page.getByLabel("Достигнуто").fill("5");
  await submit(page);
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "50",
  );
  await removeFirst(page);
  await nav(page, "Напоминания");
  await page.getByRole("button", { name: "+ Напоминание" }).click();
  await page.getByLabel("Название", { exact: true }).fill("Проверка");
  await page
    .getByLabel("Дата и время на этом компьютере")
    .fill("2027-01-01T12:30");
  await submit(page);
  await page.getByRole("checkbox").click();
  await expect(page.getByText(/Отключено/)).toBeVisible();
  await page.getByRole("button", { name: "Изменить", exact: true }).click();
  await page.getByLabel("Название", { exact: true }).fill("Новая проверка");
  await submit(page);
  await removeFirst(page);
});
