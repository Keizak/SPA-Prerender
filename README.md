# Prerender Service (NestJS + Puppeteer)

Высокопроизводительный сервис пререндеринга для SPA/SEO с кэшированием, пулом браузеров, web-дэшбордом и поддержкой sitemap.xml.

---

## Возможности
- Пререндеринг HTML для любых SPA/SSR сайтов (SEO, парсеры, соцсети)
- Кэширование страниц и ресурсов (LRU, TTL)
- Пул браузеров Puppeteer (параллельный рендер)
- Прогрев кэша по списку URL и sitemap.xml
- Автоматический прогрев кэша по расписанию
- Web-дэшборд: статистика, логи, управление кэшем, прогрев
- REST API для интеграции
- Логирование через winston (файл + консоль)
- PM2-ready, production-friendly

---

## Установка

```bash
npm install
```

---

## Запуск

**Dev:**
```bash
npm run start:dev
```

**Production (PM2):**
```bash
npm run build
npm run pm2:start
```

---

## Конфигурация (config.yaml и .env)

### Основные параметры

```yaml
server:
  port: 3010         # Порт сервиса
  host: 0.0.0.0      # Адрес для bind

browser:
  poolSize: 2        # Количество одновременных браузеров (рекомендуется = maxConcurrentRenders)

cache:
  pages:
    ttl: 259200      # Время жизни кэша страниц (сек), 3 дня = 259200
    maxKeys: 10000   # Максимум страниц в кэше (RAM позволяет — ставьте больше)
    checkperiod: 900 # Как часто чистить просроченные ключи (сек)
  resources:
    maxSize: 10000   # Кэш ресурсов (изображения, стили)
  redis:
    host: 127.0.0.1
    port: 6379
    # password: ''
    # db: 0
    keyPrefix: 'prerender:'

performance:
  maxConcurrentRenders: 2   # Одновременных рендеров (1-2 для 1 ядра CPU)
  renderTimeout: 30000      # Таймаут рендера одной страницы (мс)
  pageWaitTime: 3000        # Пауза после networkidle2 (мс), чтобы догрузился динамический контент

logging:
  level: info
  maxFiles: 5
  maxsize: 10485760         # 10MB

security:
  allowedDomains: []        # Список разрешённых доменов (или пусто для всех)
  maxUrlLength: 2048
```

### .env (для Telegram)
```
TELEGRAM_BOT_TOKEN=ваш_telegram_bot_token
TELEGRAM_CHAT_ID=ваш_chat_id
```

---

### Рекомендации по параметрам (CPU/RAM)

#### Если у вас 1 ядро CPU, 30 ГБ RAM:
- `maxConcurrentRenders: 2` (больше — будет тормозить, Chrome headless сильно грузит CPU)
- `browser.poolSize: 2` (столько же, сколько рендеров)
- `cache.pages.maxKeys: 10000` (или больше, если RAM позволяет)
- `cache.pages.ttl: 259200` (3 дня)
- `cache.pages.checkperiod: 900-1800` (15-30 минут)
- `performance.pageWaitTime: 2000-4000` (2-4 сек, если сайт динамический)
- `logging.level: info` (debug только для отладки)

#### Если у вас 2+ ядер CPU:
- `maxConcurrentRenders` = количество ядер (или чуть меньше)
- `browser.poolSize` = столько же
- `cache.pages.maxKeys` = RAM / 0.5 МБ (примерно 1 страница ≈ 0.5 МБ)

#### Пример расчёта:
- 1 Chrome headless ≈ 250-300 МБ RAM
- 10 000 страниц в кэше ≈ 5 ГБ RAM
- Оставьте запас под ОС и другие процессы

---

## Быстрый старт через Docker

1. Скопируйте `.env.example` в `.env` и заполните переменные при необходимости.
2. При необходимости отредактируйте `config.yaml`.
3. Соберите и запустите контейнер:
   ```bash
   docker build -t spa-prerender .
   docker run --rm -p 3010:3010 \
     -v $(pwd)/config.yaml:/app/config.yaml \
     -v $(pwd)/logs:/app/logs \
     -v $(pwd)/cache:/app/cache \
     --env-file .env \
     spa-prerender
   ```
   Для Windows путь к volume: `-v %cd%/config.yaml:/app/config.yaml`

---

## Запуск без Docker (Linux/macOS/Windows)

1. Установите Node.js 18+ и npm
2. Установите системные зависимости для headless Chrome:
   - **Linux (Ubuntu/Debian):**
     ```bash
     sudo apt-get update && sudo apt-get install -y \
       libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 libxdamage1 libxrandr2 xdg-utils libu2f-udev libvulkan1 libxss1 fonts-liberation libappindicator3-1 libatspi2.0-0 libwayland-client0 libwayland-cursor0 libwayland-egl1 libxkbcommon0 libpango-1.0-0 libpangocairo-1.0-0 libxshmfence1 libxinerama1 libxcursor1 libxi6 libxtst6 libjpeg-turbo8 libwoff1 libopus0 libwebp6 libwebpdemux2 libenchant1c2a libsecret-1-0
     ```
   - **macOS:** ничего дополнительно, только Node.js
   - **Windows:** только Node.js, Chrome подтянется сам
3. Склонируйте репозиторий и перейдите в папку:
   ```bash
   git clone ...
   cd PrerenderPupeteer
   ```
4. Скопируйте `.env.example` в `.env` и заполните переменные
5. Отредактируйте `config.yaml` при необходимости
6. Установите зависимости:
   ```bash
   npm install
   ```
7. Соберите проект:
   ```bash
   npm run build
   ```
8. Запустите:
   ```bash
   npm run start:prod
   ```
   или через PM2:
   ```bash
   npm run pm2:start
   ```

---

## Production: инструкция с нуля

1. **Установите Node.js (18+) и npm**
2. **Склонируйте репозиторий:**
   ```bash
   git clone ...
   cd PrerenderPupeteer
   ```
3. **Создайте .env:**
   ```
   TELEGRAM_BOT_TOKEN=ваш_telegram_bot_token
   TELEGRAM_CHAT_ID=ваш_chat_id
   ```
4. **Настройте config.yaml под своё железо (см. рекомендации выше)**
5. **Установите зависимости:**
   ```bash
   npm install
   ```
6. **Соберите проект:**
   ```bash
   npm run build
   ```
7. **Запустите через PM2:**
   ```bash
   npm run pm2:start
   # Для просмотра логов:
   npm run pm2:logs
   ```
8. **Проверьте доступность:**
   - Откройте http://localhost:3010 — должен открыться дашборд
   - API: http://localhost:3010/api/prerender?url=https://site.by
9. **(Рекомендуется) Настройте nginx для проксирования запросов к /api/prerender**
10. **Проверьте Telegram-уведомления (запустите прогрев через дашборд или API)**

---

## FAQ и советы
- После изменения .env/config.yaml — перезапускайте сервис
- Следите за загрузкой CPU/RAM через дашборд
- Для production используйте только Node.js LTS, PM2 и стабильный сервер
- Не ставьте maxConcurrentRenders больше числа ядер CPU
- Кэшируйте только нужные страницы (ограничьте sitemap, если их слишком много)

---

## Основные API эндпоинты

### Пререндер
- `GET /api/prerender?url=https://site.by` — получить HTML страницы
- Заголовки ответа: `X-Prerender-Cache`, `X-Prerender-Duration`

### Прогрев кэша
- `POST /api/prerender/warmup` — прогрев по списку URL (body: `{ urls: [ ... ] }`)
- `POST /api/prerender/warmup-sitemap?sitemap=https://site.by/sitemap.xml` — прогрев по sitemap.xml
- `GET /api/prerender/warmup-status` — статус задачи прогрева

### Кэш
- `GET /api/prerender/status?url=https://site.by/page` — статус кэша по URL (TTL, время истечения)
- `POST /api/admin/cache/clear` — очистка кэша (body: `{ type: 'all' | 'pages' | 'resources' }`)

### Логи и статистика
- `GET /api/admin/stats` — общая статистика
- `GET /api/admin/logs?limit=100` — последние логи
- `POST /api/admin/stats/reset` — сброс статистики

---

## Web-дэшборд

- Доступен на `/` (порт из config.yaml)
- Вкладки: Панель, Логи, Кэш, Инструменты
- Инструменты:
  - Тест пререндера (ручной)
  - Прогрев кэша по списку URL
  - Прогрев по sitemap.xml (с отслеживанием статуса)
  - Управление браузерами и статистикой
- Логи: последние N строк, автообновление
- Кэш: детали, очистка

---

## Особенности
- Не грузит счетчики/аналитику для роботов (SEO-friendly)
- Кэш TTL настраивается, автоматический прогрев по sitemap
- Логирование в файл `logs/combined.log` (winston)
- Простая интеграция с nginx, любыми парсерами и ботами

---

## Пример nginx-конфига для проксирования
```nginx
location /prerender/ {
    internal;
    proxy_pass http://127.0.0.1:3010/api/prerender?url=$arg_url;
}
```

---

## Скриншот дашборда
![dashboard screenshot](./docs/dashboard.png)

---

## Интеграция с Telegram

Для уведомлений о прогреве и нагрузке добавьте переменные в .env:

```
TELEGRAM_BOT_TOKEN=ваш_telegram_bot_token
TELEGRAM_CHAT_ID=ваш_chat_id
```

- `TELEGRAM_BOT_TOKEN` — токен вашего Telegram-бота (получить через @BotFather)
- `TELEGRAM_CHAT_ID` — id чата (можно узнать через @userinfobot или добавить бота в группу и получить id)

**Примеры уведомлений:**
- 🚀 Прогрев кэша по sitemap.xml начат
- 🔥 Прогрев кэша: 30% (300/1000)
- ✅ Прогрев кэша завершён
- ❌ Ошибка прогрева кэша: ...
- ⚠️ Внимание! Одновременно активных рендеров: 8

**Важно:**
- После изменения .env перезапустите сервис.
- Если переменные не заданы — уведомления не отправляются.

---

## Авторизация на дашборд (Basic-Auth)

Для защиты веб-интерфейса логином и паролем добавьте в .env:

```
DASHBOARD_USER=admin
DASHBOARD_PASS=yourpassword
```

- После этого при открытии дашборда появится окно авторизации (HTTP Basic Auth).
- API (все /api/*) остаётся без авторизации.
- Для отключения — удалите эти переменные и перезапустите сервис.

---

## Кэширование (Redis)

Сервис использует Redis для хранения кэша страниц и ресурсов. Это позволяет сохранять кэш между перезапусками и масштабировать сервис.

### Пример секции cache в config.yaml:

```yaml
cache:
  pages:
    ttl: 259200      # Время жизни кэша страниц (сек)
    maxKeys: 10000   # Максимум страниц (используется для мониторинга)
    checkperiod: 900 # Не используется с Redis, но можно оставить для совместимости
  resources:
    maxSize: 10000   # Максимум ресурсов (используется для мониторинга)
  redis:
    host: 127.0.0.1
    port: 6379
    # password: ''
    # db: 0
    keyPrefix: 'prerender:'
```

- Для работы необходим запущенный Redis (локально или в облаке).
- Все операции с кэшем теперь асинхронные (await).
- Старый in-memory кэш больше не используется.

### Запуск Redis (локально):

- **Linux/macOS:**
  ```bash
  sudo apt install redis-server
  redis-server
  ```
- **Windows:** используйте официальный docker-образ:
  ```bash
  docker run --name redis -p 6379:6379 -d redis
  ```

## License

MIT License © 2025 Ivan Keizak ([github.com/Keizak](https://github.com/Keizak))

---

## Контакты

Telegram: [t.me/keizak](https://t.me/keizak)
GitHub: [https://github.com/Keizak/SPA-Prerender](https://github.com/Keizak/SPA-Prerender)

---

**Автор:** Ivan Keizak, 2025

