# Подарис — MAX Mini App

Проект сохраняет существующий интерфейс в `index.html` и добавляет серверную основу для работы через MAX Bot API, Yandex Cloud и Redis.

## Архитектура

- **GitHub** — исходный код и история изменений.
- **MAX Bot** — точка входа, команды, уведомления и запуск Mini App.
- **MAX Mini App** — пользовательский интерфейс (текущий `index.html`).
- **Yandex Serverless Containers** — Node.js backend и HTTPS webhook.
- **Yandex Managed Redis** — быстрые данные приложения, кэш, состояния и очереди.

Для платёжного реестра, бухгалтерски значимой истории заказов и неизменяемых транзакций рекомендуется добавить PostgreSQL. Redis не следует считать единственным долговременным хранилищем финансовых данных.

## Локальный запуск

Требуется Node.js 20.19+.

```bash
npm install
cp .env.example .env
npm run dev
```

Откройте `http://localhost:8080`.

Проверка backend: `GET /api/health`.

Без `REDIS_URL` сервер запускается в режиме разработки, а health endpoint сообщает `redis: not_configured`.

## Переменные окружения

Скопируйте `.env.example` в `.env` и заполните параметры. Не добавляйте реальные токены, пароли Redis или секреты в GitHub.

В production передавайте секреты через переменные окружения контейнера и/или Yandex Lockbox.

## Развёртывание в Yandex Cloud

1. Создать Container Registry.
2. Собрать Docker-образ из корня репозитория и отправить его в Registry.
3. Создать Serverless Container на основе образа.
4. Настроить доступ контейнера к сети, где расположен Managed Redis.
5. Передать `REDIS_URL` и MAX credentials как секреты/переменные окружения.
6. Установить публичный HTTPS URL контейнера как адрес webhook бота.
7. В настройках MAX-бота указать HTTPS URL Mini App.

Контейнер слушает порт из переменной `PORT` (по умолчанию 8080).

## Текущий статус интеграций

- [x] Существующий интерфейс Mini App сохранён.
- [x] Node.js HTTP backend.
- [x] Health endpoint.
- [x] Подключение Redis через URL.
- [x] Приёмник MAX webhook.
- [ ] Проверка подписи/инициализационных данных Mini App по актуальной спецификации MAX.
- [ ] Регистрация webhook-подписки MAX.
- [ ] Команды бота и кнопка открытия Mini App.
- [ ] Модели пользователей, подарков и заказов.
- [ ] Платёжный провайдер и подтверждение оплаты.
- [ ] Production deployment pipeline.

Webhook сейчас только принимает и журналирует события. Он намеренно не выдаёт подарки и не подтверждает платежи. Эти действия будут добавлены после настройки и проверки авторизации MAX и платёжных уведомлений.

## Полезные ссылки

- MAX Bot API: https://dev.max.ru/docs-api
- MAX Mini Apps: https://dev.max.ru/help/miniapps
- Yandex Serverless Containers: https://yandex.cloud/ru/docs/serverless-containers/
- Yandex Managed Redis: https://yandex.cloud/ru/docs/managed-redis/
