import type { CurrentRouteContext, RouteTransitionEvent } from "@anilkrblt/protocol";

import type { AdapterFactory, AdapterInstallContext } from "../index";

interface RouterLocationLike {
  pathname?: string;
  search?: string;
  hash?: string;
}

interface HistoryLike {
  location?: RouterLocationLike;
  listen?: (listener: (update: RouterLocationLike | { location?: RouterLocationLike }) => void) => void | (() => void);
}

interface DataRouterLike {
  state?: {
    location?: RouterLocationLike;
  };
  subscribe?: (listener: () => void) => void | (() => void);
}

export interface RouterAdapterOptions {
  history?: HistoryLike;
  router?: DataRouterLike;
  getLocation?: () => RouterLocationLike | string;
}

/**
 * Creates a route adapter for React Router data routers, history-like objects,
 * or browser History API navigation.
 */
export function createRouterAdapter(options: RouterAdapterOptions = {}): AdapterFactory {
  return {
    name: "router",
    profiles: ["routes", "all"],
    install(context) {
      let currentPath = getCurrentPath(options);
      context.setCurrentRouteContext(createRouteContext(currentPath));

      const emitTransition = (nextPath: string) => {
        if (!matchesFilterPatterns(nextPath, context.filterPatterns) || nextPath === currentPath) {
          return;
        }

        const previousPath = currentPath;
        const navigationId = createRuntimeId("navigation");
        const routeContext = createRouteContext(nextPath, navigationId);
        currentPath = nextPath;
        context.setCurrentRouteContext(routeContext);

        context.emit({
          id: createRuntimeId("event"),
          sessionId: context.sessionId,
          timestamp: Date.now(),
          type: "ROUTE_TRANSITION",
          source: "router",
          from: previousPath,
          to: nextPath,
          navigationId,
          currentRouteContext: routeContext,
        } satisfies RouteTransitionEvent);
      };

      const cleanup = installBestRouterListener(options, emitTransition);

      return () => {
        cleanup();
      };
    },
  };
}

function installBestRouterListener(
  options: RouterAdapterOptions,
  emitTransition: (nextPath: string) => void,
): () => void {
  if (options.router?.subscribe) {
    const unsubscribe = options.router.subscribe(() => {
      emitTransition(pathFromLocation(options.router?.state?.location));
    });

    return typeof unsubscribe === "function" ? unsubscribe : () => undefined;
  }

  if (options.history?.listen) {
    const unlisten = options.history.listen((update) => {
      const location = isLocationUpdate(update) ? update.location : update;
      emitTransition(pathFromLocation(location));
    });

    return typeof unlisten === "function" ? unlisten : () => undefined;
  }

  return installBrowserHistoryListener(emitTransition);
}

function isLocationUpdate(
  value: RouterLocationLike | { location?: RouterLocationLike } | undefined,
): value is { location?: RouterLocationLike } {
  return typeof value === "object" && value !== null && "location" in value;
}

function installBrowserHistoryListener(emitTransition: (nextPath: string) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;

  window.history.pushState = function pushStateWithRouteLogging(...args) {
    const result = originalPushState.apply(this, args);
    emitTransition(pathFromWindow());
    return result;
  };

  window.history.replaceState = function replaceStateWithRouteLogging(...args) {
    const result = originalReplaceState.apply(this, args);
    emitTransition(pathFromWindow());
    return result;
  };

  const handlePopState = () => {
    emitTransition(pathFromWindow());
  };

  window.addEventListener("popstate", handlePopState);

  return () => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", handlePopState);
  };
}

function getCurrentPath(options: RouterAdapterOptions): string {
  if (options.getLocation) {
    return pathFromLocation(options.getLocation());
  }

  if (options.router?.state?.location) {
    return pathFromLocation(options.router.state.location);
  }

  if (options.history?.location) {
    return pathFromLocation(options.history.location);
  }

  return pathFromWindow();
}

function pathFromLocation(location: RouterLocationLike | string | undefined): string {
  if (typeof location === "string") {
    return location || "/";
  }

  if (!location) {
    return pathFromWindow();
  }

  return `${location.pathname ?? "/"}${location.search ?? ""}${location.hash ?? ""}`;
}

function pathFromWindow(): string {
  if (typeof window === "undefined") {
    return "/";
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function createRouteContext(path: string, navigationId?: string): CurrentRouteContext {
  return {
    path,
    navigationId,
    title: typeof document === "undefined" ? undefined : document.title,
  };
}

function matchesFilterPatterns(value: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }

  return patterns.some((pattern) => {
    if (pattern === "*") {
      return true;
    }

    if (!pattern.includes("*")) {
      return value.includes(pattern);
    }

    return wildcardToRegExp(pattern).test(value);
  });
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${escaped}$`);
}

function createRuntimeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}
