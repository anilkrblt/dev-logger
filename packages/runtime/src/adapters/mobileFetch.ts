import type {
  HeaderMap,
  HttpErrorEvent,
  HttpRequestEvent,
  HttpResponseEvent,
  SerializablePayload,
} from "@anilkrblt/protocol";

import type { AdapterFactory, AdapterInstallContext } from "../index";

const DEFAULT_MAX_BODY_LENGTH = 64_000;

let activeMobileFetchCleanup: (() => void) | undefined;

interface ReactNativeGlobal {
  fetch?: typeof fetch;
  navigator?: {
    product?: string;
  };
  nativeCallSyncHook?: unknown;
  HermesInternal?: unknown;
}

/**
 * Options for React Native global fetch instrumentation.
 */
export interface ReactNativeFetchAdapterOptions {
  maxBodyLength?: number;
}

/**
 * Creates an adapter that instruments React Native global.fetch.
 */
export function createReactNativeFetchAdapter(
  options: ReactNativeFetchAdapterOptions = {},
): AdapterFactory {
  return {
    name: "react-native-fetch",
    profiles: ["network", "errors", "all"],
    install(context) {
      const runtime = globalThis as typeof globalThis & ReactNativeGlobal;

      if (
        activeMobileFetchCleanup ||
        !isReactNativeRuntime(runtime) ||
        typeof runtime.fetch !== "function"
      ) {
        return () => undefined;
      }

      const maxBodyLength = options.maxBodyLength ?? DEFAULT_MAX_BODY_LENGTH;
      const originalFetch = runtime.fetch;
      const callOriginalFetch = originalFetch.bind(runtime);

      runtime.fetch = async function reactLogAgentReactNativeFetch(
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> {
        const url = resolveRequestUrl(input);

        if (!matchesFilterPatterns(url, context.filterPatterns)) {
          return callOriginalFetch(input, init);
        }

        const requestId = createRuntimeId("request");
        const startedAt = getNow();
        const method = resolveRequestMethod(input, init);

        if (shouldEmitRequest(context.activeProfile)) {
          context.emit({
            id: createRuntimeId("event"),
            sessionId: context.sessionId,
            timestamp: Date.now(),
            type: "HTTP_REQUEST",
            source: "fetch",
            method,
            url,
            headers: resolveRequestHeaders(input, init),
            body: resolveRequestBody(input, init, maxBodyLength),
            requestId,
            currentRouteContext: context.getCurrentRouteContext(),
          } satisfies HttpRequestEvent);
        }

        try {
          const response = await callOriginalFetch(input, init);
          const latency = getLatency(startedAt);

          if (shouldEmitResponse(context.activeProfile, response.status)) {
            emitResponseEvent({
              context,
              requestId,
              response,
              latency,
              maxBodyLength,
            });
          }

          return response;
        } catch (error) {
          if (shouldEmitError(context.activeProfile)) {
            const normalizedError = normalizeError(error);
            context.emit({
              id: createRuntimeId("event"),
              sessionId: context.sessionId,
              timestamp: Date.now(),
              type: "HTTP_ERROR",
              source: "fetch",
              errorName: normalizedError.name,
              errorMessage: normalizedError.message,
              code: normalizedError.code,
              latency: getLatency(startedAt),
              requestId,
              currentRouteContext: context.getCurrentRouteContext(),
            } satisfies HttpErrorEvent);
          }

          throw error;
        }
      };

      activeMobileFetchCleanup = () => {
        runtime.fetch = originalFetch;
        activeMobileFetchCleanup = undefined;
      };

      return activeMobileFetchCleanup;
    },
  };
}

interface EmitResponseEventOptions {
  context: AdapterInstallContext;
  requestId: string;
  response: Response;
  latency: number;
  maxBodyLength: number;
}

function emitResponseEvent({
  context,
  requestId,
  response,
  latency,
  maxBodyLength,
}: EmitResponseEventOptions): void {
  const baseEvent = {
    id: createRuntimeId("event"),
    sessionId: context.sessionId,
    timestamp: Date.now(),
    type: "HTTP_RESPONSE",
    source: "fetch",
    status: response.status,
    headers: normalizeHeaders(response.headers),
    latency,
    requestId,
    currentRouteContext: context.getCurrentRouteContext(),
  } satisfies Omit<HttpResponseEvent, "body">;

  void readResponseBody(response, maxBodyLength)
    .then((body) => {
      context.emit({
        ...baseEvent,
        ...(body === undefined ? {} : { body }),
      });
    })
    .catch(() => {
      context.emit(baseEvent);
    });
}

function isReactNativeRuntime(runtime: ReactNativeGlobal): boolean {
  return (
    runtime.navigator?.product === "ReactNative" ||
    runtime.nativeCallSyncHook !== undefined ||
    runtime.HermesInternal !== undefined
  );
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

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (isRequestLike(input) && typeof input.url === "string") {
    return input.url;
  }

  return String(input);
}

function resolveRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const method = init?.method ?? (isRequestLike(input) ? input.method : undefined) ?? "GET";
  return method.toUpperCase();
}

function resolveRequestHeaders(input: RequestInfo | URL, init?: RequestInit): HeaderMap {
  return normalizeMergedHeaders([
    isRequestLike(input) ? input.headers : undefined,
    init?.headers,
  ]);
}

function resolveRequestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  maxBodyLength: number,
): SerializablePayload | undefined {
  if (init?.body !== undefined && init.body !== null) {
    return serializeBody(init.body, maxBodyLength);
  }

  if (isRequestLike(input)) {
    return "[Request body unavailable without consuming stream]";
  }

  return undefined;
}

function normalizeMergedHeaders(sources: readonly unknown[]): HeaderMap {
  const result: HeaderMap = {};

  for (const source of sources) {
    mergeHeaders(result, source);
  }

  return result;
}

function normalizeHeaders(headers: unknown): HeaderMap {
  const result: HeaderMap = {};
  mergeHeaders(result, headers);
  return result;
}

function mergeHeaders(result: HeaderMap, source: unknown): void {
    if (!source) {
    return;
    }

    if (isHeadersLike(source)) {
      source.forEach((value, key) => {
        result[key] = value;
      });
    return;
    }

    if (Array.isArray(source)) {
      for (const entry of source) {
        if (Array.isArray(entry) && entry.length >= 2) {
          result[String(entry[0])] = String(entry[1]);
        }
      }
    return;
    }

    if (isRecord(source)) {
      for (const [key, value] of Object.entries(source)) {
        if (value === undefined || value === null) {
          continue;
        }

        result[key] = Array.isArray(value)
          ? value.map(String).join(", ")
          : String(value);
      }
    }
}

function serializeBody(body: BodyInit, maxBodyLength: number): SerializablePayload {
  if (typeof body === "string") {
    return serializeStringBody(body, maxBodyLength);
  }

  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return truncateText(body.toString(), maxBodyLength);
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const entries: Record<string, SerializablePayload> = {};
    body.forEach((value, key) => {
      entries[key] = typeof value === "string" ? value : describeBlob(value);
    });
    return entries;
  }

  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return describeBlob(body);
  }

  if (body instanceof ArrayBuffer) {
    return `[ArrayBuffer byteLength=${body.byteLength}]`;
  }

  if (ArrayBuffer.isView(body)) {
    return `[${body.constructor.name} byteLength=${body.byteLength}]`;
  }

  if (isRecord(body)) {
    return body;
  }

  return "[Unsupported request body]";
}

function serializeStringBody(value: string, maxBodyLength: number): SerializablePayload {
  if (value.length > maxBodyLength) {
    return truncateText(value, maxBodyLength);
  }

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

async function readResponseBody(
  response: Response,
  maxBodyLength: number,
): Promise<SerializablePayload | undefined> {
  const contentLengthHeader = getHeaderValue(response.headers, "content-length");
  const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : undefined;

  if (contentLength !== undefined && Number.isFinite(contentLength) && contentLength > maxBodyLength) {
    return `[Response body skipped: content-length=${contentLength}]`;
  }

  if (typeof response.clone !== "function" || typeof response.text !== "function") {
    return undefined;
  }

  const contentType = getHeaderValue(response.headers, "content-type") ?? "";
  const text = await response.clone().text();
  const truncatedText = truncateText(text, maxBodyLength);

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(truncatedText) as SerializablePayload;
    } catch {
      return truncatedText;
    }
  }

  return truncatedText;
}

function getHeaderValue(headers: unknown, key: string): string | undefined {
  if (isHeadersLike(headers) && typeof headers.get === "function") {
    return headers.get(key) ?? undefined;
  }

  if (!isRecord(headers)) {
    return undefined;
  }

  const exactValue = headers[key];
  if (exactValue !== undefined && exactValue !== null) {
    return String(exactValue);
  }

  const normalizedKey = key.toLowerCase();
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === normalizedKey && value !== undefined && value !== null) {
      return String(value);
    }
  }

  return undefined;
}

function describeBlob(blob: Blob): string {
  const type = blob.type ? ` type=${blob.type}` : "";
  const name = "name" in blob && typeof blob.name === "string" ? ` name=${blob.name}` : "";

  return `[Blob${name}${type} size=${blob.size}]`;
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

function normalizeError(error: unknown): {
  name: string;
  message: string;
  code?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message,
      code: getErrorCode(error),
    };
  }

  return {
    name: "Error",
    message: String(error),
  };
}

function getErrorCode(error: Error): string | undefined {
  const maybeErrorWithCode = error as Error & { code?: unknown };
  return typeof maybeErrorWithCode.code === "string" ? maybeErrorWithCode.code : undefined;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`;
}

function isRequestLike(value: unknown): value is Request {
  return isRecord(value) && typeof value.url === "string";
}

function isHeadersLike(value: unknown): value is Headers {
  return (
    isRecord(value) &&
    typeof value.forEach === "function"
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
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
