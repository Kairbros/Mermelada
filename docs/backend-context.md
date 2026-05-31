# Backend — Contexto y Arquitectura

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework HTTP | Fastify 4.x + TypeScript |
| ORM | Prisma + PostgreSQL |
| Autenticación | JWT (`@fastify/jwt`) + refresh token en httpOnly cookie |
| Colas de trabajo | BullMQ + Redis (ioredis) |
| Almacenamiento de archivos | MinIO (S3-compatible) |
| Emails | Resend |
| Validación | Zod (servicios) + AJV (rutas Fastify) |
| Documentación API | Swagger UI en `/docs` (`@fastify/swagger`) |

**Puerto:** 4000  
**Entrada:** `backend/src/server.ts` → registra plugins, inicia buckets MinIO, arranca worker BullMQ  
**App:** `backend/src/app.ts` → configura CORS, rate-limit (100 req/min), multipart, error handler global, registra rutas

---

## Estructura de carpetas

```
backend/src/
├── server.ts
├── app.ts
├── modules/
│   ├── auth/
│   │   ├── auth.routes.ts
│   │   ├── auth.service.ts
│   │   └── auth.schema.ts
│   ├── users/
│   │   ├── users.routes.ts
│   │   ├── users.service.ts
│   │   ├── follow.service.ts
│   │   └── users.schema.ts
│   ├── posts/
│   │   ├── posts.routes.ts
│   │   ├── posts.service.ts
│   │   └── posts.schema.ts
│   ├── jams/
│   │   ├── jams.routes.ts
│   │   ├── jams.service.ts
│   │   ├── participation.service.ts
│   │   ├── submissions.service.ts
│   │   ├── votes.service.ts
│   │   └── *.schema.ts
│   └── notifications/
│       ├── notifications.routes.ts
│       ├── notifications.service.ts
│       └── notifications.schema.ts
├── plugins/
│   ├── prisma.ts       → app.prisma
│   ├── redis.ts        → app.redis
│   └── jwt.ts          → app.authenticate()
└── lib/
    ├── storage.ts      → uploadFile(), uploadStream(), deleteFile() (MinIO)
    ├── queue.ts        → programa jobs de transición de jam
    ├── worker.ts       → ejecuta los jobs (BullMQ)
    ├── notifications.ts → helper createNotification()
    ├── mailer.ts       → wrapper Resend
    └── swagger-schemas.ts
```

---

## Endpoints

### Auth — `/auth`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Crear cuenta, envía email de verificación |
| POST | `/auth/login` | — | Login → JWT + refresh cookie |
| POST | `/auth/refresh` | cookie | Renovar access token |
| POST | `/auth/logout` | cookie | Eliminar refresh token |
| GET | `/auth/verify-email` | — | Verificar email con `?token=` |
| POST | `/auth/forgot-password` | — | Enviar email de reset |
| POST | `/auth/reset-password` | — | Cambiar contraseña con token |

### Users — `/users`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/users/search` | — | Buscar usuarios (`?q=&cursor=`) |
| GET | `/users/me` | ✓ | Mi perfil |
| PATCH | `/users/me` | ✓ | Actualizar perfil |
| POST | `/users/me/avatar` | ✓ | Subir avatar (multipart, 5 MB) |
| DELETE | `/users/me/avatar` | ✓ | Eliminar avatar |
| POST | `/users/me/banner` | ✓ | Subir banner (multipart, 10 MB) |
| GET | `/users/:username` | — | Perfil público |
| POST | `/users/:username/follow` | ✓ | Seguir usuario |
| DELETE | `/users/:username/follow` | ✓ | Dejar de seguir |
| GET | `/users/:username/followers` | — | Listar seguidores (`?cursor=`) |
| GET | `/users/:username/following` | — | Listar seguidos (`?cursor=`) |
| GET | `/users/:username/posts` | — | Posts del usuario (`?cursor=`) |
| GET | `/users/:username/jams` | — | Jams organizados (`?cursor=`) |

### Posts — `/posts`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/posts` | ✓ | Crear post |
| POST | `/posts/:id/images` | ✓ | Subir imágenes (máx 4, 10 MB c/u) |
| GET | `/posts/feed` | ✓ | Feed (seguidos + propios, `?cursor=`) |
| GET | `/posts/:id` | — | Obtener post |
| DELETE | `/posts/:id` | ✓ | Eliminar post (solo autor) |
| POST | `/posts/:id/like` | ✓ | Dar like |
| DELETE | `/posts/:id/like` | ✓ | Quitar like |
| GET | `/posts/:id/comments` | — | Listar comentarios (`?cursor=`) |
| POST | `/posts/:id/comments` | ✓ | Agregar comentario |
| DELETE | `/posts/:id/comments/:commentId` | ✓ | Eliminar comentario |

### Jams — `/jams`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/jams` | — | Listar jams (`?status=&q=&cursor=`) |
| POST | `/jams` | ✓ | Crear jam (estado inicial: DRAFT) |
| GET | `/jams/calendar` | — | Vista calendario (`?month=&year=`) |
| GET | `/jams/:slug` | — | Detalles del jam |
| PATCH | `/jams/:slug` | ✓ | Editar jam (solo en DRAFT) |
| DELETE | `/jams/:slug` | ✓ | Eliminar jam (solo en DRAFT) |
| POST | `/jams/:slug/publish` | ✓ | Publicar jam (DRAFT → OPEN), programa jobs |
| POST | `/jams/:slug/cancel` | ✓ | Cancelar jam (→ CLOSED) |
| POST | `/jams/:slug/cover` | ✓ | Subir portada (5 MB, posición vertical) |

### Participación en Jams

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/jams/:slug/join` | ✓ | Unirse al jam |
| DELETE | `/jams/:slug/join` | ✓ | Abandonar el jam |
| GET | `/jams/:slug/participants` | — | Listar participantes (`?cursor=`) |
| POST | `/jams/:slug/teams` | ✓ | Crear equipo |
| GET | `/jams/:slug/teams` | — | Listar equipos (`?cursor=`) |
| POST | `/jams/:slug/teams/:teamId/join` | ✓ | Unirse a equipo |
| DELETE | `/jams/:slug/teams/:teamId/join` | ✓ | Abandonar equipo |

### Submissions

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/jams/:slug/submissions` | ✓ | Crear submission (requiere estar en jam) |
| GET | `/jams/:slug/submissions` | — | Listar submissions (`?cursor=`; privadas hasta VOTING) |
| GET | `/jams/:slug/submissions/:id` | — | Obtener submission |
| PATCH | `/jams/:slug/submissions/:id` | ✓ | Editar submission (solo IN_PROGRESS) |
| DELETE | `/jams/:slug/submissions/:id` | ✓ | Eliminar submission (solo IN_PROGRESS) |
| POST | `/jams/:slug/submissions/:id/file` | ✓ | Subir archivo del juego (hasta 2 GB, streaming) |
| POST | `/jams/:slug/submissions/:id/screenshots` | ✓ | Subir screenshot (máx 5, 10 MB c/u) |

### Voting

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/jams/:slug/votes` | ✓ | Votar (score 1-10, 1 voto por jam) |
| PATCH | `/jams/:slug/votes` | ✓ | Actualizar voto |
| DELETE | `/jams/:slug/votes` | ✓ | Retirar voto |
| GET | `/jams/:slug/votes/me` | ✓ | Mi voto en este jam |
| GET | `/jams/:slug/results` | — | Resultados (solo cuando CLOSED) |

### Notifications — `/notifications`

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/notifications` | ✓ | Listar (`?unread=&cursor=`) |
| GET | `/notifications/unread-count` | ✓ | Contar no leídas |
| POST | `/notifications/read-all` | ✓ | Marcar todas como leídas |
| PATCH | `/notifications/:id/read` | ✓ | Marcar una como leída |
| DELETE | `/notifications/:id` | ✓ | Eliminar notificación |

### Otros

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |

---

## Autenticación

- **Access token:** JWT con payload `{ sub: userId, email }`, duración ~15 min, enviado en header `Authorization: Bearer <token>`
- **Refresh token:** httpOnly cookie, duración 30 días, almacenado en tabla `RefreshToken`
- `app.authenticate` es el hook Fastify que protege rutas privadas

---

## Ciclo de vida de un Jam

```
DRAFT → OPEN → IN_PROGRESS → SUBMISSIONS → VOTING → CLOSED
```

| Estado | Quién lo activa | Qué ocurre |
|--------|----------------|-----------|
| DRAFT | Organizer al crear | Editable, no visible públicamente |
| OPEN | `POST /jams/:slug/publish` | Visible; tema oculto; se programan todos los jobs BullMQ |
| IN_PROGRESS | Job `reveal-theme` en `startAt` | Tema revelado; participantes se unen y forman equipos |
| SUBMISSIONS | Job `open-submissions` en `submissionsEndAt` | Ventana de envío de submissions |
| VOTING | Job `open-voting` en `votingEndAt` | Todos los participantes pueden votar (excepto a sí mismos) |
| CLOSED | Job `close-jam` al terminar votación | Resultados públicos |

El organizer puede cancelar el jam en cualquier momento → `CLOSED`.

---

## Modelos principales (Prisma)

### User
```
id, username (unique), email (unique), passwordHash
displayName, bio, avatarUrl, bannerUrl
websiteUrl, githubUrl, itchUrl, twitterUrl
isVerified, isBanned, isAdmin
```

### Jam
```
id, slug (unique), title, description, rules
organizerId (→ User)
status: DRAFT | OPEN | IN_PROGRESS | SUBMISSIONS | VOTING | CLOSED
theme (oculto hasta IN_PROGRESS), themeRevealed
teamMode: SOLO_ONLY | TEAMS_OPTIONAL | TEAMS_ONLY
maxParticipants, maxTeamSize
coverUrl, coverPosition
startAt, submissionsEndAt, votingEndAt
```

### JamParticipation
```
userId, jamId, teamId (opcional)
@@unique([userId, jamId])
```

### Submission
```
id, jamId, userId, teamId (optional, unique per jam)
title, description
fileUrl, fileSizeBytes, externalUrl
```

### Vote
```
id, jamId, submissionId, voterId
score (1–10), comment
@@unique([voterId, jamId])   ← un voto por participante por jam
```

### Post
```
id, content, userId, jamId (opcional)
images, likes, comments
```

### Notification
```
id, userId, type, data (JSON), read
type: NEW_FOLLOWER | POST_LIKE | POST_COMMENT | JAM_STATUS_CHANGED | ...
@@index([userId, read])
```

---

## File uploads

| Recurso | Límite | Método |
|---------|--------|--------|
| Avatar | 5 MB | `uploadFile()` (buffered) |
| Banner | 10 MB | `uploadFile()` (buffered) |
| Cover de jam | 5 MB | `uploadFile()` (buffered) |
| Imágenes de post | 10 MB c/u, máx 4 | `uploadFile()` (buffered) |
| Screenshots | 10 MB c/u, máx 5 | `uploadFile()` (buffered) |
| Archivo del juego | hasta 2 GB | `uploadStream()` (streaming directo a MinIO) |

---

## Jobs BullMQ programados al publicar un jam

| Job | Cuándo se dispara | Acción |
|-----|-------------------|--------|
| `reveal-theme:jamId` | `startAt` | Estado → IN_PROGRESS, revela tema, notifica |
| `open-submissions:jamId` | `submissionsEndAt` | Estado → SUBMISSIONS |
| `open-voting:jamId` | `votingEndAt` | Estado → VOTING, notifica |
| `close-jam:jamId` | fecha final de votación | Estado → CLOSED, notifica |

---

## Paginación

Todos los listados usan **cursor-based pagination** con `?cursor=<id>` y devuelven `{ data, nextCursor }`.

---

## Variables de entorno relevantes

```env
DATABASE_URL
REDIS_URL
MINIO_ENDPOINT / MINIO_ROOT_USER / MINIO_ROOT_PASSWORD
JWT_SECRET
RESEND_API_KEY
FRONTEND_URL        # usado para CORS
NEXT_PUBLIC_API_URL # URL del backend que consume el frontend
NODE_ENV
```
