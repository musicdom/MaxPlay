# ЛовиДай — MAX Mini App

ЛовиДай — мини-приложение для получения, открытия, хранения и передачи подарков внутри MAX.

## Архитектура

- **GitHub** — исходный код и история изменений: `musicdom/MaxPlay`, ветка `main`.
- **GitHub Pages** — пользовательский интерфейс: `index.html` и `api-config.js`.
- **MAX Bot** — запуск приложения, согласия, запрос контакта и личные уведомления.
- **Yandex Cloud Functions** — backend/API, файл `handler.cjs`, entry point `handler.handler`, runtime Node.js 22.
- **Upstash Redis REST** — рекомендуемое подключение Redis для текущей конфигурации Yandex Function: `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN`.
- В `handler.cjs` сохранена совместимость с Yandex Managed Redis через `REDIS_URL`. Если `REDIS_URL` заполнен, он имеет приоритет, и Upstash REST не используется.

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

**Redis — текущий вариант подключения через Upstash REST:**

- `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN` — задайте обе переменные в Yandex Cloud Function.
- Оставьте `REDIS_URL` пустым. Если он заполнен, обработчик выберет Yandex Managed Redis и не будет использовать Upstash.

**Совместимость с Yandex Managed Redis:**

- `REDIS_URL` — строка подключения к Managed Redis/Valkey (обычно `rediss://...` при TLS). Этот вариант требует сетевого доступа функции к соответствующей VPC.

**MAX и доступ к приложению:**

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

Для локального скрипта регистрации webhook дополнительно задаётся `MAX_WEBHOOK_URL` — полный HTTPS URL функции с query-параметром `route=webhook`.

## Развёртывание

### Frontend

GitHub Pages публикует `index.html`, `api-config.js`, каталог `image/` и `legal/` из репозитория. Адрес backend задаётся в `api-config.js`; не заменяйте его адресом GitHub Pages.

### Backend в Yandex Cloud

1. Используйте runtime Node.js 22 и entry point `handler.handler`.
2. Загрузите актуальные `handler.cjs`, `package.json` и каталог `certs/`.
3. Установите зависимости из `package.json` (пакет `redis` нужен обработчику, даже если выбран Upstash REST).
4. Для текущего подключения Upstash задайте `UPSTASH_REDIS_REST_URL` и `UPSTASH_REDIS_REST_TOKEN`, а `REDIS_URL` оставьте пустым. VPC с Managed Redis для этого варианта не требуется; функции нужен исходящий HTTPS-доступ к Upstash.
5. Если вместо Upstash намеренно используется Yandex Managed Redis, задайте `REDIS_URL` и подключите функцию к VPC, где доступен этот Redis.
6. Добавьте MAX-переменные окружения из раздела выше.
7. Создайте HTTPS trigger.
8. Проверьте корневой URL функции с query-параметром `?route=health`: ожидается `ok: true` и `redis: "ok"`.
9. Зарегистрируйте MAX webhook на URL функции с `?route=webhook`.
10. Не включайте YooMoney в production, пока владелец не настроит receiver, секрет уведомлений и callback URL и не проверит фактический callback. Формат callback URL: `?route=api&endpoint=yoomoney%2Fnotify`.

При обновлении backend переносите в Yandex актуальный `handler.cjs` вместе с зависимостями и каталогом `certs/`. Обновление `index.html` выполняется отдельно через публикацию GitHub Pages. `api-config.js` не заменяйте содержимым backend-файла.

## Жизненный цикл подарка

1. Отправитель отправляет подарок конкретному пользователю или создаёт ссылку на передачу уже имеющегося подарка.
2. Первое открытие ссылки фиксирует `linkOpenedAt` и запускает только таймер отправителя до раскрытия содержимого (`opensAt`). Повторные открытия не сбрасывают этот таймер.
3. Ограничения в 12 часов на получение больше нет. Получатель может забрать открытый по ссылке подарок позже; старые записи, помеченные как истёкшие прежним 12-часовым сроком получения, восстанавливаются обновлённым backend.
4. После получения подарок переходит в «Мои подарки». Срока на решение «оставить себе или передать дальше» тоже больше нет.
5. Когда таймер отправителя завершён, содержимое всё равно не раскрывается автоматически: получатель нажимает «Открыть подарок».
6. После открытия получатель может оставить подарок себе или передать дальше. Передача перемещает тот же подарок новому получателю, а не создаёт новый; для новой передачи таймер раскрытия запускается при первом открытии новой ссылки.
7. Подарки не сгорают по прежним 12-часовым срокам. Таймер отправителя — это задержка раскрытия, а не срок действия подарка.

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

`/api/shop/order` содержит серверный сценарий создания pending-заказа и подготовки ссылки YooMoney. Наличие этого кода не означает, что реальная оплата подключена или готова к приёму денег. До отдельной настройки платёжного аккаунта владельцем, заполнения `YOOMONEY_RECEIVER` и `YOOMONEY_NOTIFICATION_SECRET`, установки callback URL и успешного теста фактического уведомления считайте оплату отключённой.

Подарки разрешено начислять только после серверной проверки подписи YooMoney, операции, валюты и суммы списания с покупателя. Возврат пользователя на success URL сам по себе не является подтверждением платежа. Для повторных уведомлений предусмотрена идемпотентная обработка и защита от двойного начисления.

## Важные ограничения и проверка

- Юридические страницы в `legal/` могут содержать шаблонные или незаполненные сведения. До публичного запуска заполните данные оператора и проверьте документы юридически.
- Ответ `/api/health` подтверждает PING Redis, но не заменяет проверку Lua-скриптов, списков, блокировок и полного пользовательского сценария.
- Изменения в GitHub сами по себе не подтверждают, что новая версия `handler.cjs` уже загружена в Yandex Cloud.
- После каждого backend-релиза проверяйте двумя MAX-аккаунтами: отправку, открытие ссылки, таймер раскрытия отправителя, получение без ограничения по времени, открытие, сохранение или передачу и уведомления от бота.
- Не проверяйте реальные платежи до настройки владельцем платёжного аккаунта и callback. После подключения отдельно проверьте подпись, валюту, сумму списания, повторное уведомление и ровно одно фактическое начисление подарков.

## Документация

- MAX Bot API: https://dev.max.ru/docs-api
- MAX Mini Apps: https://dev.max.ru/help/miniapps
- Yandex Cloud Functions: https://yandex.cloud/ru/docs/functions/
- Yandex Managed Redis / Valkey: https://yandex.cloud/ru/docs/managed-valkey/
