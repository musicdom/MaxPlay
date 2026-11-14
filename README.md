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
  - `POST /api/max/webhook` — временный приёмник событий MAX.

При создании версии функции добавьте зависимости из `package.json`, переменные окружения и сетевое подключение к VPC, в которой находится Managed Redis. Cloud Functions поддерживает доступ к ресурсам пользовательской сети через VPC. См. документацию Yandex Cloud: https://yandex.cloud/ru/docs/functions/concepts/networking

## Переменные окружения

- `REDIS_URL` — строка подключения к Managed Redis/Valkey; использовать TLS (`rediss://`), если он включён на кластере.
- `MAX_BOT_TOKEN` — токен MAX-бота.
- `MAX_WEBHOOK_SECRET` — секрет для проверки webhook, когда она будет реализована.
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
- [ ] Проверка подписи/инициализационных данных Mini App по актуальной спецификации MAX.
- [ ] Регистрация webhook-подписки MAX.
- [ ] Команды бота и кнопка открытия Mini App.
- [ ] Модели и операции пользователей, подарков и заказов в Redis.
- [ ] Платёжный провайдер, идемпотентность и подтверждение оплаты.

Webhook пока только принимает и журналирует события. Он намеренно не выдаёт подарки и не подтверждает платежи. Эти действия будут добавлены после настройки и проверки авторизации MAX и платёжных уведомлений.

## Документация

- MAX Bot API: https://dev.max.ru/docs-api
- MAX Mini Apps: https://dev.max.ru/help/miniapps
- Yandex Cloud Functions: https://yandex.cloud/ru/docs/functions/
- Yandex Managed Redis / Valkey: https://yandex.cloud/ru/docs/managed-valkey/
