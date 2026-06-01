# Backend — Contexto y Arquitectura

> Doc de orientación para retomar el proyecto sin releer todo el código. Si algo aquí
> contradice al código, gana el código (verifica antes de asumir).

## Stack

| Capa | Tecnología |
|------|-----------|
| HTTP | Fastify 4.x + TypeScript |
| ORM | Prisma + PostgreSQL |
| Auth | JWT (`@fastify/jwt`) + refresh token en cookie httpOnly |
| Colas | BullMQ + Redis (ioredis) |
| Archivos | MinIO (S3-compatible) |
| Emails | Resend |
| Validación | Zod (servicios) + AJV/JSON-schema (rutas Fastify) |
| Docs API | Swagger UI en `/docs` |

**Puerto:** 4000 · **Entrada:** `src/server.ts` → registra plugins, crea bucket MinIO, arranca worker BullMQ · **App:** `src/app.ts` → CORS, rate-limit (100/min), multipart (límite 2 GB), error handler global (`ERROR_MAP` mapea `throw new Error('CODE')` → status+mensaje), registra módulos.

**Importante (despliegue):** backend y frontend usan `build:` en docker-compose. Tras `git pull` hay que `docker compose up -d --build` (NO basta `restart`). El Dockerfile corre `prisma migrate deploy` al arrancar → los cambios de schema deben existir como **migración Prisma** (no sólo `db push` local), o no se aplican en prod.

---

## Estructura

```
backend/src/
├── server.ts, app.ts, seed-admin.ts   ← seed-admin se compila a dist/ (correr: node dist/seed-admin.js)
├── modules/
│   ├── auth/        (routes, service, schema)
│   ├── users/       (routes, service, follow.service, schema)
│   ├── posts/       (routes, service, schema)
│   ├── jams/        (routes, service, participation.service, submissions.service, votes.service, *.schema)
│   ├── notifications/ (routes, service, schema)
│   └── admin/       (routes, service)   ← moderación
├── plugins/
│   ├── prisma.ts → app.prisma
│   ├── redis.ts  → app.redis
│   └── jwt.ts    → app.authenticate (JWT) + app.requireAdmin (JWT + isAdmin vivo en DB)
└── lib/
    ├── storage.ts       → uploadFile() buffered, uploadStream() 2GB, deleteFile() (MinIO)
    ├── queue.ts         → scheduleJamTransition(), jamJobId()  [IDs usan "__" no ":"]
    ├── worker.ts        → ejecuta jobs BullMQ (reveal-theme, open-voting, close-jam)
    ├── notifications.ts  → notify(), notifyMany()  + tipos de payload
    ├── mailer.ts        → wrapper Resend
    └── swagger-schemas.ts → schemas reutilizables de respuesta (¡el serializador recorta campos no declarados!)
```

> ⚠️ **Gotcha de Fastify:** las respuestas se serializan con `fast-json-stringify` según el `response` schema. Si añades un campo al servicio pero no al schema en `swagger-schemas.ts` (o inline en la ruta), **se borra antes de enviarse**. Pasó con `replies`/`parentId` en comentarios.

---

## Endpoints

### Auth `/auth`
`POST /register` · `POST /login` · `POST /refresh` (cookie) · `POST /logout` · `GET /verify-email?token=` · `POST /forgot-password` · `POST /reset-password`
Login/refresh devuelven `{ accessToken, user }` donde `user` incluye `isAdmin`.

### Users `/users`
`GET /search?q=&cursor=` · `GET /me` ✓ · `PATCH /me` ✓ · `POST|DELETE /me/avatar` ✓ · `POST /me/banner` ✓ · `GET /:username` · `POST|DELETE /:username/follow` ✓ · `GET /:username/followers|following|posts|jams` (`?cursor=`)

### Posts `/posts`
`POST /` ✓ · `POST /:id/images` ✓ (máx 4, 10MB) · `GET /feed` ✓ · `GET /:id` · `PATCH /:id` ✓ (editar, solo autor) · `DELETE /:id` ✓ (autor) · `POST|DELETE /:id/like` ✓ · `GET /:id/comments` · `POST /:id/comments` ✓ (acepta `parentId` para responder, 1 nivel) · `DELETE /:id/comments/:commentId` ✓ (autor del comentario **o** dueño del post)

### Jams `/jams`
`GET /` (`?status=&q=&cursor=`) · `POST /` ✓ · `GET /calendar?month=&year=` · `GET /:slug` · `PATCH /:slug` ✓ (solo DRAFT) · `DELETE /:slug` ✓ (solo DRAFT) · `POST /:slug/publish` ✓ · `POST /:slug/cancel` ✓ · **`POST /:slug/advance` ✓** (organizer avanza fase manualmente: OPEN→IN_PROGRESS→VOTING→CLOSED) · `POST /:slug/cover` ✓

**Participación:** `POST|DELETE /:slug/join` ✓ · `GET /:slug/participants` · `POST /:slug/teams` ✓ · `GET /:slug/teams` · `POST|DELETE /:slug/teams/:teamId/join` ✓

**Submissions:** `POST /:slug/submissions` ✓ (requiere participar, jam IN_PROGRESS) · `GET /:slug/submissions` (privadas hasta VOTING; organizer las ve siempre) · `GET /:slug/submissions/:id` · `PATCH|DELETE /:slug/submissions/:id` ✓ (solo IN_PROGRESS, dueño) · `POST /:slug/submissions/:id/file` ✓ (2GB streaming) · `POST /:slug/submissions/:id/screenshots` ✓ (máx 5, JPEG/PNG/WebP) · **`DELETE /:slug/submissions/:id/screenshots/:screenshotId` ✓**

**Voting** (modelo *rate-each*, NO un voto por jam):
`POST /:slug/votes` ✓ (califica una entrega 1-10; **upsert** crea/actualiza; participantes **y organizer** pueden votar; no la propia ni la del propio equipo) · `DELETE /:slug/votes/:submissionId` ✓ (quita esa calificación) · `GET /:slug/votes/me` ✓ (devuelve `{ items: [{submissionId, score, comment}] }`) · `GET /:slug/results` (solo CLOSED; ranking por avgScore)

### Notifications `/notifications`
`GET /?unread=&cursor=` ✓ · `GET /unread-count` ✓ · `POST /read-all` ✓ · `PATCH /:id/read` ✓ · `DELETE /:id` ✓

### Admin `/admin` (todas requieren `app.requireAdmin`)
`GET /stats` (counts) · `GET /posts?cursor=` · `GET /comments?cursor=` · `DELETE /posts/:id` · `DELETE /comments/:id`  (borrado sin chequeo de propiedad)

### Otros
`GET /health` · `GET /docs`

---

## Auth
- **Access token:** JWT `{ sub: userId, email }`, ~15 min, header `Authorization: Bearer`.
- **Refresh token:** cookie httpOnly, 30 días, tabla `RefreshToken`.
- `app.authenticate` protege rutas privadas. `app.requireAdmin` = JWT válido + `isAdmin` consultado **en vivo en DB** (revocar admin es inmediato).
- **Crear admin:** `node dist/seed-admin.js` en prod / `npm run seed:admin` en local. Env: `ADMIN_EMAIL/PASSWORD/USERNAME/DISPLAY_NAME`. Si el email ya existe lo promueve; si no, crea usuario verificado admin.

---

## Ciclo de vida de un Jam

```
DRAFT → OPEN → IN_PROGRESS → VOTING → CLOSED
```
(El enum tiene `SUBMISSIONS` pero **no se usa en la práctica**: el flujo salta IN_PROGRESS→VOTING. Subir archivos ocurre en IN_PROGRESS.)

| Estado | Lo activa | Qué pasa |
|--------|-----------|----------|
| DRAFT | crear | editable, privado |
| OPEN | `publish` | visible, tema oculto, programa jobs BullMQ |
| IN_PROGRESS | job `reveal-theme` (startAt) **o** `advance` | tema revelado; se une gente, crea equipos, **sube entregas** |
| VOTING | job `open-voting` (submissionsEndAt) **o** `advance` | todos califican cada entrega (no la propia); organizer también |
| CLOSED | job `close-jam` (votingEndAt) **o** `advance`/`cancel` | resultados públicos |

Doble mecanismo: **jobs automáticos** (BullMQ, al publicar) **+ botón manual** del organizer (`/advance`), que además elimina el job redundante. `cancel` → CLOSED en cualquier momento.

---

## Modelos Prisma (clave)

- **User:** username/email únicos, passwordHash, perfil (bio, avatarUrl, bannerUrl, *Url sociales), `isVerified`, `isBanned`, `isAdmin`.
- **Jam:** slug único, status (enum), theme (oculto hasta IN_PROGRESS) + themeRevealed, teamMode (SOLO_ONLY|TEAMS_OPTIONAL|TEAMS_ONLY), maxParticipants, maxTeamSize, coverUrl, coverPosition, startAt/submissionsEndAt/votingEndAt.
- **JamParticipation:** `@@unique([userId, jamId])`, teamId opcional.
- **Team:** jamId, name, members, submission 1:1.
- **Submission:** jamId, userId, teamId (`@unique`, una por equipo), title, description, fileUrl, fileSizeBytes, externalUrl, screenshots[].
- **Vote:** jamId, submissionId, voterId, score 1-10, comment. **`@@unique([voterId, submissionId])`** (una calificación por entrega; índice en jamId).
- **Post:** content, userId, jamId opcional, images[], likes[], comments[].
- **PostComment:** content, userId, postId, **`parentId` opcional** (autorreferencia → respuestas 1 nivel, `onDelete: Cascade` borra respuestas).
- **Notification:** userId, type (enum), data (JSON), read, `@@index([userId, read])`.
  Tipos: NEW_FOLLOWER, POST_LIKE, POST_COMMENT, **COMMENT_REPLY**, JAM_STATUS_CHANGED, JAM_SUBMISSION_RECEIVED, JAM_VOTING_OPEN, JAM_RESULTS_PUBLISHED.
- **Report, Block:** existen en schema, **no implementados** aún (futuro: banear, cola de reportes).

---

## File uploads

| Recurso | Límite | Método | Key en bucket |
|---------|--------|--------|---------------|
| Avatar | 5 MB | buffered | `avatars/...` |
| Banner | 10 MB | buffered | `banners/...` |
| Cover jam | 5 MB | buffered | `covers/{jamId}.ext` |
| Imágenes post | 10 MB ×4 | buffered | `posts/{postId}/...` |
| Screenshots | 10 MB ×5 | buffered | `submissions/{id}/screenshots/{ts}.ext` |
| Archivo juego | 2 GB | **streaming** | `submissions/{id}/game.ext` |

Bucket `jamhub` (lectura pública). URL guardada en DB = `{MINIO_PUBLIC_URL}/jamhub/{key}`.

---

## Detalles que muerden (gotchas)

1. **Job IDs BullMQ no pueden contener `:`** → usar `jamJobId()` que separa con `__`. (Bug histórico: scheduling fallaba silenciosamente y las jams no transicionaban.)
2. **Response schemas recortan campos** (ver arriba).
3. **`prisma migrate dev` necesita TTY** — en este entorno usar `prisma db push` (local) y generar migración aparte para prod.
4. **seed-admin** está en `src/` (no `scripts/`) para que entre en `dist/` y corra con node puro en prod.
5. Paginación cursor-based en todo: `?cursor=<id>` → `{ items, nextCursor }`.

---

## Variables de entorno

```env
DATABASE_URL
REDIS_URL
MINIO_ENDPOINT / MINIO_PORT / MINIO_ACCESS_KEY / MINIO_SECRET_KEY / MINIO_PUBLIC_URL
JWT_SECRET
RESEND_API_KEY            # opcional
FRONTEND_URL              # CORS
NEXT_PUBLIC_API_URL       # build-arg del frontend (horneado en build, requiere rebuild al cambiar)
NODE_ENV
ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_USERNAME / ADMIN_DISPLAY_NAME   # para seed-admin
```
