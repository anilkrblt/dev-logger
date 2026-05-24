import React from "react";
import { renderToString } from "react-dom/server";

import {
  ReactLogProvider,
  createReactNativeFetchAdapter,
  createRouterAdapter,
  type AdapterInstallContext,
} from "../src/index";

type MutableGlobal = typeof globalThis & {
  window?: unknown;
};

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

function withReactNativeLikeWindow(run: () => void): void {
  const scope = globalThis as MutableGlobal;
  const hadWindow = Object.prototype.hasOwnProperty.call(scope, "window");
  const previousWindow = scope.window;

  scope.window = {};

  try {
    run();
  } finally {
    if (hadWindow) {
      scope.window = previousWindow;
    } else {
      delete scope.window;
    }
  }
}

test("ReactLogProvider does not read missing window.location during mobile render", () => {
  withReactNativeLikeWindow(() => {
    renderToString(
      <ReactLogProvider
        enabled={true}
        adapters={[createReactNativeFetchAdapter()]}
        appName="Mobile App"
      >
        <div>mobile app</div>
      </ReactLogProvider>,
    );
  });
});

test("browser router fallback is inert when window.history and window.location are missing", () => {
  withReactNativeLikeWindow(() => {
    const routeContexts: string[] = [];
    const context: AdapterInstallContext = {
      emit: () => undefined,
      activeProfile: "all",
      filterPatterns: [],
      sessionId: "test-session",
      getCurrentRouteContext: () => undefined,
      setCurrentRouteContext: (routeContext) => {
        routeContexts.push(routeContext.path);
      },
    };

    const cleanup = createRouterAdapter().install(context);
    cleanup();

    if (routeContexts[0] !== "/") {
      throw new Error(`Expected router fallback path "/", received ${routeContexts[0] ?? "undefined"}`);
    }
  });
});
