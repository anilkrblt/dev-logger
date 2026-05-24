import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactLogProvider,
  createFetchAdapter,
  createRouterAdapter,
  useReactLogAgent,
} from "@anilkrblt/runtime";

import "./styles.css";

const logAdapters = [
  createRouterAdapter(),
  createFetchAdapter(),
];

const redactRules = ["authorization", "cookie", "password", "token"];

type ResultState = {
  label: string;
  detail: string;
};

function SandboxApp() {
  return (
    <ReactLogProvider
      enabled={true}
      adapters={logAdapters}
      redact={redactRules}
      appName="React Log Agent Sandbox"
      host="localhost"
      port={3799}
    >
      <SandboxDashboard />
    </ReactLogProvider>
  );
}

function SandboxDashboard() {
  const agent = useReactLogAgent();
  const [result, setResult] = useState<ResultState>({
    label: "Idle",
    detail: "Start the CLI, then click a smoke-test action.",
  });
  const [routeIndex, setRouteIndex] = useState(0);

  async function runSuccessFetch() {
    setResult({
      label: "Success Fetch",
      detail: "Loading https://jsonplaceholder.typicode.com/todos/1",
    });

    const response = await fetch("https://jsonplaceholder.typicode.com/todos/1");
    const body = await response.json();

    setResult({
      label: "Success Fetch",
      detail: JSON.stringify(body, null, 2),
    });
  }

  async function runSensitiveFetch() {
    setResult({
      label: "Sensitive Payload Fetch",
      detail: "Posting redaction test payload.",
    });

    const response = await fetch("https://jsonplaceholder.typicode.com/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sandbox-secret-token",
      },
      body: JSON.stringify({
        title: "sandbox-redaction-test",
        password: "sandbox-password",
        token: "sandbox-client-token",
      }),
    });
    const body = await response.json();

    setResult({
      label: "Sensitive Payload Fetch",
      detail: JSON.stringify(body, null, 2),
    });
  }

  async function runFailedFetch() {
    setResult({
      label: "Failed Fetch",
      detail: "Requesting intentionally invalid domain.",
    });

    try {
      await fetch("https://invalid-domain-xyz-react-log-agent.test/api");
    } catch (error) {
      setResult({
        label: "Failed Fetch",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function pushRoute() {
    const nextIndex = routeIndex + 1;
    const nextPath = `/sandbox-route-${nextIndex}`;
    window.history.pushState({ sandboxRoute: nextIndex }, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate", { state: { sandboxRoute: nextIndex } }));
    setRouteIndex(nextIndex);
    setResult({
      label: "Route Transition",
      detail: `Moved to ${nextPath}`,
    });
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Local Integration Sandbox</p>
          <h1>React Log Agent Runtime Smoke Test</h1>
          <p className="lede">
            This workspace app imports <code>@anilkrblt/runtime</code> through npm workspace resolution,
            while Vite aliases it to local source for real-time debugging.
          </p>
        </div>
        <AgentStatus />
      </section>

      <section className="actions" aria-label="Smoke-test actions">
        <button type="button" onClick={() => void runSuccessFetch()}>
          Success Fetch
        </button>
        <button type="button" onClick={() => void runSensitiveFetch()}>
          Sensitive Payload
        </button>
        <button type="button" onClick={() => void runFailedFetch()}>
          Failed Fetch
        </button>
        <button type="button" onClick={pushRoute}>
          Route Transition
        </button>
      </section>

      <section className="panel">
        <div>
          <p className="panel-label">Latest action</p>
          <h2>{result.label}</h2>
        </div>
        <pre>{result.detail}</pre>
      </section>

      <section className="panel compact">
        <p className="panel-label">Runtime snapshot</p>
        <pre>
          {JSON.stringify(
            {
              status: agent.status,
              activeProfile: agent.activeProfile,
              sessionId: agent.sessionId,
              currentRouteContext: agent.currentRouteContext,
            },
            null,
            2,
          )}
        </pre>
      </section>
    </main>
  );
}

function AgentStatus() {
  const agent = useReactLogAgent();
  const statusClassName = agent.status === "active" ? "status active" : "status";

  return (
    <aside className={statusClassName}>
      <span />
      <div>
        <strong>{agent.status}</strong>
        <small>{agent.currentRouteContext?.path ?? window.location.pathname}</small>
      </div>
    </aside>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SandboxApp />
  </StrictMode>,
);
