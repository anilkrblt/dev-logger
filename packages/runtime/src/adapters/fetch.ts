import type {
  HeaderMap,
  HttpErrorEvent,
  HttpRequestEvent,
  HttpResponseEvent,
  SerializablePayload,
} from "@react-log-agent/protocol";

import type { AdapterFactory, AdapterInstallContext } from "../index";

const DEFAULT_MAX_BODY_LENGTH = 64_000;

let activeFetchCleanup: (() => void) | undefined;

/**
 * Options for the built-in global fetch adapter.
 */
export interface FetchAdapterOptions {
  maxBodyLength?: number;
}

/**
 * Creates the built-in adapter that instruments global window.fetch.
 */
export function createFetchAdapter(options: FetchAdapterOptions = {}): AdapterFactory {
  return {
    name: "fetch",
    profiles: ["network", "errors", "all"],
    install(context) {
      if (activeFetchCleanup || typeof window === "undefined" || typeof window.fetch !== "function") {
        return () => undefined;
      }

      const maxBodyLength = options.maxBodyLength ?? DEFAULT_MAX_BODY_LENGTH;
      const originalFetch = window.fetch.bind(window);

      window.fetch = async function reactLogAgentFetch(
        input: RequestInfo | URL,
        init?: RequestInit,
      ): Promise<Response> {
        const url = resolveRequestUrl(input);

        if (!matchesFilterPatterns(url, context.filterPatterns)) {
          return originalFetch(input, init);
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
          const response = await originalFetch(input, init);
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

      activeFetchCleanup = () => {
        window.fetch = originalFetch;
        activeFetchCleanup = undefined;
      };

      return activeFetchCleanup;
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
    headers: headersToObject(response.headers),
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
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }

  return input.toString();
}

function resolveRequestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const method =
    init?.method ??
    (typeof Request !== "undefined" && input instanceof Request ? input.method : undefined) ??
    "GET";

  return method.toUpperCase();
}

function resolveRequestHeaders(input: RequestInfo | URL, init?: RequestInit): HeaderMap {
  const headers = new Headers(
    typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
  );

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headersToObject(headers);
}

function resolveRequestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  maxBodyLength: number,
): SerializablePayload | undefined {
  if (init?.body !== undefined && init.body !== null) {
    return serializeBody(init.body, maxBodyLength);
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return "[Request body unavailable without consuming stream]";
  }

  return undefined;
}

function headersToObject(headers: Headers): HeaderMap {
  const result: HeaderMap = {};

  headers.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

function serializeBody(body: BodyInit, maxBodyLength: number): SerializablePayload {
  if (typeof body === "string") {
    return serializeStringBody(body, maxBodyLength);
  }

  if (body instanceof URLSearchParams) {
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
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : undefined;

  if (contentLength !== undefined && Number.isFinite(contentLength) && contentLength > maxBodyLength) {
    return `[Response body skipped: content-length=${contentLength}]`;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.clone().text();
  const truncatedText = truncateText(text, maxBodyLength);

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(truncatedText);
    } catch {
      return truncatedText;
    }
  }

  return truncatedText;
}

function describeBlob(blob: Blob): string {
  const type = blob.type ? ` type=${blob.type}` : "";
  const name = "name" in blob && typeof blob.name === "string" ? ` name=${blob.name}` : "";

  return `[Blob${name}${type} size=${blob.size}]`;
}

function matchesFilterPatterns(url: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }

  return patterns.some((pattern) => {
    if (pattern === "*") {
      return true;
    }

    if (!pattern.includes("*")) {
      return url.includes(pattern);
    }

    return wildcardToRegExp(pattern).test(url);
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
