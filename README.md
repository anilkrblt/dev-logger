# React Log Agent

[![Version](https://img.shields.io/badge/version-0.1.0-111827)](./packages/runtime/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%2B-61dafb?logo=react&logoColor=111)](https://react.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-Hermes%20%2F%20JSC-61dafb?logo=react&logoColor=111)](https://reactnative.dev/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Monorepo](https://img.shields.io/badge/npm-workspaces-cb3837?logo=npm&logoColor=white)](https://docs.npmjs.com/cli/using-npm/workspaces)

React Log Agent is a performance-first, opt-in developer telemetry tool for React and React Native applications. Capture browser fetches, React Native fetches, Axios calls, route transitions, and React Navigation screen changes directly into one local terminal dashboard with zero overhead when disconnected.

Version `0.1.0` introduces cross-platform runtime support: the same `@anilkrblt/runtime` package now works in browser environments and React Native Hermes/JSC runtimes while streaming to the same `@anilkrblt/cli` terminal agent.

## Architecture

```text
                         @anilkrblt/runtime

        Browser / Web                                  Mobile / React Native
  React + Vite / Next / CRA                      Hermes / JSC + React Navigation
  createFetchAdapter()                           createReactNativeFetchAdapter()
  createAxiosAdapter()                           createReactNavigationAdapter()
  createRouterAdapter()                          active screen context
  active route context
          |                                                |
          +-------------------- WebSocket -----------------+
                               ws://<host>:3799
                               CLIENT_HELLO
                               SERVER_ACK
                                     |
                                     v
                            @anilkrblt/cli
                       local terminal dashboard

           HTTP_REQUEST / HTTP_RESPONSE / HTTP_ERROR / ROUTE_TRANSITION
```

The runtime is inert by default. When `enabled={false}`, no socket is opened, no adapter is installed, and no browser or mobile global is patched. When enabled, the runtime connects to the CLI, waits for `SERVER_ACK`, then installs only the adapters requested by the active capture profile.

If the WebSocket closes, every installed adapter is cleaned up immediately. Browser `window.fetch` and mobile `globalThis.fetch` are restored to their original implementations.

## Packages

| Package | Version | Purpose |
| --- | --- | --- |
| `@anilkrblt/protocol` | `0.1.0` | Shared event and handshake contracts. |
| `@anilkrblt/runtime` | `0.1.0` | Cross-platform React runtime, transport, provider, and adapters. |
| `@anilkrblt/cli` | `0.1.0` | Local WebSocket server and terminal dashboard. |

The repository is an npm workspace monorepo. The root app is private; packages are built as dual ESM/CJS libraries.

## Installation

The packages are scoped under `@anilkrblt`. If they are published as private npm packages, authenticate with npm before installing:

```bash
npm login
```

Install the runtime in your app:

```bash
npm install @anilkrblt/runtime@0.1.0
```

Start the terminal agent:

```bash
npx @anilkrblt/cli start
```

Run with a fixed version and capture profile:

```bash
npx @anilkrblt/cli@0.1.0 start --profile all
```

Useful CLI flags:

```bash
npx @anilkrblt/cli start --port 3799 --profile network
npx @anilkrblt/cli start --profile routes
npx @anilkrblt/cli start --profile errors --filter api.example.com
npx @anilkrblt/cli start --redact api-key,secret,session
```

Profiles:

| Profile | Captures |
| --- | --- |
| `all` | Routes, screen changes, network requests, responses, and errors. |
| `network` | Fetch/Axios requests, responses, and rejected calls. |
| `routes` | Route transitions and React Navigation screen transitions. |
| `errors` | Rejected network calls and HTTP responses with status `>= 400`. |

## Quick Start: Web (React/Vite)

Use the web adapters in browser React apps. Keep adapter arrays stable by defining them outside render.

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import {
  ReactLogProvider,
  createFetchAdapter,
  createRouterAdapter,
} from "@anilkrblt/runtime";

import App from "./App";

const logAdapters = [
  createRouterAdapter(),
  createFetchAdapter(),
];

const redactRules = [
  "authorization",
  "cookie",
  "password",
  "token",
];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactLogProvider
      enabled={import.meta.env.DEV}
      adapters={logAdapters}
      redact={redactRules}
      appName="Web Dashboard"
      host="localhost"
      port={3799}
    >
      <App />
    </ReactLogProvider>
  </React.StrictMode>,
);
```

`createFetchAdapter()` instruments global `window.fetch` only after the CLI acknowledges the session. `createRouterAdapter()` tracks browser History API changes by default and can also receive React Router data-router or history-like objects.

```tsx
// src/main.tsx with a React Router data router
import React from "react";
import ReactDOM from "react-dom/client";
import {
  RouterProvider,
  createBrowserRouter,
} from "react-router-dom";
import {
  ReactLogProvider,
  createFetchAdapter,
  createRouterAdapter,
} from "@anilkrblt/runtime";

import App from "./App";
import Settings from "./Settings";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  },
  {
    path: "/settings",
    element: <Settings />,
  },
]);

const logAdapters = [
  createRouterAdapter({ router }),
  createFetchAdapter(),
];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactLogProvider
      enabled={import.meta.env.DEV}
      adapters={logAdapters}
      redact={["authorization", "cookie", "password", "token"]}
      appName="React Router App"
      host="localhost"
      port={3799}
    >
      <RouterProvider router={router} />
    </ReactLogProvider>
  </React.StrictMode>,
);
```

### Optional Axios Instrumentation

Axios works on web and mobile through the shared Axios adapter.

```tsx
// src/api.ts
import axios from "axios";

export const api = axios.create({
  baseURL: "https://api.example.com",
  headers: {
    "x-client": "web-dashboard",
  },
});
```

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import {
  ReactLogProvider,
  createAxiosAdapter,
  createFetchAdapter,
  createRouterAdapter,
} from "@anilkrblt/runtime";

import App from "./App";
import { api } from "./api";

const logAdapters = [
  createRouterAdapter(),
  createFetchAdapter(),
  createAxiosAdapter(api),
];

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactLogProvider
      enabled={import.meta.env.DEV}
      adapters={logAdapters}
      redact={["authorization", "cookie", "password", "token"]}
      appName="Axios Web App"
    >
      <App api={api} />
    </ReactLogProvider>
  </React.StrictMode>,
);
```

## Quick Start: Mobile (React Native)

React Native apps use the same provider with mobile-specific adapters. Use `createReactNativeFetchAdapter()` for `globalThis.fetch` and `createReactNavigationAdapter(navigationRef)` for screen correlation.

```tsx
// App.tsx
import React from "react";
import {
  Button,
  SafeAreaView,
  Text,
  View,
} from "react-native";
import {
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackScreenProps,
} from "@react-navigation/native-stack";
import {
  ReactLogProvider,
  createReactNativeFetchAdapter,
  createReactNavigationAdapter,
} from "@anilkrblt/runtime";

type RootStackParamList = {
  Home: undefined;
  Details: {
    id: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

const logAdapters = [
  createReactNavigationAdapter(navigationRef),
  createReactNativeFetchAdapter(),
];

const redactRules = [
  "authorization",
  "cookie",
  "password",
  "token",
];

function HomeScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, "Home">) {
  async function loadProfile() {
    await fetch("https://jsonplaceholder.typicode.com/users/1", {
      headers: {
        Authorization: "Bearer mobile-secret-token",
      },
    });
  }

  async function submitSensitivePayload() {
    await fetch("https://jsonplaceholder.typicode.com/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mobile-secret-token",
      },
      body: JSON.stringify({
        username: "mobile-user",
        password: "super-secret-password",
        token: "client-side-token",
      }),
    });
  }

  return (
    <SafeAreaView>
      <View style={{ gap: 12, padding: 24 }}>
        <Text>React Log Agent Mobile Demo</Text>
        <Button title="Load profile" onPress={loadProfile} />
        <Button title="Send redacted payload" onPress={submitSensitivePayload} />
        <Button
          title="Open details"
          onPress={() => navigation.navigate("Details", { id: "42" })}
        />
      </View>
    </SafeAreaView>
  );
}

function DetailsScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, "Details">) {
  return (
    <SafeAreaView>
      <View style={{ padding: 24 }}>
        <Text>Details screen: {route.params.id}</Text>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ReactLogProvider
      enabled={__DEV__}
      adapters={logAdapters}
      redact={redactRules}
      appName="Mobile App"
      host="192.168.1.25"
      port={3799}
    >
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Details" component={DetailsScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ReactLogProvider>
  );
}
```

### Mobile Network Note

On a physical device or emulator, `localhost` usually points to the device, not your development machine. Run the CLI on your computer and pass your computer's LAN IP address to the runtime:

```tsx
<ReactLogProvider
  enabled={__DEV__}
  adapters={logAdapters}
  appName="Mobile App"
  host="192.168.1.25"
  port={3799}
>
  <NavigationContainer ref={navigationRef}>{/* app */}</NavigationContainer>
</ReactLogProvider>
```

Use the IP shown by your operating system for the active Wi-Fi or Ethernet interface, and make sure the device and computer are on the same network.

## Runtime Status

Expose runtime state in a development-only panel with `useReactLogAgent()`.

```tsx
import { useReactLogAgent } from "@anilkrblt/runtime";

export function LogAgentStatus() {
  const agent = useReactLogAgent();

  return (
    <pre>
      {JSON.stringify(
        {
          status: agent.status,
          activeProfile: agent.activeProfile,
          sessionId: agent.sessionId,
          route: agent.currentRouteContext?.path,
        },
        null,
        2,
      )}
    </pre>
  );
}
```

## Feature Showcase

### Cross-Platform Runtime

`@anilkrblt/runtime@0.1.0` targets browser React apps and React Native apps from the same package. The provider activates when `globalThis.WebSocket` is available, making it compatible with browser runtimes and React Native Hermes/JSC engines.

### Performance First

The runtime transport keeps a bounded in-memory queue with a default limit of `100` events. If the CLI is slow after handshake, the oldest logs are dropped first to protect the app.

Flushes use `requestIdleCallback` in browsers when available. React Native falls back to `setImmediate` or `setTimeout(callback, 0)` so Hermes and JSC do not crash on missing browser APIs.

### Privacy Guard

Payloads are sanitized before `JSON.stringify()` and before WebSocket transfer.

The runtime deep-scans plain objects and arrays, matching sensitive keys case-insensitively. Default rules redact:

- `authorization`
- `cookie`
- `password`
- `token`

Matching values become `[REDACTED]`. Circular structures are protected with `WeakSet` and represented as `[Circular]`.

### Event Correlation

Web route adapters and React Navigation adapters update the provider's active route context. Fetch and Axios events automatically inherit that context:

```ts
{
  currentRouteContext: {
    path: "/Home/Details",
    navigationId: "navigation_...",
    title: "Details"
  }
}
```

That lets you read network traffic as part of a user journey instead of isolated requests.

### Adapter Coverage

| Adapter | Platform | Captures |
| --- | --- | --- |
| `createFetchAdapter()` | Web | `window.fetch` requests, responses, rejected calls, headers, latency, and best-effort bodies. |
| `createAxiosAdapter(instance)` | Web and mobile | Axios request, response, and error interceptors with request IDs and latency. |
| `createRouterAdapter(options?)` | Web | Browser History API, React Router data routers, and history-like listeners. |
| `createReactNativeFetchAdapter()` | Mobile | React Native `globalThis.fetch` requests, responses, rejected calls, headers, latency, and best-effort bodies. |
| `createReactNavigationAdapter(navigationRef)` | Mobile | React Navigation screen transitions and active screen context. |

## Protocol Events

Every emitted log conforms to `@anilkrblt/protocol`.

```ts
type LogEvent =
  | RouteTransitionEvent
  | HttpRequestEvent
  | HttpResponseEvent
  | HttpErrorEvent;
```

Each event includes an `id`, `sessionId`, Unix epoch millisecond `timestamp`, source, and optional `currentRouteContext`.

## Local Development

Install workspace dependencies:

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
npm exec --workspace @anilkrblt/cli -- react-log-agent start --help
npm exec --workspace @anilkrblt/cli -- react-log-agent start --profile all
```

## Safety Model

React Log Agent is designed for development-time observability.

- Use `enabled={import.meta.env.DEV}` on web or `enabled={__DEV__}` on React Native.
- Keep the CLI local to your development machine.
- For mobile devices, pass a reachable machine IP through `host`.
- Treat browser and mobile redaction as the final safeguard, not as permission to intentionally log secrets.
- Close the CLI to force adapter cleanup and return the runtime to its no-op state.

## License

MIT
