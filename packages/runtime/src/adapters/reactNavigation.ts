import type { CurrentRouteContext, RouteTransitionEvent } from "@anilkrblt/protocol";

import type { AdapterFactory } from "../index";

interface NavigationRoute {
  key?: string;
  name?: string;
  params?: Record<string, unknown>;
  state?: NavigationState;
}

interface NavigationState {
  index?: number;
  routes?: NavigationRoute[];
}

interface NavigationRefLike {
  addListener?: (eventName: "state", listener: () => void) => void | (() => void);
  getCurrentRoute?: () => NavigationRoute | undefined;
  getRootState?: () => NavigationState | undefined;
}

/**
 * Creates an adapter for React Navigation state changes.
 */
export function createReactNavigationAdapter(navigationRef: any): AdapterFactory {
  return {
    name: "react-navigation",
    profiles: ["routes", "all"],
    install(context) {
      const ref = navigationRef as NavigationRefLike | undefined;

      if (!ref) {
        return () => undefined;
      }

      let currentRoute = resolveActiveRoute(ref);
      if (currentRoute) {
        context.setCurrentRouteContext(createRouteContext(currentRoute.path, undefined, currentRoute.title));
      }

      const emitTransition = () => {
        const nextRoute = resolveActiveRoute(ref);

        if (!nextRoute || nextRoute.path === currentRoute?.path) {
          return;
        }

        if (!matchesFilterPatterns(nextRoute.path, context.filterPatterns)) {
          currentRoute = nextRoute;
          return;
        }

        const previousPath = currentRoute?.path ?? "/";
        const navigationId = createRuntimeId("navigation");
        const routeContext = createRouteContext(nextRoute.path, navigationId, nextRoute.title);
        currentRoute = nextRoute;
        context.setCurrentRouteContext(routeContext);

        context.emit({
          id: createRuntimeId("event"),
          sessionId: context.sessionId,
          timestamp: Date.now(),
          type: "ROUTE_TRANSITION",
          source: "router",
          from: previousPath,
          to: nextRoute.path,
          navigationId,
          currentRouteContext: routeContext,
        } satisfies RouteTransitionEvent);
      };

      const unsubscribe = typeof ref.addListener === "function"
        ? ref.addListener("state", emitTransition)
        : undefined;

      return () => {
        if (typeof unsubscribe === "function") {
          unsubscribe();
        }
      };
    },
  };
}

function resolveActiveRoute(ref: NavigationRefLike): { path: string; title?: string } | undefined {
  const currentRoute = typeof ref.getCurrentRoute === "function"
    ? ref.getCurrentRoute()
    : undefined;

  if (currentRoute?.name) {
    return {
      path: `/${currentRoute.name}`,
      title: currentRoute.name,
    };
  }

  const rootState = typeof ref.getRootState === "function"
    ? ref.getRootState()
    : undefined;

  if (!rootState) {
    return undefined;
  }

  const routeChain = getActiveRouteChain(rootState);

  if (routeChain.length === 0) {
    return undefined;
  }

  return {
    path: `/${routeChain.map((route) => route.name ?? route.key ?? "unknown").join("/")}`,
    title: routeChain.at(-1)?.name,
  };
}

function getActiveRouteChain(state: NavigationState): NavigationRoute[] {
  const routes = state.routes ?? [];

  if (routes.length === 0) {
    return [];
  }

  const index = normalizeRouteIndex(state.index, routes.length);
  const activeRoute = routes[index];

  if (!activeRoute) {
    return [];
  }

  return [
    activeRoute,
    ...getActiveRouteChain(activeRoute.state ?? {}),
  ];
}

function normalizeRouteIndex(index: number | undefined, routeCount: number): number {
  if (index === undefined || index < 0 || index >= routeCount) {
    return routeCount - 1;
  }

  return index;
}

function createRouteContext(
  path: string,
  navigationId: string | undefined,
  title: string | undefined,
): CurrentRouteContext {
  return {
    path,
    navigationId,
    title,
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
