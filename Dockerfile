# syntax=docker/dockerfile:1
FROM node:18-bullseye-slim

# Установить системные зависимости для headless Chrome
RUN apt-get update && apt-get install -y \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libdrm2 libgbm1 libgtk-3-0 libnspr4 libnss3 libxcomposite1 libxdamage1 libxrandr2 xdg-utils libu2f-udev libvulkan1 libxss1 fonts-liberation libappindicator3-1 libatspi2.0-0 libwayland-client0 libwayland-cursor0 libwayland-egl1 libxkbcommon0 libpango-1.0-0 libpangocairo-1.0-0 libxshmfence1 libxinerama1 libxcursor1 libxi6 libxtst6 libjpeg-turbo8 libwoff1 libopus0 libwebp6 libwebpdemux2 libenchant1c2a libsecret-1-0 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN npm run build

# Открываем порт
EXPOSE 3010

# Для production: только node dist/main.js
CMD ["node", "dist/main.js"] 