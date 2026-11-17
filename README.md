# ЛовиДай — MAX Mini App

ЛовиДай — мини-приложение для получения, открытия, хранения и передачи подарков внутри MAX.

## Архитектура

- **GitHub** — исходный код и история изменений: `musicdom/MaxPlay`, ветка `main`.
- **GitHub Pages** — пользовательский интерфейс: `index.html` и `api-config.js`.
- **MAX Bot** — запуск приложения, согласия, запрос контакта и личные уведомления.
- **Yandex Cloud Functions** — backend/API, файл `handler.cjs`, entry point `handler.handler`, runtime Node.js 22.
- **Yandex Managed Redis** — основное хранилище. Подключение выполняется через `REDIS_URL` (для TLS — обычно `rediss://...`).

В коде также сохранён совместимый резервный адаптер Upstash REST: он используется, только если `REDIS_URL` не задан и присутствуют обе переменные Upstash.

## Локальный запуск

Требуется Node.js 22.

```bash
npm install
cp .env.example .env
npm run dev
```

Локальный Express-сервер запускается на `http://localhost:8080`. Production API работает в Yandex Cloud Functions.

Регистрация webhook из локального окружения:

```bash
npm run register:webhook
```

Для скрипта нужны `MAX_BOT_TOKEN`, `MAX_WEBHOOK_SECRET` и `MAX_WEBHOOK_URL`. В список событий входят `bot_started`, `message_created`, `message_callback`, `bot_added` и `bot_removed`.

## API

Публичные GET-маршруты:

- `GET /api/health` — проверка доступности функции и Redis.
- `GET /api/config` — название приложения и версии юридических документов.

Авторизованные POST-маршруты (подписанные данные запуска MAX передаются в `initData`):

- `/api/auth`
- `/api/consent/status`, `/api/consent/accept`
- `/api/gifts/list`, `/api/gifts/link-preview`, `/api/gifts/send`, `/api/gifts/claim`, `/api/gifts/open`, `/api/gifts/keep`, `/api/gifts/forward`
- `/api/gifts/starter/status`, `/api/gifts/starter/verify-subscription`
- `/api/shop/order`
- `/api/admin/status`, `/api/admin/diagnostics`, `/api/admin/register-webhook`, `/api/admin/logs`, `/api/admin/users`, `/api/admin/user`, `/api/admin/user/reset`, `/api/admin/user/gift`

Webhook-маршруты:

- MAX: `POST /api/max/webhook`; секрет проверяется по заголовку `X-Max-Bot-Api-Secret`.
- YooMoney: `POST /api/yoomoney/notify`; уведомление проверяется по платёжной подписи.

`api-config.js` направляет запросы Mini App в одну Yandex Cloud Function через query-параметры. Для MAX webhook используется `?route=webhook`. Для YooMoney notification URL должен указывать на `?route=api&endpoint=yoomoney%2Fnotify`.

## Переменные окружения

Настраиваются в Yandex Cloud Functions или через Lockbox. Не добавляйте реальные секреты в GitHub.

**Обязательные для основной работы:**

- `REDIS_URL` — строка подключения к Yandex Managed Redis/Valkey. При включённом TLS используйте выданную Yandex строку с `rediss://`.
- `MAX_BOT_TOKEN` — токен MAX-бота.
- `MAX_WEBHOOK_SECRET` — секрет MAX webhook; 5–256 символов из латинских букв, цифр, `_` и `-`.
- `MAX_MINI_APP_URL` — публичная ссылка Mini App, используемая в сообщениях бота.
- `ALLOWED_ORIGIN` — origin GitHub Pages, например `https://musicdom.github.io`.

**Юридические документы и авторизация:**

- `LEGAL_BASE_URL` — публичная базовая ссылка на папку `legal/`.
- `USER_AGREEMENT_VERSION`, `PRIVACY_POLICY_VERSION` — версии документов.
- `MAX_AUTH_MAX_AGE_SECONDS` — максимальный возраст `initData` в секундах; по умолчанию 86400.

**Администрирование:**

- `ADMIN_MAX_IDS` — MAX ID администраторов через запятую.

**YooMoney:**

- `YOOMONEY_RECEIVER` — номер кошелька-получателя.
- `YOOMONEY_NOTIFICATION_SECRET` — секретное слово уведомлений YooMoney.
- `YOOMONEY_SUCCESS_URL` — необязательная ссылка возврата после оплаты.

**Необязательный альтернативный Redis:**

- `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN` — используются только при отсутствии `REDIS_URL`.

Для локального скрипта регистрации webhook дополнительно задаётся `MAX_WEBHOOK_URL` — полный HTTPS URL функции с query-параметром `route=webhook`.

## Развёртывание

### Frontend

GitHub Pages публикует `index.html`, `api-config.js`, каталог `image/` и `legal/` из репозитория. Адрес backend задаётся в `api-config.js`; не заменяйте его адресом GitHub Pages.

### Backend в Yandex Cloud

1. Используйте runtime Node.js 22 и entry point `handler.handler`.
2. Загрузите актуальные `handler.cjs`, `package.json` и каталог `certs/`.
3. Установите зависимости из `package.json` (включая пакет `redis`).
4. Подключите функцию к VPC, в которой доступен Managed Redis.
5. Добавьте переменные окружения из раздела выше.
6. Создайте HTTPS trigger.
7. Проверьте `/api/health`: ожидается `ok: true` и `redis: "ok"`.
8. Зарегистрируйте MAX webhook на URL функции с `?route=webhook`.
9. В настройках YooMoney укажите URL функции с `?route=api&endpoint=yoomoney%2Fnotify` и тот же секрет, что задан в `YOOMONEY_NOTIFICATION_SECRET`.

При обновлении backend переносите в Yandex актуальный `handler.cjs` вместе с зависимостями и каталогом `certs/`. Обновление `index.html` выполняется отдельно через публикацию GitHub Pages. `api-config.js` не заменяйте содержимым backend-файла.

## Жизненный цикл подарка

1. Отправитель отправляет подарок конкретному пользователю или создаёт одноразовую ссылку на передачу уже имеющегося подарка.
2. При первом открытии ссылки backend атомарно запускает два независимых отсчёта: 12 часов на получение и таймер отправителя до раскрытия содержимого. Повторные открытия не сбрасывают время.
3. До нажатия «Оставить себе» подарок отображается в «Мне прислали». Если 12 часов истекли до получения, подарок сгорает.
4. При получении подарок переходит в «Мои подарки», таймер получения отключается, а исходный `opensAt` сохраняется.
5. Даже если таймер отправителя уже закончился, содержимое не раскрывается автоматически: получатель должен нажать «Открыть подарок».
6. После открытия начинается 12-часовое окно решения: оставить подарок себе или передать дальше.
7. Передача — это перемещение существующего подарка новому получателю, а не создание нового подарка за кредиты. Для новой передачи запускаются новые таймеры при первом открытии новой ссылки.

Списки «Мне прислали», «Мои подарки» и «Отправленные» формируются отдельно. Подарки, выданные администрацией или полученные из магазина, попадают в коллекцию.

## Задания и стартовые подарки

Стартовые награды выдаются однократно за три отдельные проверки:

1. Принятие актуальных Пользовательского соглашения и Политики конфиденциальности.
2. Подтверждение номера телефона через кнопку MAX `request_contact` и проверку подписи контакта.
3. Подтверждённая подписка на канал ЛовиДай.

Для проверки третьего задания бот должен быть добавлен в канал. События `bot_added` и `bot_removed` сохраняют и очищают ID канала в Redis. Подписка проверяется через MAX Bot API.

## Магазин и оплата

Каталог и суммы задаются сервером, а не доверяются клиенту:

- отдельный геймпад — 200 ₽;
- коллекция из шести геймпадов — 999 ₽;
- подарок «ЛовиДай» — 50 ₽;
- остальные четыре подарка серии — по 100 ₽;
- коллекция из пяти подарков ЛовиДай — 599 ₽.

`/api/shop/order` создаёт pending-заказ в Redis и возвращает ссылку YooMoney. Подарки начисляются только после проверенного уведомления об оплате. Для повторных уведомлений используются блокировка с уникальным токеном и детерминированные ID подарков, чтобы не начислять один заказ дважды.

Перед приёмом реальных платежей обязательно проверьте receiver, секрет уведомлений, URL уведомлений и тестовую оплату с фактическим webhook.

## Важные ограничения и проверка

- Юридические страницы в `legal/` могут содержать шаблонные или незаполненные сведения. До публичного запуска заполните данные оператора и проверьте документы юридически.
- Ответ `/api/health` подтверждает PING Redis, но не заменяет проверку Lua-скриптов, списков, блокировок и полного пользовательского сценария.
- Изменения в GitHub сами по себе не подтверждают, что новая версия `handler.cjs` уже загружена в Yandex Cloud.
- После каждого backend-релиза проверяйте два MAX-аккаунта: отправку, открытие ссылки, оба таймера, получение, открытие, передачу, истечение срока и уведомления от бота.
- Платёжный сценарий проверяйте отдельно: создание заказа, callback YooMoney, подпись, сумму, повторное уведомление и фактическое начисление подарков.

## Документация

- MAX Bot API: https://dev.max.ru/docs-api
- MAX Mini Apps: https://dev.max.ru/help/miniapps
- Yandex Cloud Functions: https://yandex.cloud/ru/docs/functions/
- Yandex Managed Redis / Valkey: https://yandex.cloud/ru/docs/managed-valkey/
