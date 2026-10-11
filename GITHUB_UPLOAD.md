# Обновление GitHub и публикация на Vercel

## Причина TS18003

TS18003 означает, что TypeScript не нашёл входных файлов по настройкам выбранного `tsconfig.json`. Пути `include` отсчитываются от папки этого файла.

В локальном проекте `src/main.tsx`, `src/App.tsx` и остальные исходники существуют; `.gitignore` не исключает `src`. Локальная сборка проходит. Следовательно, сообщение Vercel нельзя воспроизвести на этой структуре: нужно исправить состав загруженного коммита или выбранную папку проекта. Без удалённого репозитория и полного лога нельзя отличить неполную загрузку от неверного `Root Directory` или другого `tsconfig.json`.

`vercel.json` задаёт Vite, `npm ci`, `npm run build` и выходную папку `dist`. Он не может восстановить отсутствующие в GitHub исходники. `tsconfig.json` явно перечисляет шаблоны `.ts` и `.tsx`; отключать TypeScript или удалять его проверку из сборки не нужно.

## Файлы для загрузки

Загрузите следующие файлы и папки **в корень существующего репозитория**, сохранив вложенность и регистр имён:

```text
.gitignore
package.json
package-lock.json
index.html
tsconfig.json
vite.config.ts
vercel.json
src/
  App.tsx
  main.tsx
  model.ts
  model.test.ts
  pwa.tsx
  quotes.ts
  storage.ts
  storage.test.ts
  style.css
  vite-env.d.ts
public/
  manifest.webmanifest
  icons/
    apple-touch-icon.png
    icon-192.png
    icon-512.png
scripts/
  build-sw.mjs
  sw-template.js
```

Также загрузите документацию и тесты, чтобы сохранить полный актуальный проект:

```text
README.md
GITHUB_UPLOAD.md
DECISIONS.md
CHANGELOG.md
VERIFICATION.md
playwright.config.ts
tests/ui/app.spec.ts
```

Не загружайте `node_modules/`, `dist/`, `test-results/`, `playwright-report/`, `.vercel/`, логи. `src-tauri/` и `tests/sqlite.test.mjs` — история прежней версии, для PWA не нужны; уже находящиеся в репозитории файлы удалять не требуется.

`dist` подходит для прямого статического хостинга, но при сборке через GitHub + Vercel нужны **исходники**. Не переносите содержимое `src/` в корень и не создавайте дополнительную папку `NGU/` над проектом.

## Самый простой способ обновить существующий репозиторий

1. Откройте нужный репозиторий GitHub и ветку, подключённую к Vercel. Перейдите в корень.
2. Выберите **Add file → Upload files**. Из Проводника перетащите целиком папки `src`, `public`, `scripts` и перечисленные корневые файлы. Загружайте содержимое рабочей папки, а не саму папку `NGU`. GitHub обновит файлы по совпадающим путям. Не загружайте ZIP вместо исходников.
3. Нажмите **Commit changes**. После загрузки откройте `src/main.tsx` в GitHub и убедитесь, что он содержит код. Рядом с папкой `src` должны находиться `package.json`, `tsconfig.json`, `index.html` и `vercel.json`.
4. В Vercel → проект → **Settings → Build and Deployment** проверьте `Root Directory`: корень репозитория (оставьте поле пустым). Не `src` и не `dist`. Если существующий репозиторий намеренно содержит приложение в подкаталоге, выберите именно каталог, где лежат его `package.json` и `tsconfig.json`, и обновляйте файлы там, без создания второй копии.
5. Настройки сборки берутся из `vercel.json`: Vite, `npm ci`, `npm run build`, `dist`. Выберите Node.js **24.x**, соответствующий проверенному локальному окружению.
6. Проверьте deployment нового коммита. Если автоматическая сборка не запустилась, выполните Redeploy для актуального коммита, при необходимости отключив использование старого Build Cache.

Перед загрузкой проверка: `npm ci`, затем `npm run build`. Успех — наличие `dist/index.html`, `dist/sw.js`, `dist/manifest.webmanifest`, файлов `dist/assets/` и иконок.

Изменения в настройках удалённого проекта Vercel и содержимое GitHub этой локальной правкой автоматически не обновляются. В текущей рабочей папке нет `.git` и адреса remote; push и redeploy здесь не выполнялись.

Справка: [TypeScript include](https://www.typescriptlang.org/tsconfig/#include), [настройки сборки Vercel](https://vercel.com/docs/builds/configure-a-build), [vercel.json](https://vercel.com/docs/project-configuration/vercel-json).
