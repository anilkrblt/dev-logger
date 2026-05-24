import type { CliOptions, ParsedArgsSuccess } from "../src/index";

process.env.REACT_LOG_AGENT_SKIP_MAIN = "1";

const { formatStartupLines, parseArgs } = await import("../src/index");

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

function expect(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function parseSuccess(argv: string[]): ParsedArgsSuccess {
  const parsed = parseArgs(argv);
  expect(parsed.ok, `Expected parse success for ${argv.join(" ") || "(empty)"}`);
  return parsed as ParsedArgsSuccess;
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function createOptions(host: string): CliOptions {
  return {
    host,
    port: 3799,
    profile: "all",
    filterPatterns: [],
    remoteRedactRules: ["authorization", "cookie", "password", "token"],
  };
}

test("parseArgs uses 0.0.0.0 as the default host", () => {
  const parsed = parseSuccess([]);
  expect(parsed.options.host === "0.0.0.0", `Expected 0.0.0.0, received ${parsed.options.host}`);
});

test("parseArgs accepts --host localhost", () => {
  const parsed = parseSuccess(["--host", "localhost"]);
  expect(parsed.options.host === "localhost", `Expected localhost, received ${parsed.options.host}`);
});

test("parseArgs accepts --host 0.0.0.0 with --port", () => {
  const parsed = parseSuccess(["--host", "0.0.0.0", "--port", "3799"]);
  expect(parsed.options.host === "0.0.0.0", `Expected 0.0.0.0, received ${parsed.options.host}`);
  expect(parsed.options.port === 3799, `Expected port 3799, received ${parsed.options.port}`);
});

test("parseArgs fails when --host has no value", () => {
  const parsed = parseArgs(["--host"]);
  expect(parsed.ok === false, "Expected parse failure for missing --host value");
});

test("formatStartupLines includes selected bind host and mobile hints", () => {
  const output = stripAnsi(formatStartupLines(3799, createOptions("0.0.0.0")).join("\n"));
  expect(output.includes("Listening: ws://0.0.0.0:3799"), "Expected selected bind host in startup output");
  expect(output.includes("Local:     ws://localhost:3799"), "Expected local URL in startup output");
  expect(output.includes("Network:"), "Expected network hint in startup output");
  expect(output.includes('Web / iOS simulator: use runtime host="localhost"'), "Expected web/iOS simulator hint");
  expect(output.includes('Android emulator:    use runtime host="10.0.2.2"'), "Expected Android emulator hint");
  expect(
    output.includes('Android USB:         adb reverse tcp:3799 tcp:3799, then use runtime host="localhost"'),
    "Expected Android USB hint",
  );
  expect(
    output.includes('Physical Wi-Fi:      use runtime host="<LAN_IP>" with CLI bound to 0.0.0.0'),
    "Expected physical Wi-Fi hint",
  );
  expect(
    output.includes("Expo env:            EXPO_PUBLIC_REACT_LOG_AGENT_HOST=<host>"),
    "Expected Expo environment variable hint",
  );
  expect(
    output.includes("Hint: mobile clients cannot always reach localhost; choose the host for your runtime above."),
    "Expected waiting health hint",
  );
});

test("formatStartupLines warns for loopback binds", () => {
  const output = stripAnsi(formatStartupLines(3799, createOptions("localhost")).join("\n"));
  expect(output.includes("Listening: ws://localhost:3799"), "Expected localhost bind URL");
  expect(output.includes("Mobile warning:"), "Expected loopback mobile warning");
});
