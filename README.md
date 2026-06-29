# Chat

A real-time chat application built as an **Nx monorepo** with an **Angular** client and a **NestJS** server, sharing a common TypeScript contract library for end-to-end type safety.

> [!IMPORTANT]
> **Testing with more than one user?** Identity (name + avatar) is generated once and kept in `localStorage`, which the browser **shares across all tabs and windows**. So opening a new tab or window registers a *new* online user but with the **same `name` and `avatarUrl`** as the first one. This is by design — the task required persisting that profile in `localStorage`. To appear as a genuinely different person, open the app in an **incognito/private window** (or a different browser): each gets its own `localStorage`, and therefore its own identity.

## Tech stack

- **Monorepo:** Nx
- **Front-end:** Angular
- **Back-end:** NestJS + Socket.io
- **Shared:** `@chat/api-interfaces` — framework-agnostic TypeScript library with the models, DTO/payload interfaces and WebSocket event contracts used by **both** apps
- **Storage:** in-memory (no database required)

## Monorepo structure

```
apps/
  server/            NestJS app (WebSocket gateway, domain services, bots)
  client/            Angular app
libs/
  api-interfaces/    @chat/api-interfaces — shared models, events, DTOs (pure TS)
```

The shared library is a plain `@nx/js` TypeScript library (no Angular/Nest dependencies), so it can be imported by both the client and the server without pulling framework code across the boundary. This guarantees the wire contract is identical on both sides.

## Prerequisites

- Node.js 22+
- npm

## Setup

```bash
npm install
```

Create a `.env` file in the **workspace root** (see `.env.example`):

```
PORT=3000
CLIENT_ORIGIN=http://localhost:4200
GRACE_MS=10000
```

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `3000` |
| `CLIENT_ORIGIN` | Allowed CORS origin for the WebSocket server | `http://localhost:4200` |
| `GRACE_MS` | Reconnect grace period before a disconnected user is removed (ms) | `10000` |

Configuration is loaded and **validated on startup** (`@nestjs/config` + `class-validator`); the app fails fast if a variable is missing or invalid.

## Running

```bash
npm start            # run server and client together
npm run start:server # server only
npm run start:client # client only
npm run build        # build both apps
npm test             # run unit tests
npm run lint         # lint all projects
```

The client runs on `http://localhost:4200`, the server on `http://localhost:3000`.

## Architecture

### Transport — a single WebSocket connection

All real-time traffic flows over one Socket.io connection handled by a thin `ChatGateway`. The gateway is a **transport adapter only**: it translates WebSocket events into domain-service calls and back, and holds transport-level state (the `userId ↔ socketId` maps and reconnect timers). No business logic lives in the gateway.

### Identity & presence

- **Presence is per-connection.** A connection equals an online user; opening a new tab/browser appears as a new online user.
- **`userId` (domain) is separate from `socketId` (transport).** Domain services and bots only ever operate on `userId`.
- **Profile** (name + avatar) is persisted in `localStorage`; the **session `userId`** lives in `sessionStorage` (per-tab, survives reconnects within the tab).
- On connect the newcomer receives a `presence:init` bootstrap (`selfId` + the current contact list as `Contact[]` — each entry pairing a `User` with its `lastMessage` preview, bots included); everyone else receives a `presence:joined` delta.
- On disconnect the user is removed after a **grace period** (`GRACE_MS`); a reconnect within that window silently rebinds the socket without a flicker.

### Messaging

- `message:send` is acknowledged via Socket.io's native ack; the saved `Message` (with server-assigned `id`/`sentAt`) is returned to the sender, so no client-side correlation id is needed.
- Acks for request/response events are wrapped in an `AckResult<T>` envelope (`{ ok, data } | { ok, error }`) so the client always receives a resolvable answer.
- Delivery to the recipient happens via a separate `message:received` event.
- History is paginated with **`conversation:history`** (cursor-based by message id, newest → oldest, with `hasMore`).
- The contact list carries a **last-message preview** per contact (on the shared `Contact` model): `presence:init` seeds it, and inbound (`message:received`) and outbound messages keep it fresh.

### Bots (always online)

Implemented with a **Strategy pattern + registry**; each bot exposes an output stream that the dispatcher bridges to the message pipeline:

| Bot | Behaviour |
|---|---|
| Echo | replies with the same message immediately |
| Reverse | replies with the reversed message after a 3s delay |
| Spam | ignores input; broadcasts a random phrase every 10–120s |
| Ignore | does nothing |

Bot replies travel through the **same delivery pipeline** as human messages.

### Internal event bus

The server uses `@nestjs/event-emitter` as an internal bus to decouple the `Messages` and `Bots` modules (neither imports the other), and to push domain events to the gateway for socket delivery.

### WebSocket event contract (summary)

| Event | Direction | Payload |
|---|---|---|
| handshake `auth` | client → server | `{ name, avatarUrl, id? }` |
| `presence:init` | server → newcomer | `{ selfId, contacts: Contact[] }` |
| `presence:joined` | server → others | `User` |
| `presence:disconnected` | server → others | `{ userId }` |
| `message:send` | client → server (ack) | `{ recipientId, content }` → ack `AckResult<Message>` |
| `message:received` | server → recipient | `Message` |
| `conversation:history` | client → server (ack) | `{ interlocutorId, limit, before? }` → ack `AckResult<{ messages, hasMore }>` |
| `status:change` | client → server | `{ status }` |
| `status:changed` | server → others | `{ userId, status }` |

## Design decisions & notes

- **In-memory storage.** Message history and presence are kept in memory; they are cleared on restart. A database is intentionally omitted (allowed by the task). Messages sent to a user during their reconnect grace window are stored but pushed only after the client re-fetches `conversation:history` on reconnect (the server treats its history as the source of truth).
- **User persistence (localStorage).** A name and placeholder avatar are generated on first visit and reused on subsequent visits. Tabs in the same browser share this profile (a different browser/incognito naturally gets a different identity).
- **Online vs Away.** The protocol carries a per-user `status` (`online` / `away`) over `status:change` → `status:changed`; the client renders it and exposes an “All / Online only” contact filter, so presence is meaningful without a database. The client currently connects as `online` — wiring the Page Visibility API to flip to `away` on tab blur is the intended trigger and is not yet hooked up.
- **Reconnect trust boundary.** The server never trusts an id supplied by the client, with one documented exception: on reconnect the client presents its previous `userId` (from `sessionStorage`) in the handshake so the server can rebind the session. This is only honoured inside the grace window.
- **Type safety.** Models, DTO/payload interfaces and event-name maps live in `@chat/api-interfaces` and are consumed by both apps.
- **Scaling.** A single in-memory instance is sufficient here. For horizontal scaling across multiple instances, a Socket.io **Redis adapter** would be the path forward.

## Testing

Unit and integration tests cover the domain services, bot strategies, DTO validation and the gateway flows (see the test plan). Run them with:

```bash
npm test
```

## Notes on dependencies

`npm audit` reports advisories that originate from **transitive dev/build-time dependencies** of the frameworks, not from runtime code. They are managed via `nx migrate` (which upgrades the toolchain in a coordinated way) rather than `npm audit fix --force`, which would bump packages to breaking major versions and destabilise the workspace.
