# ⚡ React Log Agent

[![Version](https://img.shields.io/badge/version-0.1.0-111827)](./packages/runtime/package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18%2B-61dafb?logo=react&logoColor=111)](https://react.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-Hermes%20%2F%20JSC-61dafb?logo=react&logoColor=111)](https://reactnative.dev/)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Monorepo](https://img.shields.io/badge/npm-workspaces-cb3837?logo=npm&logoColor=white)](https://docs.npmjs.com/cli/using-npm/workspaces)

React Log Agent is a performance-first, opt-in developer telemetry tool for React and React Native applications. Capture browser fetches, React Native fetches, Axios calls, route transitions, and React Navigation screen changes directly into one local terminal dashboard with zero overhead when disconnected.

Version `0.1.0` now includes the premium `ReactLogAgent` wrapper for one-minute setup, cross-platform web/mobile adapter presets, implicit CLI startup, and deep redaction for stringified JSON echoed inside response bodies.

## Architecture

```text
                         @anilkrblt/runtime
                          ReactLogAgent

        Browser / Web                                  Mobile / React Native
  React + Vite / Next / CRA                      Hermes / JSC + React Navigation
  adapters="web"                                adapters="mobile"
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

The runtime is inert by default. When `enabled={false}`, no socket is opened, no adapter is installed, and no browser or mobile global is patched. When enabled, `ReactLogAgent` or `ReactLogProvider` connects to the CLI, waits for `SERVER_ACK`, then installs only the adapters requested by the active capture profile.

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
npx @anilkrblt/cli
```

By default the CLI binds to `0.0.0.0` so browser apps, Android emulators, and physical mobile devices can reach it during development. Bind explicitly when you need a narrower or fixed interface:

```bash
npx @anilkrblt/cli --host localhost
npx @anilkrblt/cli --host 0.0.0.0 --profile all
npx @anilkrblt/cli --host 192.168.1.25 --port 3799
```

Run with a fixed version and capture profile:

```bash
npx @anilkrblt/cli@0.1.0 --profile all
```

Useful CLI flags:

```bash
npx @anilkrblt/cli --host 0.0.0.0 --port 3799 --profile all
npx @anilkrblt/cli --port 3799 --profile network
npx @anilkrblt/cli --profile routes
npx @anilkrblt/cli --profile errors --filter api.example.com
npx @anilkrblt/cli --redact api-key,secret,session
```

The older explicit start form remains supported for compatibility:

```bash
npx @anilkrblt/cli start --profile all
```

Profiles:

| Profile | Captures |
| --- | --- |
| `all` | Routes, screen changes, network requests, responses, and errors. |
| `network` | Fetch/Axios requests, responses, and rejected calls. |
| `routes` | Route transitions and React Navigation screen transitions. |
| `errors` | Rejected network calls and HTTP responses with status `>= 400`. |

## Quick Start: Web (React/Vite)

Use the high-level wrapper for the default web preset: global `fetch` plus browser route tracking. The runtime still stays fully opt-in through `enabled`.

```tsx
// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ReactLogAgent } from "@anilkrblt/runtime";

import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactLogAgent
      enabled={import.meta.env.DEV}
      appName="Web Dashboard"
    >
      <App />
    </ReactLogAgent>
  </React.StrictMode>,
);
```

`ReactLogAgent` defaults to `host="localhost"`, `port={3799}`, `adapters="web"`, and redaction rules for `authorization`, `cookie`, `password`, and `token`.

Override any default when you need to:

```tsx
<ReactLogAgent
  enabled={import.meta.env.DEV}
  appName="Internal Admin"
  host="127.0.0.1"
  port={3800}
  redact={["authorization", "cookie", "password", "token", "api-key"]}
>
  <App />
</ReactLogAgent>
```

For custom routing, Axios, or adapter control, use the low-level provider directly. Keep adapter arrays stable by defining them outside render.

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

React Native apps use the same wrapper with the mobile preset. Use `adapters="mobile"` for `globalThis.fetch`; pass `navigationRef` to enable React Navigation screen correlation.

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
import { ReactLogAgent } from "@anilkrblt/runtime";

type RootStackParamList = {
  Home: undefined;
  Details: {
    id: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

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
    <ReactLogAgent
      enabled={__DEV__}
      adapters="mobile"
      navigationRef={navigationRef}
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
    </ReactLogAgent>
  );
}
```

### Mobile Network Note

For mobile development, start the CLI on an interface the device can reach:

```bash
npx @anilkrblt/cli --host 0.0.0.0 --profile all
```

Use the runtime host that matches your target:

| Target | Runtime host | CLI requirement |
| --- | --- | --- |
| Web browser | `host="localhost"` | Any normal local CLI bind works. |
| iOS simulator | `host="localhost"` | Any normal local CLI bind works. |
| Android emulator | `host="10.0.2.2"` | Start CLI with `--host 0.0.0.0`. |
| Android USB device | `host="localhost"` | Run `adb reverse tcp:3799 tcp:3799` first. |
| Physical device Wi-Fi | `host="<LAN_IP>"` | Start CLI with `--host 0.0.0.0` or `--host <LAN_IP>`. |

Physical-device example:

```tsx
<ReactLogAgent
  enabled={__DEV__}
  adapters="mobile"
  navigationRef={navigationRef}
  appName="Mobile App"
  host="192.168.1.25"
  port={3799}
>
  <NavigationContainer ref={navigationRef}>{/* app */}</NavigationContainer>
</ReactLogAgent>
```

Use the IP shown by your operating system for the active Wi-Fi or Ethernet interface, and make sure the device and computer are on the same network.

### Expo Environment Setup

Expo apps can keep the runtime host outside source code with an Expo public environment variable:

```bash
EXPO_PUBLIC_REACT_LOG_AGENT_HOST=10.0.2.2
```

```tsx
<ReactLogAgent
  enabled={__DEV__}
  adapters="mobile"
  navigationRef={navigationRef}
  appName="Expo App"
  host={process.env.EXPO_PUBLIC_REACT_LOG_AGENT_HOST ?? "localhost"}
  port={3799}
>
  <NavigationContainer ref={navigationRef}>{/* app */}</NavigationContainer>
</ReactLogAgent>
```

Choose the env value per runtime:

- Android emulator: `EXPO_PUBLIC_REACT_LOG_AGENT_HOST=10.0.2.2`
- iOS simulator: `EXPO_PUBLIC_REACT_LOG_AGENT_HOST=localhost`
- Physical device Wi-Fi: `EXPO_PUBLIC_REACT_LOG_AGENT_HOST=<LAN_IP>`
- Android USB with reverse tunnel: `EXPO_PUBLIC_REACT_LOG_AGENT_HOST=localhost`

### Expo Go Troubleshooting

If Expo Go shows "Something went wrong" or the CLI keeps waiting without logs, the app code may be fine and the issue may be host reachability.

- Confirm the CLI says `Listening: ws://0.0.0.0:3799` or is bound to your LAN IP.
- Confirm the runtime `host` matches the table above for the emulator, simulator, USB device, or physical device.
- Confirm the Expo dev server connection mode and React Log Agent host are both reachable from the same device/runtime.
- On Android USB, re-run `adb reverse tcp:3799 tcp:3799` after reconnecting the device.

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

### Premium DX Wrapper

`ReactLogAgent` is the recommended entrypoint for most apps. It wraps `ReactLogProvider` with stable defaults:

- `host="localhost"`
- `port={3799}`
- `redact={["authorization", "cookie", "password", "token"]}`
- `adapters="web"` for browser `fetch` plus route tracking
- `adapters="mobile"` for React Native `fetch`, with React Navigation correlation when `navigationRef` is provided

Power users can still use `ReactLogProvider` and explicit adapter factories directly.

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

Stringified JSON fields are sanitized too. If a response body echoes request data as a JSON string, the runtime parses that field, redacts nested sensitive keys, and serializes it back before sending anything over the WebSocket.

For example, a response payload like this:

```json
{
  "data": "{\"password\":\"super-gizli-sifre\",\"token\":\"client-side-token\"}"
}
```

is sent to the CLI as:

```json
{
  "data": "{\"password\":\"[REDACTED]\",\"token\":\"[REDACTED]\"}"
}
```

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

| Wrapper | Platform | Defaults |
| --- | --- | --- |
| `ReactLogAgent` | Web and mobile | One-minute setup with redaction defaults and web/mobile adapter presets. |

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
npm exec --workspace @anilkrblt/cli -- react-log-agent --help
npm exec --workspace @anilkrblt/cli -- react-log-agent --profile all
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
