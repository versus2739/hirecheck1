# HireCheck

Telegram Mini App для работодателя: импорт вакансий и откликов из HH.ru, AI-ранжирование кандидатов и персональные вопросы для интервью.

Весь код лежит одним уровнем (без подпапок) — так проще заливать на GitHub через браузер.

## Файлы
- `server.ts` — Express API + раздача собранного фронта
- `db.ts` — SQLite схема и миграции
- `hh.ts` — HH.ru OAuth и импорт (вакансии, отклики, резюме)
- `ai.ts` — AI-анализ кандидата (OpenAI)
- `index.html`, `main.tsx`, `style.css`, `vite.config.ts` — фронтенд (React + Vite)
- `railway.json`, `nixpacks.toml` — конфиг деплоя Railway

## Переменные окружения (Railway → Variables)
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=/data/hirecheck.db
PUBLIC_APP_URL=https://YOUR-DOMAIN.up.railway.app
WEB_APP_URL=https://YOUR-DOMAIN.up.railway.app
OPENAI_API_KEY=
HH_CLIENT_ID=
HH_CLIENT_SECRET=
HH_REDIRECT_URI=https://YOUR-DOMAIN.up.railway.app/api/integrations/hh/callback
TELEGRAM_BOT_TOKEN=
```

Для `DATABASE_URL=/data/hirecheck.db` нужен Volume в Railway с mount path `/data`.

## Деплой
1. Залить все файлы в репозиторий GitHub (одним уровнем).
2. Railway → New Project → Deploy from GitHub repo.
3. Добавить переменные выше, сгенерировать домен (Settings → Networking).
4. Добавить Volume на `/data`.
5. Проверка: `https://YOUR-DOMAIN.up.railway.app/api/health` → `{"ok":true}`.

## Локально
```bash
npm install
npm run dev      # API на http://localhost:3000
npx vite         # фронт на http://localhost:5173
```

## Ограничения MVP
- HH API требует официальное приложение и права работодателя.
- Avito — следующий модуль (официальный API может требовать партнёрский доступ).
- AI не принимает решение о найме, только структурирует данные.
