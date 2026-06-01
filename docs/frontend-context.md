# Frontend — Contexto y Arquitectura

> Doc de orientación para retomar el proyecto sin releer todo el código. Si algo aquí
> contradice al código, gana el código (verifica antes de asumir).

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js (App Router) + React + TypeScript |
| Estilos | Tailwind CSS (modo claro/oscuro vía clase `dark` en `<html>`) |
| HTTP client | `ky` (wrapper en `lib/api.ts`) |
| Estado global | React Context (sin Redux/Zustand) |
| i18n | propio (ES/EN), `LanguageContext` + `i18n/en.ts` / `i18n/es.ts` |

**Puerto dev:** 3000 (Docker mapea 3002). **API:** `NEXT_PUBLIC_API_URL` (build-arg; horneado en build → cambiarla requiere `docker compose up -d --build frontend`).

---

## Estructura

```
frontend/src/
├── app/                       ← App Router (cada carpeta = ruta)
│   ├── layout.tsx             ← envuelve TODO en providers (ver abajo) + <Navbar/>
│   ├── page.tsx               ← landing
│   ├── (auth)/                ← login, register, forgot-password, reset-password (grupo sin segmento URL)
│   ├── feed/                  ← feed de posts + composer
│   ├── posts/[id]/            ← detalle de un post
│   ├── jams/                  ← listado de jams
│   │   ├── new/               ← crear jam
│   │   └── [slug]/            ← detalle de jam (EL ARCHIVO MÁS GRANDE, ~1200 líneas)
│   │       └── edit/          ← editar jam (solo DRAFT)
│   ├── users/[username]/      ← perfil público
│   │   └── connections/       ← followers/following
│   ├── profile/               ← redirige al perfil propio
│   ├── calendar/              ← timeline mensual de jams
│   ├── search/                ← búsqueda usuarios+jams
│   ├── notifications/         ← centro de notificaciones
│   ├── settings/              ← editar perfil propio, avatar/banner, idioma
│   └── admin/                 ← panel de moderación (solo isAdmin)
├── components/
│   ├── Navbar.tsx             ← nav + búsqueda + campana + menú avatar (link admin si isAdmin)
│   ├── PostCard.tsx           ← post con like/comentarios/respuestas/editar/borrar (subcomponentes CommentItem, ReplyItem)
│   ├── JamCard.tsx, Avatar.tsx, Icons.tsx (SVGs inline)
├── contexts/
│   ├── AuthContext.tsx        ← user, accessToken, login/register/logout, updateUser
│   ├── ThemeContext.tsx       ← dark/light (persistido en localStorage)
│   ├── LanguageContext.tsx    ← useT() devuelve el objeto de traducciones activo
│   └── NotificationsContext.tsx ← contador unread compartido (ver abajo)
├── lib/
│   ├── api.ts                 ← cliente ky + parseApiError()
│   └── cover.ts               ← coverObjectPosition() (lee &pos= de la coverUrl)
├── types/  auth.ts · jam.ts · post.ts
└── i18n/   en.ts (fuente de verdad, exporta type Translations) · es.ts (debe calzar el type)
```

---

## Providers (orden en `layout.tsx`)

```
LanguageProvider → ThemeProvider → AuthProvider → NotificationsProvider → Navbar + children
```
`NotificationsProvider` depende de `AuthContext` (necesita accessToken) → va dentro.

---

## Autenticación (cliente)

- `AuthContext` guarda `accessToken` en estado **y** en `localStorage('access_token')`.
- Al montar, hace `POST /auth/refresh` (cookie) para rehidratar sesión.
- `lib/api.ts` añade `Authorization: Bearer` automáticamente desde localStorage en cada request (hook `beforeRequest`). Aun así, mucho código pasa el header manualmente — ambas formas conviven.
- `User` incluye `isAdmin?` → gatea el link a `/admin` en Navbar y la propia página `/admin` (redirige si no es admin).

---

## Patrones usados

- **Optimistic updates:** likes, votos, borrar comentarios/screenshots actualizan UI al instante y revierten si falla.
- **Paginación cursor:** `GET ...?cursor=` → `{ items, nextCursor }`.
- **i18n:** SIEMPRE usar `const t = useT()` y `t.seccion.clave`. Al añadir texto: agregarlo a `en.ts` **y** `es.ts` (si no, TS falla porque `es` debe cumplir `type Translations` de `en`). Valores pueden ser funciones: `t.x.y(n, total)`.
- **Modo claro/oscuro:** cada color necesita variante `dark:`. Bug recurrente: olvidar la variante clara y que algo se vea oscuro en modo claro (pasó en calendar).
- **Errores backend:** `parseApiError(err, fallback)` extrae `body.error`.

---

## Páginas con lógica densa

### `jams/[slug]/page.tsx` (la más grande)
Maneja TODO el ciclo de la jam con tabs: **overview / teams / submissions / results**.
- Estado de participación, equipos, mi entrega, votos, resultados.
- **Organizer:** banner de borrador (publish/edit/delete), botón **Advance** (avanza fase, con modal de confirmación por fase), botón cancel, y **preview de todas las entregas durante IN_PROGRESS** (los participantes solo ven la suya).
- **Crear entrega:** formulario con título/desc/enlace **+ archivo del juego + screenshots adjuntos** (se suben tras crear la submission, todo en un paso).
- **Tu entrega:** vista compacta; al pulsar **Edit** se gestiona archivo/screenshots (replace, add, borrar con ×). Botón "Done".
- **Voting (VOTING):** `VoteWidget` por entrega → botones 1-10, nota opcional plegable, "quitar calificación". Barra de progreso "X de Y juegos calificados". El organizer también puede votar.
- **Results (CLOSED):** ranking; cada fila es enlace → descarga `fileUrl` (o `externalUrl` si no hay archivo).
- Subcomponentes en el mismo archivo: `SubmissionCard`, `VoteWidget`, `StatRow`, `TimelineItem`, `formatBytes()`.

### `components/PostCard.tsx`
Post completo: like (optimista), comentarios con **respuestas anidadas 1 nivel** (`CommentItem` + `ReplyItem`), menú `···` para **editar/borrar el post** (solo autor, con modal de confirmación), badge "edited". Borrar comentario: lo permite el autor del comentario **o** el dueño del post. Callbacks `onDelete`/`onUpdate` para sincronizar feed/detalle.

### `app/notifications/page.tsx` + `NotificationsContext`
- El contador vive en **NotificationsContext** (compartido entre Navbar y la página), NO en estado local. Sondea cada 30s + al recuperar foco la pestaña.
- Marcar leído / borrar / marcar todas → llaman `decrement()`/`markAllRead()` del contexto → el badge baja **al instante** (antes no bajaba: ese era el bug).
- Renderiza cada tipo de notificación (incluye `COMMENT_REPLY`) con ícono, texto y link.

### `app/admin/page.tsx`
Solo `isAdmin` (redirige si no). Stats cards + tabs posts/comentarios + borrar con modal. Llama `/admin/*`.

### `app/calendar/page.tsx`
Timeline mensual (desktop: barras posicionadas por día; móvil: agenda). Todo con variantes `dark:`.

---

## Tipos (`types/`)
- `auth.ts`: `User` (incluye `isAdmin?`), `AuthResponse`.
- `post.ts`: `Post`, `Comment` (con `parentId?` y `replies?`), `PostUser`, `PostImage`, `UserSummary`, `UserProfile`.
- `jam.ts`: `Jam`, `Participant`, `Team`, `Submission` (fileUrl, fileSizeBytes, screenshots…), `Vote`, `Result`.

---

## Gotchas

1. **i18n debe estar en ES y EN** o rompe el typecheck (`es` cumple `type Translations`).
2. **Cada color → variante `dark:`** (modo claro se ve oscuro si falta).
3. **`NEXT_PUBLIC_API_URL` se hornea en build** → cambiarla NO es runtime, requiere rebuild del contenedor frontend.
4. **Overflow en headers:** títulos largos necesitan `min-w-0` + `break-words` en el contenedor y `shrink-0` en los botones (pasó en jam header).
5. Verificar `npx tsc --noEmit` en `frontend/` antes de dar por terminado.
