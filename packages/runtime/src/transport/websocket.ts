import type {
  ClientHelloPayload,
  CurrentRouteContext,
  LogEvent,
  ServerAckPayload,
} from "@anilkrblt/protocol";

import { scheduleQueueFlush } from "./queue";

export type RuntimeConnectionStatus =
  | "disabled"
  | "connecting"
  | "awaiting_ack"
  | "active"
  | "closed"
  | "error";

export interface WebSocketTransportOptions {
  url: string;
  clientHello: ClientHelloPayload;
  localRedactRules?: readonly string[];
  queueLimit?: number;
  getCurrentRouteContext?: () => CurrentRouteContext | undefined;
  onStatusChange?: (status: RuntimeConnectionStatus) => void;
  onAck?: (ack: ServerAckPayload) => void;
  onDisconnect?: () => void;
}

export interface WebSocketTransport {
  emit: (event: LogEvent) => void;
  close: () => void;
  getStatus: () => RuntimeConnectionStatus;
  getAck: () => ServerAckPayload | undefined;
}

const DEFAULT_QUEUE_LIMIT = 100;
const DEFAULT_REDACT_RULES = ["authorization", "cookie", "password", "token"] as const;
const REDACTED_VALUE = "[REDACTED]";
const CIRCULAR_VALUE = "[Circular]";

/**
 * Creates the browser WebSocket transport and owns handshake, queueing, and
 * safe event serialization.
 */
export function createWebSocketTransport(
  options: WebSocketTransportOptions,
): WebSocketTransport {
  const queueLimit = Math.max(1, options.queueLimit ?? DEFAULT_QUEUE_LIMIT);
  const queue: LogEvent[] = [];
  let status: RuntimeConnectionStatus = "connecting";
  let ack: ServerAckPayload | undefined;
  let isAcked = false;
  let isClosed = false;
  let isFlushScheduled = false;
  let redactRules = normalizeRedactRules(options.localRedactRules);

  const WebSocketCtor = globalThis.WebSocket;

  if (typeof WebSocketCtor !== "function") {
    status = "error";
    options.onStatusChange?.(status);
    options.onDisconnect?.();
    return createNoopTransport(status);
  }

  options.onStatusChange?.(status);

  const socket = new WebSocketCtor(options.url);

  socket.onopen = () => {
    if (isClosed) {
      return;
    }

    status = "awaiting_ack";
    options.onStatusChange?.(status);
    sendPayload(socket, options.clientHello);
  };

  socket.onmessage = (message) => {
    if (isClosed || isAcked) {
      return;
    }

    const payload = parseSocketMessage(message.data);

    if (!isServerAckPayload(payload)) {
      return;
    }

    ack = payload;
    isAcked = true;
    redactRules = normalizeRedactRules([
      ...(options.localRedactRules ?? []),
      ...payload.remoteRedactRules,
    ]);
    status = "active";
    options.onStatusChange?.(status);
    options.onAck?.(payload);
    scheduleFlush();
  };

  socket.onerror = () => {
    if (isClosed) {
      return;
    }

    status = "error";
    options.onStatusChange?.(status);
    disconnect();
  };

  socket.onclose = () => {
    if (isClosed) {
      return;
    }

    status = status === "error" ? "error" : "closed";
    options.onStatusChange?.(status);
    disconnect();
  };

  function emit(event: LogEvent): void {
    if (!isAcked || isClosed || status !== "active") {
      return;
    }

    const eventWithRouteContext = attachRouteContext(event, options.getCurrentRouteContext);
    const redactedEvent = redactValue(eventWithRouteContext, redactRules) as LogEvent;

    if (queue.length >= queueLimit) {
      queue.shift();
    }

    queue.push(redactedEvent);
    scheduleFlush();
  }

  function close(): void {
    if (isClosed) {
      return;
    }

    status = "closed";
    options.onStatusChange?.(status);
    disconnect();

    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  }

  function disconnect(): void {
    isClosed = true;
    isAcked = false;
    queue.length = 0;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    options.onDisconnect?.();
  }

  function scheduleFlush(): void {
    if (isFlushScheduled || !isAcked || isClosed) {
      return;
    }

    isFlushScheduled = true;

    scheduleQueueFlush(() => {
      isFlushScheduled = false;
      flush();
    });
  }

  function flush(): void {
    if (!isAcked || isClosed || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (queue.length > 0 && socket.readyState === WebSocket.OPEN) {
      const event = queue.shift();

      if (!event) {
        continue;
      }

      try {
        socket.send(JSON.stringify(event));
      } catch {
        break;
      }
    }
  }

  return {
    emit,
    close,
    getStatus: () => status,
    getAck: () => ack,
  };
}

function attachRouteContext(
  event: LogEvent,
  getCurrentRouteContext: (() => CurrentRouteContext | undefined) | undefined,
): LogEvent {
  if (!getCurrentRouteContext || !isNetworkEvent(event)) {
    return event;
  }

  const currentRouteContext = event.currentRouteContext ?? getCurrentRouteContext();

  if (!currentRouteContext) {
    return event;
  }

  return {
    ...event,
    currentRouteContext,
  } as LogEvent;
}

function isNetworkEvent(event: LogEvent): boolean {
  return event.source === "fetch" || event.source === "axios";
}

/**
 * Redacts sensitive values before protocol data is serialized.
 */
export function redactValue(value: unknown, rules: readonly string[]): unknown {
  return redactRecursive(value, rules, new WeakSet<object>());
}

function redactRecursive(
  value: unknown,
  rules: readonly string[],
  seen: WeakSet<object>,
): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR_VALUE;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactRecursive(item, rules, seen));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    output[key] = shouldRedactKey(key, rules)
      ? REDACTED_VALUE
      : redactRecursive(nestedValue, rules, seen);
  }

  return output;
}

function normalizeRedactRules(rules: readonly string[] = []): string[] {
  return Array.from(
    new Set(
      [...DEFAULT_REDACT_RULES, ...rules]
        .map((rule) => rule.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function shouldRedactKey(key: string, rules: readonly string[]): boolean {
  const normalizedKey = key.toLowerCase();
  return rules.some((rule) => normalizedKey.includes(rule));
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sendPayload(socket: WebSocket, payload: ClientHelloPayload): void {
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    socket.close();
  }
}

function parseSocketMessage(data: unknown): unknown {
  if (typeof data !== "string") {
    return undefined;
  }

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

function isServerAckPayload(payload: unknown): payload is ServerAckPayload {
  if (!isRecord(payload) || payload.kind !== "SERVER_ACK") {
    return false;
  }

  return (
    isCaptureProfile(payload.activeProfile) &&
    Array.isArray(payload.remoteRedactRules) &&
    payload.remoteRedactRules.every((rule) => typeof rule === "string") &&
    Array.isArray(payload.filterPatterns) &&
    payload.filterPatterns.every((pattern) => typeof pattern === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCaptureProfile(value: unknown): value is ServerAckPayload["activeProfile"] {
  return value === "network" || value === "routes" || value === "errors" || value === "all";
}

function createNoopTransport(status: RuntimeConnectionStatus): WebSocketTransport {
  return {
    emit: () => undefined,
    close: () => undefined,
    getStatus: () => status,
    getAck: () => undefined,
  };
}
