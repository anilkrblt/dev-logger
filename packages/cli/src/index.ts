#!/usr/bin/env node
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { networkInterfaces } from "node:os";
import process from "node:process";
import {
  WebSocket,
  WebSocketServer,
  type RawData,
} from "ws";
import type {
  CaptureProfile,
  ClientHelloPayload,
  HeaderMap,
  HttpErrorEvent,
  HttpRequestEvent,
  HttpResponseEvent,
  LogEvent,
  RouteTransitionEvent,
  ServerAckPayload,
} from "@anilkrblt/protocol";

const DEFAULT_PORT = 3799;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PROFILE: CaptureProfile = "all";
const DEFAULT_REMOTE_REDACT_RULES = ["authorization", "cookie", "password", "token"] as const;
const MAX_SNIPPET_LENGTH = 220;

type CliColor =
  | "cyan"
  | "dim"
  | "green"
  | "red"
  | "yellow"
  | "magenta"
  | "blue"
  | "bold";

export interface CliOptions {
  host: string;
  port: number;
  profile: CaptureProfile;
  filterPatterns: string[];
  remoteRedactRules: string[];
}

interface ClientSession {
  connectionId: number;
  connectedAt: number;
  hello?: ClientHelloPayload;
  isAcked: boolean;
}

if (process.env.REACT_LOG_AGENT_SKIP_MAIN !== "1") {
  main();
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.ok === false) {
    printError(parsed.error);
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    printUsage();
    return;
  }

  startServer(parsed.options);
}

function startServer(options: CliOptions): void {
  let connectionCounter = 0;
  const httpServer = createServer();
  const webSocketServer = new WebSocketServer({ server: httpServer });
  const clients = new Map<WebSocket, ClientSession>();

  webSocketServer.on("connection", (socket) => {
    const session: ClientSession = {
      connectionId: connectionCounter + 1,
      connectedAt: Date.now(),
      isAcked: false,
    };

    connectionCounter = session.connectionId;
    clients.set(socket, session);
    printConnectionOpened(session, clients.size);

    socket.on("message", (data) => {
      handleSocketMessage(socket, data, session, options);
    });

    socket.on("close", () => {
      clients.delete(socket);
      printConnectionClosed(session, clients.size);
    });

    socket.on("error", (error) => {
      printError(`Client #${session.connectionId} socket error: ${error.message}`);
    });
  });

  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      printError(`Port ${options.port} is already in use. Try --port ${options.port + 1}.`);
    } else if (error.code === "EACCES") {
      printError(`Port ${options.port} requires elevated permissions.`);
    } else {
      printError(`Unable to start WebSocket server: ${error.message}`);
    }

    webSocketServer.close();
    process.exitCode = 1;
  });

  httpServer.listen(options.port, options.host, () => {
    const address = httpServer.address() as AddressInfo;
    printStartup(address.port, options);
  });

  const shutdown = () => {
    writeLine("");
    writeLine(color("Shutting down React Log Agent CLI...", "dim"));

    for (const socket of clients.keys()) {
      socket.close(1001, "CLI shutting down");
    }

    webSocketServer.close();
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function handleSocketMessage(
  socket: WebSocket,
  data: RawData,
  session: ClientSession,
  options: CliOptions,
): void {
  const payload = parseJsonMessage(data);

  if (!payload) {
    printWarning(`Client #${session.connectionId} sent invalid JSON.`);
    return;
  }

  if (!session.isAcked) {
    if (!isClientHelloPayload(payload)) {
      printWarning(`Client #${session.connectionId} sent an event before CLIENT_HELLO.`);
      socket.close(1002, "Expected CLIENT_HELLO");
      return;
    }

    session.hello = payload;
    session.isAcked = true;

    const ack: ServerAckPayload = {
      kind: "SERVER_ACK",
      activeProfile: options.profile,
      remoteRedactRules: options.remoteRedactRules,
      filterPatterns: options.filterPatterns,
    };

    socket.send(JSON.stringify(ack));
    printHandshake(session, options);
    return;
  }

  if (!isLogEvent(payload)) {
    printWarning(`Client #${session.connectionId} sent an unsupported payload.`);
    return;
  }

  if (!shouldDisplayEvent(payload, options)) {
    return;
  }

  printLogEvent(payload, session);
}

export interface ParsedArgsSuccess {
  ok: true;
  help: boolean;
  options: CliOptions;
}

export interface ParsedArgsFailure {
  ok: false;
  error: string;
}

export type ParsedArgs = ParsedArgsSuccess | ParsedArgsFailure;

export function parseArgs(argv: string[]): ParsedArgs {
  let host = DEFAULT_HOST;
  let port = DEFAULT_PORT;
  let profile: CaptureProfile = DEFAULT_PROFILE;
  const filterPatterns: string[] = [];
  const redactRules: string[] = [];
  const args = argv[0] === "start" ? argv.slice(1) : argv;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      return {
        ok: true,
        help: true,
        options: createCliOptions(host, port, profile, filterPatterns, redactRules),
      };
    }

    if (arg === "--host") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { ok: false, error: "--host requires a host value." };
      }
      host = value;
      index += 1;
      continue;
    }

    if (arg === "--port") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { ok: false, error: "--port requires a numeric value." };
      }
      const parsedPort = Number.parseInt(value, 10);
      if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
        return { ok: false, error: `Invalid port: ${value}` };
      }
      port = parsedPort;
      index += 1;
      continue;
    }

    if (arg === "--profile") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { ok: false, error: "--profile requires a value." };
      }
      if (!isCaptureProfile(value)) {
        return {
          ok: false,
          error: `Invalid profile: ${value}. Expected network, routes, errors, or all.`,
        };
      }
      profile = value;
      index += 1;
      continue;
    }

    if (arg === "--filter") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { ok: false, error: "--filter requires a pattern string." };
      }
      filterPatterns.push(...splitCsv(value));
      index += 1;
      continue;
    }

    if (arg === "--redact") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { ok: false, error: "--redact requires a comma-separated string." };
      }
      redactRules.push(...splitCsv(value));
      index += 1;
      continue;
    }

    return { ok: false, error: `Unknown argument: ${arg}` };
  }

  return {
    ok: true,
    help: false,
    options: createCliOptions(host, port, profile, filterPatterns, redactRules),
  };
}

function createCliOptions(
  host: string,
  port: number,
  profile: CaptureProfile,
  filterPatterns: string[],
  redactRules: string[],
): CliOptions {
  return {
    host,
    port,
    profile,
    filterPatterns: uniqueNonEmpty(filterPatterns),
    remoteRedactRules: uniqueNonEmpty([...DEFAULT_REMOTE_REDACT_RULES, ...redactRules]),
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseJsonMessage(data: RawData): unknown {
  const text = rawDataToString(data);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function rawDataToString(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  return Buffer.from(data).toString("utf8");
}

function isClientHelloPayload(payload: unknown): payload is ClientHelloPayload {
  if (!isRecord(payload) || payload.kind !== "CLIENT_HELLO") {
    return false;
  }

  return (
    typeof payload.appName === "string" &&
    typeof payload.sdkVersion === "string" &&
    Array.isArray(payload.availableAdapters) &&
    payload.availableAdapters.every((adapter) => typeof adapter === "string")
  );
}

function isLogEvent(payload: unknown): payload is LogEvent {
  if (!isRecord(payload) || typeof payload.type !== "string") {
    return false;
  }

  if (!hasBaseEventFields(payload)) {
    return false;
  }

  switch (payload.type) {
    case "ROUTE_TRANSITION":
      return (
        payload.source === "router" &&
        typeof payload.from === "string" &&
        typeof payload.to === "string" &&
        typeof payload.navigationId === "string"
      );
    case "HTTP_REQUEST":
      return (
        isHttpSource(payload.source) &&
        typeof payload.method === "string" &&
        typeof payload.url === "string" &&
        isHeaderMap(payload.headers) &&
        typeof payload.requestId === "string"
      );
    case "HTTP_RESPONSE":
      return (
        isHttpSource(payload.source) &&
        typeof payload.status === "number" &&
        isHeaderMap(payload.headers) &&
        typeof payload.latency === "number" &&
        typeof payload.requestId === "string"
      );
    case "HTTP_ERROR":
      return (
        isHttpSource(payload.source) &&
        typeof payload.errorName === "string" &&
        typeof payload.errorMessage === "string" &&
        (payload.code === undefined || typeof payload.code === "string") &&
        (payload.latency === undefined || typeof payload.latency === "number") &&
        typeof payload.requestId === "string"
      );
    default:
      return false;
  }
}

function hasBaseEventFields(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.id === "string" &&
    typeof payload.sessionId === "string" &&
    typeof payload.timestamp === "number" &&
    (payload.source === "fetch" || payload.source === "axios" || payload.source === "router")
  );
}

function isHeaderMap(value: unknown): value is HeaderMap {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((headerValue) => typeof headerValue === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHttpSource(value: unknown): value is "fetch" | "axios" {
  return value === "fetch" || value === "axios";
}

function isCaptureProfile(value: string): value is CaptureProfile {
  return value === "network" || value === "routes" || value === "errors" || value === "all";
}

function shouldDisplayEvent(event: LogEvent, options: CliOptions): boolean {
  if (!matchesProfile(event, options.profile)) {
    return false;
  }

  if (options.filterPatterns.length === 0) {
    return true;
  }

  const target = getFilterTarget(event);
  return options.filterPatterns.some((pattern) => matchesPattern(target, pattern));
}

function matchesProfile(event: LogEvent, profile: CaptureProfile): boolean {
  if (profile === "all") {
    return true;
  }

  if (profile === "routes") {
    return event.type === "ROUTE_TRANSITION";
  }

  if (profile === "network") {
    return event.type === "HTTP_REQUEST" || event.type === "HTTP_RESPONSE" || event.type === "HTTP_ERROR";
  }

  return (
    event.type === "HTTP_ERROR" ||
    (event.type === "HTTP_RESPONSE" && event.status >= 400)
  );
}

function getFilterTarget(event: LogEvent): string {
  switch (event.type) {
    case "ROUTE_TRANSITION":
      return `${event.from} ${event.to}`;
    case "HTTP_REQUEST":
      return event.url;
    case "HTTP_RESPONSE":
    case "HTTP_ERROR":
      return [
        event.requestId,
        event.currentRouteContext?.path,
      ].filter(Boolean).join(" ");
  }
}

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }

  if (!pattern.includes("*")) {
    return value.includes(pattern);
  }

  return wildcardToRegExp(pattern).test(value);
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");

  return new RegExp(`^${escaped}$`);
}

function printStartup(port: number, options: CliOptions): void {
  for (const line of formatStartupLines(port, options)) {
    writeLine(line);
  }
  writeLine("");
}

export function formatStartupLines(port: number, options: CliOptions): string[] {
  const networkUrls = getNetworkUrls(port, options.host);
  const lines = [
    color("React Log Agent CLI", "bold"),
    color("=".repeat(58), "dim"),
    `${color("Listening:", "cyan")} ${formatWebSocketUrl(options.host, port)}`,
    `${color("Local:", "cyan")}     ${formatWebSocketUrl("localhost", port)}`,
    ...formatNetworkLines(networkUrls),
    `${color("Profile:", "cyan")}   ${options.profile}`,
    `${color("Filters:", "cyan")}   ${options.filterPatterns.length ? options.filterPatterns.join(", ") : "(none)"}`,
    `${color("Remote redact:", "cyan")} ${options.remoteRedactRules.join(", ")}`,
    `${color("Web / iOS simulator:", "cyan")} use runtime host="localhost"`,
    `${color("Android emulator:", "cyan")}    use runtime host="10.0.2.2"`,
    `${color("Android USB:", "cyan")}         adb reverse tcp:${port} tcp:${port}, then use runtime host="localhost"`,
    `${color("Physical Wi-Fi:", "cyan")}      use runtime host="<LAN_IP>" with CLI bound to 0.0.0.0`,
    `${color("Expo env:", "cyan")}            EXPO_PUBLIC_REACT_LOG_AGENT_HOST=<host>`,
  ];

  if (isLoopbackHost(options.host)) {
    lines.push(
      color(
        "Mobile warning: loopback binds are not reachable from physical devices. Use --host 0.0.0.0 or a LAN IP.",
        "yellow",
      ),
    );
  }

  lines.push(color("Waiting for React runtime clients...", "dim"));
  lines.push(color("Hint: mobile clients cannot always reach localhost; choose the host for your runtime above.", "dim"));
  return lines;
}

function formatNetworkLines(networkUrls: readonly string[]): string[] {
  if (networkUrls.length === 0) {
    return [`${color("Network:", "cyan")}   ${color("(no LAN IPv4 address detected)", "dim")}`];
  }

  return networkUrls.map((url, index) => {
    const label = index === 0 ? `${color("Network:", "cyan")}   ` : "           ";
    return `${label}${url}`;
  });
}

function getNetworkUrls(port: number, bindHost: string): string[] {
  const networkHosts = isWildcardHost(bindHost)
    ? getLanIPv4Addresses()
    : isLoopbackHost(bindHost)
      ? []
      : [bindHost];

  return networkHosts.map((host) => formatWebSocketUrl(host, port));
}

function getLanIPv4Addresses(): string[] {
  const addresses = new Set<string>();

  for (const networkInterface of Object.values(networkInterfaces())) {
    for (const address of networkInterface ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        addresses.add(address.address);
      }
    }
  }

  return Array.from(addresses);
}

function formatWebSocketUrl(host: string, port: number): string {
  const formattedHost = host.includes(":") && !host.startsWith("[")
    ? `[${host}]`
    : host;

  return `ws://${formattedHost}:${port}`;
}

function isWildcardHost(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
}

function printConnectionOpened(session: ClientSession, activeClients: number): void {
  writeLine(
    `${color("CONNECT", "cyan")} client #${session.connectionId} opened ` +
      color(`(${activeClients} active)`, "dim"),
  );
}

function printConnectionClosed(session: ClientSession, activeClients: number): void {
  const appName = session.hello?.appName ? ` ${session.hello.appName}` : "";
  writeLine(
    `${color("CLOSE", "dim")} client #${session.connectionId}${appName} ` +
      color(`(${activeClients} active)`, "dim"),
  );
}

function printHandshake(session: ClientSession, options: CliOptions): void {
  const hello = session.hello;
  const appName = hello?.appName ?? "Unknown app";
  const adapters = hello?.availableAdapters.join(", ") || "(none)";

  writeLine(color("-".repeat(58), "dim"));
  writeLine(
    `${color("ACK", "green")} client #${session.connectionId} ${color(appName, "bold")} ` +
      color(`sdk=${hello?.sdkVersion ?? "unknown"}`, "dim"),
  );
  writeLine(`${color("Adapters:", "cyan")} ${adapters}`);
  writeLine(`${color("Capture:", "cyan")} ${options.profile}`);
  writeLine(color("-".repeat(58), "dim"));
}

function printLogEvent(event: LogEvent, session: ClientSession): void {
  switch (event.type) {
    case "HTTP_REQUEST":
      printHttpRequest(event, session);
      return;
    case "HTTP_RESPONSE":
      printHttpResponse(event, session);
      return;
    case "HTTP_ERROR":
      printHttpError(event, session);
      return;
    case "ROUTE_TRANSITION":
      printRouteTransition(event, session);
      return;
  }
}

function printHttpRequest(event: HttpRequestEvent, session: ClientSession): void {
  writeLine(formatEventHeader("REQUEST", session, event.timestamp, "blue"));
  writeLine(`${colorMethod(event.method)} ${event.url}`);
  writeLine(`${color("requestId:", "dim")} ${event.requestId}`);
  printHeaderSnippet(event.headers);

  if (event.body !== undefined) {
    writeLine(`${color("body:", "dim")} ${formatPayload(event.body)}`);
  }

  printRouteContext(event.currentRouteContext?.path);
  writeLine(color("-".repeat(58), "dim"));
}

function printHttpResponse(event: HttpResponseEvent, session: ClientSession): void {
  const statusColor = getStatusColor(event.status);

  writeLine(formatEventHeader("RESPONSE", session, event.timestamp, statusColor));
  writeLine(
    `${color(String(event.status), statusColor)} ${color(`+${formatLatency(event.latency)}`, "magenta")} ` +
      color(`requestId=${event.requestId}`, "dim"),
  );
  printHeaderSnippet(event.headers);

  if (event.body !== undefined) {
    writeLine(`${color("body:", "dim")} ${formatPayload(event.body)}`);
  }

  printRouteContext(event.currentRouteContext?.path);
  writeLine(color("-".repeat(58), "dim"));
}

function printHttpError(event: HttpErrorEvent, session: ClientSession): void {
  writeLine(formatEventHeader("HTTP ERROR", session, event.timestamp, "red"));
  writeLine(`${color(event.errorName, "red")}: ${event.errorMessage}`);

  if (event.code) {
    writeLine(`${color("code:", "dim")} ${event.code}`);
  }

  if (event.latency !== undefined) {
    writeLine(`${color("latency:", "dim")} +${formatLatency(event.latency)}`);
  }

  writeLine(`${color("requestId:", "dim")} ${event.requestId}`);
  printRouteContext(event.currentRouteContext?.path);
  writeLine(color("-".repeat(58), "dim"));
}

function printRouteTransition(event: RouteTransitionEvent, session: ClientSession): void {
  writeLine(formatEventHeader("ROUTE", session, event.timestamp, "cyan"));
  writeLine(`${color(event.from, "dim")} ${color("->", "cyan")} ${color(event.to, "bold")}`);
  writeLine(`${color("navigationId:", "dim")} ${event.navigationId}`);
  writeLine(color("-".repeat(58), "dim"));
}

function formatEventHeader(
  label: string,
  session: ClientSession,
  timestamp: number,
  colorName: CliColor,
): string {
  return `${color(`[${label}]`, colorName)} ${color(formatTime(timestamp), "dim")} ${color(`#${session.connectionId}`, "dim")}`;
}

function printHeaderSnippet(headers: HeaderMap): void {
  const entries = Object.entries(headers).slice(0, 4);

  if (entries.length === 0) {
    return;
  }

  const snippet = entries.map(([key, value]) => `${key}: ${truncate(value, 60)}`).join("; ");
  writeLine(`${color("headers:", "dim")} ${snippet}`);
}

function printRouteContext(routePath: string | undefined): void {
  if (routePath) {
    writeLine(`${color("route:", "dim")} ${routePath}`);
  }
}

function formatPayload(payload: unknown): string {
  if (typeof payload === "string") {
    return truncate(payload, MAX_SNIPPET_LENGTH);
  }

  try {
    return truncate(JSON.stringify(payload), MAX_SNIPPET_LENGTH);
  } catch {
    return "[Unserializable payload]";
  }
}

function formatLatency(latency: number): string {
  return `${Math.round(latency * 100) / 100}ms`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });
}

function colorMethod(method: string): string {
  const normalizedMethod = method.toUpperCase();

  switch (normalizedMethod) {
    case "GET":
      return color(normalizedMethod.padEnd(7), "green");
    case "POST":
      return color(normalizedMethod.padEnd(7), "yellow");
    case "PUT":
    case "PATCH":
      return color(normalizedMethod.padEnd(7), "magenta");
    case "DELETE":
      return color(normalizedMethod.padEnd(7), "red");
    default:
      return color(normalizedMethod.padEnd(7), "blue");
  }
}

function getStatusColor(status: number): CliColor {
  if (status >= 200 && status < 300) {
    return "green";
  }

  if (status >= 300 && status < 400) {
    return "yellow";
  }

  if (status >= 400) {
    return "red";
  }

  return "blue";
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function printUsage(): void {
  writeLine(`Usage: react-log-agent [start] [options]

Options:
  --host <host>                   WebSocket bind host (default: ${DEFAULT_HOST})
  --port <number>                 WebSocket port (default: ${DEFAULT_PORT})
  --profile <network|routes|errors|all>
                                  Capture profile (default: ${DEFAULT_PROFILE})
  --filter <string>               URL or route filter; supports substring or * wildcard
  --redact <comma-separated>      Extra remote redaction rules
  --help                          Show this help message
`);
}

function printWarning(message: string): void {
  writeLine(`${color("WARN", "yellow")} ${message}`);
}

function printError(message: string): void {
  writeLine(`${color("ERROR", "red")} ${message}`);
}

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

function color(value: string, colorName: CliColor): string {
  const codes: Record<CliColor, [number, number]> = {
    cyan: [36, 39],
    dim: [2, 22],
    green: [32, 39],
    red: [31, 39],
    yellow: [33, 39],
    magenta: [35, 39],
    blue: [34, 39],
    bold: [1, 22],
  };

  const [open, close] = codes[colorName];
  return `\u001b[${open}m${value}\u001b[${close}m`;
}
