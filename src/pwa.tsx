import { useEffect, useState } from "react";
import { delivery, loadData } from "./storage";

export const workerReady: Promise<ServiceWorkerRegistration | null> =
  "serviceWorker" in navigator && import.meta.env.PROD
    ? navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .then(() => navigator.serviceWorker.ready)
    : Promise.resolve(null);
// Consumers report registration errors; keep startup free of unhandled rejections.
void workerReady.catch(() => {});
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let installEvent: InstallEvent | null = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installEvent = event as InstallEvent;
  window.dispatchEvent(new Event("ngu-install-ready"));
});
export function PwaSettings() {
  const [install, setInstall] = useState(installEvent);
  const [status, setStatus] = useState("Подготовка офлайн-режима…");
  const [installed, setInstalled] = useState(
    matchMedia("(display-mode: standalone)").matches ||
      !!(navigator as Navigator & { standalone?: boolean }).standalone,
  );
  useEffect(() => {
    const ready = () => setInstall(installEvent);
    const done = () => {
      setInstalled(true);
      setInstall(null);
    };
    window.addEventListener("ngu-install-ready", ready);
    window.addEventListener("appinstalled", done);
    void workerReady
      .then((r) =>
        setStatus(
          r
            ? "Готово к работе без интернета."
            : "Офлайн-кэш доступен в собранной версии приложения.",
        ),
      )
      .catch((e) =>
        setStatus(`Не удалось подготовить офлайн-режим: ${String(e)}`),
      );
    return () => {
      window.removeEventListener("ngu-install-ready", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  return (
    <section className="panel settings">
      <h2>Установка и офлайн-режим</h2>
      <p className="muted" role="status">
        {status}
      </p>
      {installed ? (
        <p className="hint">Приложение открыто отдельно от браузера.</p>
      ) : install ? (
        <button
          className="primary"
          onClick={() => {
            void install
              .prompt()
              .then(() => install.userChoice)
              .then(() => {
                installEvent = null;
                setInstall(null);
              })
              .catch((e) => setStatus(String(e)));
          }}
        >
          Установить приложение
        </button>
      ) : (
        <p className="hint">
          Android / ПК: меню браузера → «Установить приложение» или «Добавить на
          главный экран». iPhone / iPad: Safari → «Поделиться» → «На экран
          Домой». Для установки откройте приложение по HTTPS.
        </p>
      )}
      <p className="hint">
        Данные хранятся в этом браузере на этом устройстве. Очистка данных сайта
        удалит их. Сохраняйте JSON-копии; синхронизации между устройствами нет.
      </p>
      <button
        onClick={() => {
          void (navigator.storage?.persist?.() ?? Promise.resolve(false))
            .then((ok) =>
              setStatus(
                ok
                  ? "Браузер разрешил постоянное хранение данных."
                  : "Браузер не предоставил постоянное хранение. Регулярно экспортируйте JSON.",
              ),
            )
            .catch((e) => setStatus(String(e)));
        }}
      >
        Защитить данные от автоматической очистки
      </button>
    </section>
  );
}
export async function testNotification() {
  if (!("Notification" in window) || !("serviceWorker" in navigator))
    throw new Error(
      "Системные уведомления недоступны в этом браузере. На iPhone установите PWA на экран Домой.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Уведомления не разрешены. Измените разрешение в настройках браузера.",
    );
  const registration = await workerReady;
  if (!registration)
    throw new Error("Откройте собранную PWA для системных уведомлений.");
  await registration.showNotification("Not Give Up", {
    body: "Системные уведомления разрешены.",
    icon: new URL("icons/icon-192.png", registration.scope).href,
    tag: "ngu-test",
  });
}
export function startReminders(onError: (message: string) => void) {
  let active = true,
    checking = false;
  const check = async () => {
    if (
      !active ||
      checking ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    checking = true;
    try {
      const registration = await workerReady;
      if (!registration || !active) return;
      const send = async () => {
        const { data } = await loadData();
        for (const r of data.reminders) {
          if (!active) break;
          const key = `${r.id}|${r.at}`;
          if (
            r.enabled &&
            Date.parse(r.at) <= Date.now() &&
            !(await delivery(key))
          ) {
            await registration.showNotification("Not Give Up", {
              body: r.title,
              tag: key,
              icon: new URL("icons/icon-192.png", registration.scope).href,
            });
            await delivery(key, true);
          }
        }
      };
      if (navigator.locks) await navigator.locks.request("ngu-reminders", send);
      else await send();
    } catch (e) {
      if (active) onError(String(e));
    } finally {
      checking = false;
    }
  };
  const wake = () => {
    void check();
  };
  const timer = setInterval(wake, 15000);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
  wake();
  return () => {
    active = false;
    clearInterval(timer);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", wake);
  };
}
