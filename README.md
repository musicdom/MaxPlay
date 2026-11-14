# Подарис — MAX Mini App

Проект содержит интерфейс Mini App в `index.html` и серверную основу для MAX Bot API, Yandex Cloud и Redis.

## Зафиксированная архитектура

- **GitHub** — исходный код и история изменений.
- **MAX Bot** — точка входа, команды, уведомления и запуск Mini App.
- **MAX Mini App** — пользовательский интерфейс (`index.html`).
- **Yandex Cloud** — backend/API и инфраструктура.
- **Yandex Managed Redis (Valkey)** — основное хранилище данных приложения.

Для Redis в production необходимо включить persistence (AOF; `persistenceMode=ON`) и настроить регулярные резервные копии. Не использовать режим только RAM для пользовательских данных, подарков и заказов. Для платёжных операций в приложении дополнительно реализовать идемпотентную обработку уведомлений, журнал статусов и сверку платежей.

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

В production передавайте секреты через переменные окружения контейнера и/или Yandex Lockbox. Для Managed Redis используйте TLS-подключение (`rediss://`) и приватную сетевую доступность для backend.

## Развёртывание в Yandex Cloud

1. Создать сеть и Managed Redis (Valkey) в подходящей зоне доступности.
2. Включить TLS, persistence AOF (`ON`) и резервное копирование.
3. Создать отдельного Redis-пользователя с минимально необходимыми правами.
4. Создать Container Registry, собрать Docker-образ из корня репозитория и отправить его в Registry.
5. Создать Serverless Container на основе образа.
6. Настроить сетевой доступ контейнера к Managed Redis.
7. Передать `REDIS_URL` и MAX credentials как секреты/переменные окружения.
8. Установить публичный HTTPS URL контейнера как адрес webhook бота.
9. В настройках MAX-бота указать HTTPS URL Mini App.

Контейнер слушает порт из переменной `PORT` (по умолчанию 8080).

## Текущий статус интеграций

- [x] Существующий интерфейс Mini App сохранён.
- [x] Node.js HTTP backend.
- [x] Health endpoint с проверкой Redis.
- [x] Подключение Redis через URL.
- [x] Приёмник MAX webhook.
- [ ] Создать Managed Redis в Yandex Cloud и подключить его к backend.
- [ ] Проверка подписи/инициализационных данных Mini App по актуальной спецификации MAX.
- [ ] Регистрация webhook-подписки MAX.
- [ ] Команды бота и кнопка открытия Mini App.
- [ ] Модели и операции пользователей, подарков и заказов в Redis.
- [ ] Платёжный провайдер, идемпотентность и подтверждение оплаты.
- [ ] Production deployment pipeline.

Webhook сейчас только принимает и журналирует события. Он намеренно не выдаёт подарки и не подтверждает платежи. Эти действия будут добавлены после настройки и проверки авторизации MAX и платёжных уведомлений.

## Полезные ссылки

- MAX Bot API: https://dev.max.ru/docs-api
- MAX Mini Apps: https://dev.max.ru/help/miniapps
- Yandex Managed Redis / Valkey: https://yandex.cloud/ru/docs/managed-valkey/
- Yandex Serverless Containers: https://yandex.cloud/ru/docs/serverless-containers/
