import type {
  HeaderMap,
  HttpErrorEvent,
  HttpRequestEvent,
  HttpResponseEvent,
  SerializablePayload,
} from "@anilkrblt/protocol";

import type { AdapterFactory, AdapterInstallContext } from "../index";

interface AxiosInterceptorManager {
  use: (onFulfilled?: (value: any) => any, onRejected?: (error: any) => any) => number;
  eject: (id: number) => void;
}

interface AxiosLike {
  interceptors?: {
    request?: AxiosInterceptorManager;
    response?: AxiosInterceptorManager;
  };
}

interface InstrumentableAxios {
  interceptors: {
    request: AxiosInterceptorManager;
    response: AxiosInterceptorManager;
  };
}

interface AxiosMetadata {
  requestId: string;
  startedAt: number;
}

const metadataByConfig = new WeakMap<object, AxiosMetadata>();

/**
 * Creates an adapter that instruments an Axios instance with interceptors.
 */
export function createAxiosAdapter(axiosInstance?: any): AdapterFactory {
  return {
    name: "axios",
    profiles: ["network", "errors", "all"],
    install(context) {
      const instance = resolveAxiosInstance(axiosInstance);

      if (!isAxiosLike(instance)) {
        return () => undefined;
      }

      const requestInterceptorId = instance.interceptors.request.use((config: any) => {
        const requestId = createRuntimeId("request");
        const startedAt = getNow();

        if (isObject(config)) {
          metadataByConfig.set(config, { requestId, startedAt });
        }

        if (shouldEmitRequest(context.activeProfile)) {
          context.emit({
            id: createRuntimeId("event"),
            sessionId: context.sessionId,
            timestamp: Date.now(),
            type: "HTTP_REQUEST",
            source: "axios",
            method: resolveMethod(config),
            url: resolveUrl(config),
            headers: normalizeHeaders(config?.headers),
            body: normalizeBody(config?.data),
            requestId,
          } satisfies HttpRequestEvent);
        }

        return config;
      });

      const responseInterceptorId = instance.interceptors.response.use(
        (response: any) => {
          const metadata = getMetadata(response?.config);
          const status = Number(response?.status ?? 0);

          if (shouldEmitResponse(context.activeProfile, status)) {
            context.emit({
              id: createRuntimeId("event"),
              sessionId: context.sessionId,
              timestamp: Date.now(),
              type: "HTTP_RESPONSE",
              source: "axios",
              status,
              headers: normalizeHeaders(response?.headers),
              body: normalizeBody(response?.data),
              latency: getLatency(metadata.startedAt),
              requestId: metadata.requestId,
            } satisfies HttpResponseEvent);
          }

          return response;
        },
        (error: any) => {
          const metadata = getMetadata(error?.config);
          const status = Number(error?.response?.status ?? 0);
          const latency = getLatency(metadata.startedAt);

          if (error?.response && shouldEmitResponse(context.activeProfile, status)) {
            context.emit({
              id: createRuntimeId("event"),
              sessionId: context.sessionId,
              timestamp: Date.now(),
              type: "HTTP_RESPONSE",
              source: "axios",
              status,
              headers: normalizeHeaders(error.response.headers),
              body: normalizeBody(error.response.data),
              latency,
              requestId: metadata.requestId,
            } satisfies HttpResponseEvent);
          }

          if (shouldEmitError(context.activeProfile)) {
            const normalizedError = normalizeError(error);
            context.emit({
              id: createRuntimeId("event"),
              sessionId: context.sessionId,
              timestamp: Date.now(),
              type: "HTTP_ERROR",
              source: "axios",
              errorName: normalizedError.name,
              errorMessage: normalizedError.message,
              code: normalizedError.code,
              latency,
              requestId: metadata.requestId,
            } satisfies HttpErrorEvent);
          }

          return Promise.reject(error);
        },
      );

      return () => {
        instance.interceptors?.request?.eject(requestInterceptorId);
        instance.interceptors?.response?.eject(responseInterceptorId);
      };
    },
  };
}

function resolveAxiosInstance(axiosInstance: any): AxiosLike | undefined {
  if (axiosInstance) {
    return axiosInstance as AxiosLike;
  }

  return (globalThis as typeof globalThis & { axios?: AxiosLike }).axios;
}

function isAxiosLike(value: unknown): value is InstrumentableAxios {
  return (
    isObjectLike(value) &&
    isObjectLike(value.interceptors) &&
    isInterceptorManager(value.interceptors.request) &&
    isInterceptorManager(value.interceptors.response)
  );
}

function isInterceptorManager(value: unknown): value is AxiosInterceptorManager {
  return (
    isObjectLike(value) &&
    typeof value.use === "function" &&
    typeof value.eject === "function"
  );
}

function resolveMethod(config: any): string {
  return String(config?.method ?? "GET").toUpperCase();
}

function resolveUrl(config: any): string {
  const url = String(config?.url ?? "");
  const baseUrl = config?.baseURL ? String(config.baseURL) : undefined;

  if (!baseUrl) {
    return url;
  }

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  }
}

function normalizeHeaders(headers: unknown): HeaderMap {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const result: HeaderMap = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  if (isObject(headers) && typeof headers.toJSON === "function") {
    return normalizeHeaders(headers.toJSON());
  }

  if (!isObject(headers)) {
    return {};
  }

  const result: HeaderMap = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) {
      continue;
    }

    result[key] = Array.isArray(value)
      ? value.map(String).join(", ")
      : String(value);
  }

  return result;
}

function normalizeBody(value: unknown): SerializablePayload | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string") {
    return parseJsonLikeString(value);
  }

  return value;
}

function parseJsonLikeString(value: string): SerializablePayload {
  const trimmed = value.trim();
  const looksLikeJson =
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"));

  if (!looksLikeJson) {
    return value;
  }

  try {
    return JSON.parse(trimmed) as SerializablePayload;
  } catch {
    return value;
  }
}

function getMetadata(config: unknown): AxiosMetadata {
  if (isObject(config)) {
    const metadata = metadataByConfig.get(config);

    if (metadata) {
      return metadata;
    }
  }

  return {
    requestId: createRuntimeId("request"),
    startedAt: getNow(),
  };
}

function shouldEmitRequest(profile: string): boolean {
  return profile === "network" || profile === "all";
}

function shouldEmitResponse(profile: string, status: number): boolean {
  if (profile === "network" || profile === "all") {
    return true;
  }

  return profile === "errors" && status >= 400;
}

function shouldEmitError(profile: string): boolean {
  return profile === "network" || profile === "errors" || profile === "all";
}

function normalizeError(error: unknown): {
  name: string;
  message: string;
  code?: string;
} {
  if (error instanceof Error) {
    const errorWithCode = error as Error & { code?: unknown };

    return {
      name: error.name || "Error",
      message: error.message,
      code: typeof errorWithCode.code === "string" ? errorWithCode.code : undefined,
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function isObjectLike(value: unknown): value is Record<string, any> {
  return (typeof value === "object" || typeof value === "function") && value !== null;
}

function getNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function getLatency(startedAt: number): number {
  const latency = getNow() - startedAt;
  return Math.round(latency * 100) / 100;
}

function createRuntimeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}
