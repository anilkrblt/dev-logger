# ⚡ React Log Agent

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%2B-61dafb?logo=react&logoColor=111)](https://react.dev/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](./packages/runtime/package.json)
[![Monorepo](https://img.shields.io/badge/npm-workspaces-cb3837?logo=npm&logoColor=white)](https://docs.npmjs.com/cli/using-npm/workspaces)

A performance-first, opt-in developer telemetry tool for React applications. Capture route transitions, global fetches, and Axios calls directly into your terminal dashboard with zero overhead when disconnected.

React Log Agent is built for local development: the browser runtime stays inert until your CLI bridge acknowledges the session, then installs only the adapters requested by the active capture profile.

## Why It Exists

Modern React apps hide the story of a user flow across routers, network clients, async boundaries, and browser APIs. React Log Agent pulls that story into a local terminal stream without leaving instrumentation permanently hot inside your app.

- Inspect fetch and Axios traffic as it happens.
- Correlate network activity with the active route.
- Redact sensitive data in the browser before anything crosses the wire.
- Turn everything off by closing the CLI or setting `enabled={false}`.

## Architecture

```text
React App (Runtime SDK)
  ReactLogProvider
  fetch / axios / router adapters
  browser-side redaction + route context
        |
        |  ws://localhost:3799
        |  CLIENT_HELLO -> SERVER_ACK
        v
Local Server (CLI Agent)
  capture profile + filters + remote redaction rules
        |
        v
Terminal Dashboard
  HTTP_REQUEST / HTTP_RESPONSE / HTTP_ERROR / ROUTE_TRANSITION
```

### Inert-by-Default Lifecycle

React Log Agent does no work unless you explicitly enable it.

1. `enabled={false}`: no WebSocket, no adapters, no patched browser APIs.
2. `enabled={true}`: the runtime opens a WebSocket to `ws://localhost:3799` by default.
3. The runtime sends `CLIENT_HELLO` with the app name, SDK version, and available adapters.
4. The CLI replies with `SERVER_ACK`, including the active profile, filters, and remote redaction rules.
5. Only then does the runtime install matching adapters.
6. If the socket closes, every adapter is uninstalled and patched APIs such as `window.fetch` are restored.

## Packages

This repository is an npm workspace monorepo.

| Package | Purpose |
| --- | --- |
| `@react-log-agent/protocol` | Shared TypeScript event and handshake contracts. |
| `@react-log-agent/runtime` | Browser-side React SDK, provider, transport, and adapters. |
| `@react-log-agent/cli` | Local WebSocket server and terminal dashboard. |

The root app is private. Individual packages are configured as publishable packages with dual ESM/CJS builds.

## Installation

Install the runtime in your React app:

```bash
npm install @react-log-agent/runtime
```

Run the local CLI bridge when you want telemetry:

```bash
npx @react-log-agent/cli -- --profile all
```

Useful CLI flags:

```bash
npx @react-log-agent/cli -- --port 3799 --profile network
npx @react-log-agent/cli -- --profile errors --filter api.example.com
npx @react-log-agent/cli -- --redact api-key,secret,session
```

Profiles:

| Profile | Captures |
| --- | --- |
| `all` | Routes, network requests, responses, and errors. |
| `network` | Fetch/Axios requests, responses, and rejected calls. |
| `routes` | Route transitions only. |
| `errors` | Rejected network calls and HTTP responses with status `>= 400`. |

## Integration

### Basic Fetch Instrumentation

Add the provider near the root of your React app. Keep adapter arrays stable by defining them outside render.

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import {
  ReactLogProvider,
  createFetchAdapter,
} from "@react-log-agent/runtime";

import App from "./App";

const logAdapters = [createFetchAdapter()];
const redactRules = ["authorization", "cookie", "password", "token"];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactLogProvider
      enabled={import.meta.env.DEV}
      adapters={logAdapters}
      redact={redactRules}
      appName="My React App"
    >
      <App />
    </ReactLogProvider>
  </React.StrictMode>,
);
```

The fetch adapter patches `window.fetch` only after `SERVER_ACK`. On disconnect or provider cleanup, the original `window.fetch` is restored.

### Axios and Router Correlation

React Log Agent also supports Axios interceptors and route tracking. Network events automatically inherit the current route context.

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import {
  ReactLogProvider,
  createAxiosAdapter,
  createFetchAdapter,
  createRouterAdapter,
} from "@react-log-agent/runtime";

import App from "./App";

const axiosInstance = axios.create({
  baseURL: "https://api.example.com",
});

const logAdapters = [
  createRouterAdapter(),
  createFetchAdapter(),
  createAxiosAdapter(axiosInstance),
];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactLogProvider
      enabled={import.meta.env.DEV}
      adapters={logAdapters}
      redact={["authorization", "cookie", "password", "token"]}
      appName="My React App"
    >
      <App api={axiosInstance} />
    </ReactLogProvider>
  </React.StrictMode>,
);
```

`createRouterAdapter()` works with browser History API navigation out of the box. It can also receive React Router data-router or history-like objects:

```tsx
const logAdapters = [
  createRouterAdapter({ router }),
  createFetchAdapter(),
  createAxiosAdapter(axiosInstance),
];
```

### Runtime Status

Use `useReactLogAgent()` when you want to expose connection state in a development-only panel.

```tsx
import { useReactLogAgent } from "@react-log-agent/runtime";

export function LogAgentStatus() {
  const agent = useReactLogAgent();

  return (
    <pre>
      {agent.status}
      {agent.currentRouteContext?.path}
    </pre>
  );
}
```

## Feature Showcase

### Performance First

The runtime transport keeps a bounded in-memory queue with a default limit of `100` events. If the CLI is slow or unavailable after handshake, the oldest logs are dropped first to protect the React app.

Flushes are scheduled with `requestIdleCallback` when available, with `queueMicrotask` as the fallback. Interceptors are installed only after the CLI requests them through `SERVER_ACK`.

### Privacy Guard

Payloads are sanitized inside the browser before `JSON.stringify()` and before WebSocket transfer.

The runtime deep-scans plain objects and arrays, matching sensitive keys case-insensitively. Default rules redact:

- `authorization`
- `cookie`
- `password`
- `token`

Matching values are replaced with `[REDACTED]`. Circular structures are protected with `WeakSet` and represented as `[Circular]`.

### Event Correlation

The router adapter keeps the active route context in the provider. Fetch and Axios events automatically inherit:

```ts
{
  currentRouteContext: {
    path: "/dashboard?tab=network",
    navigationId: "navigation_...",
    title: "My React App"
  }
}
```

That means request, response, and error logs can be read as part of a user journey rather than isolated network calls.

### Adapter Coverage

| Adapter | Captures |
| --- | --- |
| `createFetchAdapter()` | Global `window.fetch` requests, responses, rejected calls, headers, latency, and best-effort bodies. |
| `createAxiosAdapter(instance)` | Axios request/response/error interceptors with request IDs and latency. |
| `createRouterAdapter(options?)` | Route transitions from React Router data routers, history-like listeners, or browser History API navigation. |

## Protocol Events

All emitted logs conform to the shared protocol package.

```ts
type LogEvent =
  | RouteTransitionEvent
  | HttpRequestEvent
  | HttpResponseEvent
  | HttpErrorEvent;
```

Every event includes an `id`, `sessionId`, Unix epoch millisecond `timestamp`, source, and optional `currentRouteContext`.

## Local Development

Install dependencies from the root:

```bash
npm install
```

Build all packages and the demo app:

```bash
npm run build
```

Run package checks:

```bash
npm run typecheck:packages
npm run build:packages
npm run lint
```

Run the demo app:

```bash
npm run dev
```

Run the workspace CLI:

```bash
npm exec --workspace @react-log-agent/cli -- react-log-agent --help
npm exec --workspace @react-log-agent/cli -- react-log-agent --profile all
```

## Safety Model

React Log Agent is designed for development-time observability.

- Use `enabled={import.meta.env.DEV}` or an equivalent environment guard.
- Keep the CLI local; the runtime connects to `localhost` by default.
- Treat browser-side redaction as the last line of defense, and avoid intentionally logging secrets.
- Close the CLI to force adapter cleanup and return the app to its no-op state.

## License

MIT
