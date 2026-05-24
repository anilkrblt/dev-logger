# Phase 5 - Axios and Router Instrumentation

- [x] Add `createAxiosAdapter` to the runtime package without changing fetch adapter behavior.
- [x] Add `createRouterAdapter` to the runtime package and route-context update plumbing in `ReactLogProvider`.
- [x] Ensure network events automatically inherit the active route context before transport serialization.
- [x] Export the new adapters from `@react-log-agent/runtime`.
- [x] Link Axios and React Router into the Vite test app.
- [x] Add Axios success and sensitive-call buttons to `LogTestDashboard`.
- [x] Add real client-side navigation in the Vite app and emit `ROUTE_TRANSITION` events.
- [x] Rebuild runtime, typecheck/build the app, and verify CLI logs for route context plus Axios redaction.

# Phase 6 - NPM Workspaces and Publish Readiness

- [x] Add root npm workspaces for `packages/*`.
- [x] Remove local `file:` references from root, runtime, and CLI package metadata.
- [x] Add root workspace build/typecheck scripts.
- [x] Add publish-readiness metadata to protocol, runtime, and CLI packages.
- [x] Add package `prepublishOnly` scripts.
- [x] Remove package-local lockfiles and `node_modules` folders.
- [x] Regenerate root lockfile with a clean root install.
- [x] Verify package typechecks/builds, app typecheck/build, workspace links, and CLI executable.

# Root README Professionalization

- [x] Add header, badges, and value proposition.
- [x] Add architecture blueprint and inert-by-default lifecycle.
- [x] Document installation and current CLI usage.
- [x] Add runtime integration snippets for fetch, Axios, and router adapters.
- [x] Showcase performance, privacy, route correlation, and adapter coverage.
- [x] Add npm workspace development commands.
- [x] Explain package layout and safety model.
