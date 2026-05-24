import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from "react";
import type {
  AdapterName,
  CaptureProfile,
  ClientHelloPayload,
  CurrentRouteContext,
  LogEvent,
  ServerAckPayload,
} from "@react-log-agent/protocol";

import { createFetchAdapter } from "./adapters/fetch";
import { createAxiosAdapter } from "./adapters/axios";
import { createRouterAdapter } from "./adapters/router";
import {
  createWebSocketTransport,
  type RuntimeConnectionStatus,
  type WebSocketTransport,
} from "./transport/websocket";

export type {
  AdapterName,
  BaseEvent,
  CaptureProfile,
  ClientHelloPayload,
  CurrentRouteContext,
  HandshakePayload,
  HeaderMap,
  HttpErrorEvent,
  HttpLogSource,
  HttpRequestEvent,
  HttpResponseEvent,
  LogEvent,
  LogSource,
  RouteTransitionEvent,
  ServerAckPayload,
} from "@react-log-agent/protocol";

export { createAxiosAdapter, createFetchAdapter, createRouterAdapter };
export type { RuntimeConnectionStatus, WebSocketTransport };

/**
 * Cleanup function returned by an installed runtime adapter.
 */
export type AdapterCleanup = () => void;

/**
 * Emits a fully-formed protocol event to the active transport.
 */
export type RuntimeEmit = (event: LogEvent) => void;

/**
 * Context passed to adapters after the CLI bridge acknowledges the session.
 */
export interface AdapterInstallContext {
  emit: RuntimeEmit;
  activeProfile: CaptureProfile;
  filterPatterns: readonly string[];
  sessionId: string;
  getCurrentRouteContext: () => CurrentRouteContext | undefined;
  setCurrentRouteContext: (context: CurrentRouteContext) => void;
}

/**
 * Adapter factory installed by {@link ReactLogProvider} after SERVER_ACK.
 */
export interface AdapterFactory {
  name: AdapterName;
  profiles: readonly CaptureProfile[];
  install: (context: AdapterInstallContext) => AdapterCleanup;
}

/**
 * Public runtime state exposed through {@link useReactLogAgent}.
 */
export interface ReactLogAgentState {
  enabled: boolean;
  status: RuntimeConnectionStatus;
  activeProfile?: CaptureProfile;
  sessionId?: string;
  currentRouteContext?: CurrentRouteContext;
}

/**
 * Props for the browser-side React Log Agent provider.
 */
export interface ReactLogProviderProps {
  enabled: boolean;
  adapters: readonly AdapterFactory[];
  redact?: readonly string[];
  children: ReactNode;
  host?: string;
  port?: number;
  appName?: string;
  sdkVersion?: string;
  queueLimit?: number;
}

const DEFAULT_PORT = 3799;
const DEFAULT_HOST = "localhost";
const DEFAULT_SDK_VERSION = "0.0.0";

const disabledState: ReactLogAgentState = {
  enabled: false,
  status: "disabled",
};

const ReactLogAgentContext = createContext<ReactLogAgentState>(disabledState);

/**
 * Reads the current React Log Agent runtime state.
 */
export function useReactLogAgent(): ReactLogAgentState {
  return useContext(ReactLogAgentContext);
}

/**
 * Activates runtime logging only after the local CLI bridge acknowledges the
 * session. When disabled, no socket is opened and no adapters are installed.
 */
export function ReactLogProvider({
  enabled,
  adapters,
  redact = [],
  children,
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  appName,
  sdkVersion = DEFAULT_SDK_VERSION,
  queueLimit = 100,
}: ReactLogProviderProps) {
  const [state, setState] = useState<ReactLogAgentState>(() => ({
    enabled,
    status: enabled && canUseBrowserRuntime() ? "connecting" : "disabled",
  }));

  const adapterNames = useMemo(
    () => adapters.map((adapter) => adapter.name),
    [adapters],
  );
  const installedAdaptersRef = useRef<AdapterCleanup[]>([]);
  const currentRouteContextRef = useRef<CurrentRouteContext | undefined>(
    readBrowserRouteContext(),
  );

  useEffect(() => {
    if (!enabled || !canUseBrowserRuntime()) {
      uninstallAdapters(installedAdaptersRef.current);
      setState(disabledState);
      return;
    }

    let disposed = false;
    const sessionId = createRuntimeId("session");
    const clientHello: ClientHelloPayload = {
      kind: "CLIENT_HELLO",
      appName: appName ?? getDefaultAppName(),
      sdkVersion,
      availableAdapters: adapterNames,
    };

    const setLiveState = (nextState: SetStateAction<ReactLogAgentState>) => {
      if (!disposed) {
        setState(nextState);
      }
    };

    const uninstallActiveAdapters = () => {
      uninstallAdapters(installedAdaptersRef.current);
      installedAdaptersRef.current = [];
    };

    const getActiveRouteContext = () => currentRouteContextRef.current ?? readBrowserRouteContext();

    const setActiveRouteContext = (routeContext: CurrentRouteContext) => {
      currentRouteContextRef.current = routeContext;
      setLiveState((current) => ({
        ...current,
        currentRouteContext: routeContext,
      }));
    };

    setLiveState({
      enabled: true,
      status: "connecting",
      sessionId,
      currentRouteContext: getActiveRouteContext(),
    });

    const transport = createWebSocketTransport({
      url: buildWebSocketUrl(host, port),
      clientHello,
      localRedactRules: redact,
      queueLimit,
      getCurrentRouteContext: getActiveRouteContext,
      onStatusChange: (status) => {
        setLiveState((current) => ({
          ...current,
          enabled: true,
          status,
          sessionId,
        }));
      },
      onAck: (ack) => {
        if (disposed) {
          return;
        }

        uninstallActiveAdapters();

        const context: AdapterInstallContext = {
          emit: transport.emit,
          activeProfile: ack.activeProfile,
          filterPatterns: ack.filterPatterns,
          sessionId,
          getCurrentRouteContext: getActiveRouteContext,
          setCurrentRouteContext: setActiveRouteContext,
        };

        for (const adapter of adapters) {
          if (!shouldInstallAdapter(adapter, ack.activeProfile)) {
            continue;
          }

          try {
            installedAdaptersRef.current.push(adapter.install(context));
          } catch {
            uninstallActiveAdapters();
            setLiveState({
              enabled: true,
              status: "error",
              activeProfile: ack.activeProfile,
              sessionId,
            });
            transport.close();
            return;
          }
        }

        setLiveState({
          enabled: true,
          status: "active",
          activeProfile: ack.activeProfile,
          sessionId,
          currentRouteContext: getActiveRouteContext(),
        });
      },
      onDisconnect: uninstallActiveAdapters,
    });

    return () => {
      disposed = true;
      uninstallActiveAdapters();
      transport.close();
    };
  }, [
    enabled,
    adapters,
    adapterNames,
    appName,
    host,
    port,
    queueLimit,
    redact,
    sdkVersion,
  ]);

  const contextValue = useMemo<ReactLogAgentState>(
    () => state,
    [state],
  );

  return (
    <ReactLogAgentContext.Provider value={contextValue}>
      {children}
    </ReactLogAgentContext.Provider>
  );
}

function shouldInstallAdapter(
  adapter: AdapterFactory,
  activeProfile: CaptureProfile,
): boolean {
  return (
    adapter.profiles.includes(activeProfile) ||
    (activeProfile === "all" && adapter.profiles.length > 0)
  );
}

function uninstallAdapters(cleanups: AdapterCleanup[]): void {
  for (let index = cleanups.length - 1; index >= 0; index -= 1) {
    try {
      cleanups[index]?.();
    } catch {
      // Adapter cleanup must never break provider teardown.
    }
  }
  cleanups.length = 0;
}

function buildWebSocketUrl(host: string, port: number): string {
  return `ws://${host}:${port}`;
}

function getDefaultAppName(): string {
  if (typeof document !== "undefined" && document.title) {
    return document.title;
  }

  return "React App";
}

function readBrowserRouteContext(): CurrentRouteContext | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  return {
    path,
    title: typeof document === "undefined" ? undefined : document.title,
  };
}

function canUseBrowserRuntime(): boolean {
  return typeof window !== "undefined" && typeof WebSocket !== "undefined";
}

function createRuntimeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}
