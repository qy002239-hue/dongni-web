# 懂妳 — Web

A web companion app. One chat screen with onboarding, deep-ocean theme, fully responsive for mobile.

The companion (懂妳) is built to *listen* — she doesn't give advice unless asked, doesn't reframe what you said, doesn't use therapist-style phrasing. Just stays with what's there.

---

## 你還需要做的事

The code is ready to ship. The remaining work is account-level and can only be done by you. Rough order:

### 必做（部署前）

- [ ] **Rotate your Anthropic API key.** It sat in plaintext source earlier in development. Go to https://console.anthropic.com → API Keys → create a new one, revoke the old one, paste the new value into `web/.env` (key name: `ANTHROPIC_API_KEY`). I flagged this earlier and you opted to skip — still recommended before going public.
- [ ] **Create a GitHub repo.** Either a new private repo for the whole `dongni/` monorepo, or a separate one for just `web/`. Both Railway and Vercel deploy by connecting a GitHub repo.
- [ ] **Commit and push.** From `/Users/xiezhiyuan/dongni`:
  ```bash
  git add web/
  git commit -m "feat(web): chat web app + deploy prep"
  git remote add origin git@github.com:<your-username>/<repo>.git
  git push -u origin main
  ```
  Verify `web/.env` is **not** in the diff (it's gitignored — good).

### Railway（後端）

- [ ] Sign up at https://railway.app (free tier is enough to start).
- [ ] **New Project → Deploy from GitHub repo** → select your repo.
- [ ] **Service Settings → Root Directory** → `web/src/server`.
- [ ] **Variables** → add:
  - `ANTHROPIC_API_KEY` = your rotated key
- [ ] Wait for the first deploy to succeed. Copy the public URL (looks like `https://dongni-server-production-xxxx.up.railway.app`).
- [ ] Sanity check: open `<railway-url>/healthz` in a browser → should show `{"ok":true}`.

### Vercel（前端）

- [ ] Sign up at https://vercel.com (free Hobby tier is enough).
- [ ] **Add New → Project → Import** your GitHub repo.
- [ ] **Root Directory** → `web`.
- [ ] **Environment Variables** → add:
  - `VITE_API_URL` = your Railway URL from above (no trailing slash)
- [ ] Deploy. Copy the Vercel URL (looks like `https://dongni-xxxx.vercel.app`).

### 鎖定 CORS（部署後）

- [ ] Back to Railway → Variables → add:
  - `ALLOWED_ORIGIN` = your Vercel URL (e.g. `https://dongni-xxxx.vercel.app`)
- [ ] Railway auto-redeploys. Now only your Vercel site can hit the backend.

### 開來用

- [ ] Open the Vercel URL on your phone. Add to home screen if you want it to feel like an app (`apple-mobile-web-app-capable` is already set).

### 之後再考慮

- [ ] **Tune the rate limit.** Default is `15` requests per IP per minute on `/api/chat`. Bump or lower via the `RATE_LIMIT_PER_MIN` env var on Railway. When exceeded, clients see a `429` with the bubble text `「回得太快了，等一下再說好嗎。」`.
- [ ] **Custom domain.** Both Vercel and Railway support custom domains for free; you just point DNS at them.
- [ ] **Analytics / error tracking.** Nothing wired in.
- [ ] **Strip the `重看引導` dev button.** It's already gated behind `import.meta.env.DEV`, so Vercel's production build strips it automatically. No action needed unless you want to verify.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite, inline-styled |
| Backend | Express 5 + `@anthropic-ai/sdk` |
| Model | `claude-sonnet-4-6` |
| State | `localStorage` (no DB) |

## Setup

```bash
cd web
npm install
cp .env.example .env   # then edit .env with your real ANTHROPIC_API_KEY
```

Backend dependencies live in `src/server/`:

```bash
cd src/server && npm install && cd -
```

## Run locally

Two processes:

```bash
npm run server   # backend on :3001 — loads .env via --env-file
npm run dev      # frontend on :5173
```

Open `http://localhost:5173`.

Sanity-check the backend on its own:

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"嗨"}]}'
# → {"reply":"..."}
```

Health: `GET /healthz` returns `{"ok":true}`.

## Environment variables

| Var | Used by | Required | Default |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | server | yes | — |
| `VITE_API_URL` | frontend (build-time) | no in dev | `http://localhost:3001` |
| `PORT` | server | no | `3001` |
| `ALLOWED_ORIGIN` | server (CORS) | no | permissive |
| `RATE_LIMIT_PER_MIN` | server | no | `15` per IP per minute on `/api/chat` |

`ALLOWED_ORIGIN` accepts a single origin or a comma-separated list. In production set it to your Vercel URL so the backend only accepts requests from your own frontend.

## File structure

```
web/
├── index.html             # entry; viewport-fit=cover, theme-color, lang=zh-Hant
├── package.json           # scripts: dev / server / build / preview / lint
├── public/
│   └── ocean.jpg          # bioluminescent ocean background
└── src/
    ├── main.jsx
    ├── index.css          # CSS reset + mobile resets only
    ├── App.jsx            # chat screen, gates onboarding on first visit
    ├── Onboarding.jsx     # 5-page swipeable intro
    ├── api.js             # fetch wrapper for /api/chat
    └── server/
        ├── package.json   # standalone — Railway uses this
        └── index.mjs      # Express app
```

## Architecture notes

**Chat flow**

1. `App.jsx` checks `localStorage["dongni.onboarded"]`. If absent, shows `<Onboarding />`.
2. Onboarding has 5 swipeable pages (touch + mouse drag + arrow keys + dots). Skipping or hitting **開始** sets the flag and unmounts.
3. Chat screen loads `localStorage["dongni.messages"]` (or a seed greeting) into state.
4. On send: optimistic UI appends the user message, shows a typing-dots bubble, posts the full history to `POST /api/chat`.
5. `buildHistory()` strips error bubbles + their failed user attempts, caps to 20 turns, ensures the array starts with a user message and alternates. Defensive-merges any same-role runs.
6. Server validates the same invariants, calls Claude with the 懂妳 system prompt, returns the reply.
7. Reply is appended to messages, which triggers the `localStorage` persist effect.

**Why no React Router / Context / Zustand**

App has one screen with one piece of UI state (onboarded yes/no). State lives in `App.jsx`. Not worth wiring up libraries for that.

**Why inline styles**

Single-file UI, no design system, mobile-first responsive done via `clamp()` and `env(safe-area-inset-*)`. CSS-in-JS or Tailwind would be over-engineering for the current scope.

## Deploy

**Backend → Railway**

- New project from this repo
- **Root Directory**: `web/src/server`
- **Variables**: `ANTHROPIC_API_KEY`
- After frontend is deployed, also set `ALLOWED_ORIGIN` to the Vercel URL

**Frontend → Vercel**

- Import the repo
- **Root Directory**: `web`
- **Environment Variables**: `VITE_API_URL` = the Railway public URL (no trailing slash)
- Framework auto-detected as Vite

## Conventions

- Backend pinned at `claude-sonnet-4-6`. Change in `src/server/index.mjs` if you want a different model.
- The system prompt for 懂妳 lives inline in `src/server/index.mjs`. Heavily iterated — see commits for the reasoning behind banning therapist-style phrases and positivity clichés.
- Brand name 懂妳 always uses the feminine 妳. User-facing copy uses neutral 你.
- Dark ocean palette: page background uses `public/ocean.jpg` with a navy gradient overlay (`rgba(2,12,24,0.62 → 0.78 → 0.7)` in chat, lighter in onboarding).
- Storage keys: `dongni.onboarded`, `dongni.messages`.

## Dev tools

- `重看引導` button in the chat header — visible only when `import.meta.env.DEV` is true. Clears the onboarded flag and reloads.
- Clear chat history: **清除對話** button (always available).
- Manual reset from DevTools console:
  ```js
  localStorage.clear(); location.reload();
  ```
