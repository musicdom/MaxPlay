# Подарис — MAX Mini App

Проект содержит интерфейс Mini App в `index.html` и серверную основу для MAX Bot API, Yandex Cloud Functions и Redis.

## Зафиксированная архитектура

- **GitHub** — исходный код и история изменений.
- **MAX Bot** — точка входа, команды, уведомления и запуск Mini App.
- **MAX Mini App** — пользовательский интерфейс (`index.html`).
- **Yandex Cloud Functions** — serverless backend/API и HTTPS-обработчик webhook.
- **Yandex Managed Redis (Valkey)** — основное хранилище данных приложения.

Redis используется как основное хранилище на старте. Для него необходимо включить persistence (AOF) и регулярные резервные копии. Для платёжных операций дополнительно реализовать идемпотентную обработку уведомлений, журнал статусов и сверку платежей.

## Локальный запуск

Требуется Node.js 20.19+.

```bash
npm install
cp .env.example .env
npm run dev
```

Локальный Express-сервер запускается по адресу `http://localhost:8080`. Он нужен для локальной разработки; production backend работает как Yandex Cloud Function.

## Yandex Cloud Functions

- Runtime: Node.js 22.
- Entry point: `handler.handler`.
- Файл обработчика: `handler.cjs`.
- HTTP endpoints:
  - `GET /api/health` — проверка функции и Redis.
  - `GET /api/config` — публичная конфигурация Mini App.
  - `POST /api/auth` — проверка `WebAppData` (MAX Mini App init data) и создание/обновление профиля пользователя в Redis.
  - `POST /api/consent/status` — проверка согласия с текущими редакциями документов.
  - `POST /api/consent/accept` — сохранение согласия с двумя документами в Redis.
  - `POST /api/max/webhook` — обработка `bot_started`, `/start` и callback-кнопки согласия; проверяет `X-Max-Bot-Api-Secret`.
  - `POST /api/max/webhook` — временная заглушка; не регистрировать её в MAX до реализации проверки подлинности webhook.

При создании версии функции добавьте зависимости из `package.json`, переменные окружения и сетевое подключение к VPC, в которой находится Managed Redis. Cloud Functions поддерживает доступ к ресурсам пользовательской сети через VPC. См. документацию Yandex Cloud: https://yandex.cloud/ru/docs/functions/concepts/networking

## Переменные окружения

- `REDIS_URL` — строка подключения к Managed Redis/Valkey; использовать TLS (`rediss://`), если он включён на кластере.
- `MAX_BOT_TOKEN` — токен MAX-бота; используется сервером для проверки подписи `WebAppData`.
- `MAX_AUTH_MAX_AGE_SECONDS` — необязательный максимальный возраст стартовых данных Mini App в секундах (по умолчанию 86400).
- `MAX_WEBHOOK_SECRET` — секрет MAX webhook (5–256 символов из A–Z, a–z, 0–9, `_` и `-`); должен совпадать с `secret` при создании подписки.
- `LEGAL_BASE_URL` — публичная базовая ссылка на папку с HTML-документами.
- `USER_AGREEMENT_VERSION` и `PRIVACY_POLICY_VERSION` — версии документов; изменение версии потребует повторного согласия.
- `MAX_AUTH_MAX_AGE_SECONDS` — максимальный возраст `WebAppData` (по умолчанию 86400 секунд).
- `ALLOWED_ORIGIN` — точный origin GitHub Pages для CORS.
- `MAX_MINI_APP_URL` — публичный URL Mini App.

Не добавляйте реальные токены, пароли Redis или секреты в GitHub. Передавайте их в Cloud Functions через переменные окружения и/или Yandex Lockbox.

## Развёртывание в Yandex Cloud

1. Создать VPC с подсетями в нужных зонах доступности.
2. Создать Managed Redis (Valkey) в этой сети, включить TLS, AOF persistence и резервное копирование.
3. Создать сервисный аккаунт для Cloud Functions с минимально необходимыми ролями.
4. Создать Cloud Function с runtime Node.js 22.
5. Загрузить файлы проекта и зависимости из `package.json`; указать entry point `handler.handler`.
6. Привязать функцию к VPC, в которой находится Redis.
7. Передать секреты и `REDIS_URL` в переменные окружения/Lockbox.
8. Создать HTTP trigger для функции и проверить `/api/health`.
9. Указать HTTPS endpoint webhook в настройках MAX-бота, когда будет готова проверка подлинности.

## Текущий статус интеграций

- [x] Существующий интерфейс Mini App сохранён.
- [x] Локальный Node.js/Express backend для разработки.
- [x] Cloud Functions handler (Node.js 22).
- [x] HTTP endpoints health/config/webhook placeholder.
- [x] Подключение Redis через `REDIS_URL` в обоих режимах.
- [ ] Создать Managed Redis в Yandex Cloud и подключить его к функции.
- [ ] Создать Cloud Function и HTTP trigger.
- [x] Серверная проверка подписи `WebAppData` Mini App по алгоритму MAX; проверка срока действия и защита от повторяющихся параметров.
- [x] Создание/обновление профиля пользователя в Redis после успешной авторизации.
- [ ] Подключить Mini App к `POST /api/auth` и отображать подтверждённый профиль пользователя.
- [ ] Регистрация webhook-подписки MAX.
- [x] Базовая обработка `/start` и `bot_started` с запросом согласия.
- [x] Приём согласия через callback-кнопку бота и через Mini App.
- [x] Проверка текущих версий документов и хранение даты/источника согласия в Redis.
- [ ] Заполнить и проверить юридические документы, затем опубликовать их окончательные редакции.
- [ ] Подключить фактический URL Yandex Cloud Function в `api-config.js` и настроить MAX webhook subscription.
- [ ] Модели и операции пользователей, подарков и заказов в Redis.
- [ ] Платёжный провайдер, идемпотентность и подтверждение оплаты.

Авторизация Mini App выполняется только на сервере: клиент передаёт подписанные данные `window.WebApp.initData` в JSON-поле `initData`. Сервер извлекает `WebAppData` (если MAX передал его обёрнутым во фрагмент URL), проверяет подпись и `auth_date`, затем сохраняет минимальный профиль в Redis по ключу `user:<MAX user id>`. Не передавайте `initDataUnsafe` вместо подписанной строки.

Согласие хранится в Redis по ключу `consent:<MAX user id>`. В записи сохраняются версии пользовательского соглашения и политики конфиденциальности, время принятия и канал принятия (`bot` или `mini_app`). Доступ разрешается только при совпадении обеих версий с текущими версиями из переменных окружения. При обновлении версии пользователь принимает документы повторно.

Webhook проверяет заголовок `X-Max-Bot-Api-Secret`. При создании подписки MAX необходимо передать тот же секрет в поле `secret` и подписать события `bot_started`, `message_created`, `message_callback`. MAX требует HTTPS и успешный ответ HTTP 200; см. официальную документацию: https://dev.max.ru/docs-api/methods/POST/subscriptions.

Webhook пока остаётся заглушкой и не должен регистрироваться в MAX. Он намеренно не выдаёт подарки и не подтверждает платежи. Эти действия будут добавлены после реализации отдельной проверки подлинности webhook и платёжных уведомлений.

## Документация

- MAX Bot API: https://dev.max.ru/docs-api
- MAX Mini Apps: https://dev.max.ru/help/miniapps
- Yandex Cloud Functions: https://yandex.cloud/ru/docs/functions/
- Yandex Managed Redis / Valkey: https://yandex.cloud/ru/docs/managed-valkey/
