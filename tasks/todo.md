# Phase 5 - Axios and Router Instrumentation

- [x] Add `createAxiosAdapter` to the runtime package without changing fetch adapter behavior.
- [x] Add `createRouterAdapter` to the runtime package and route-context update plumbing in `ReactLogProvider`.
- [x] Ensure network events automatically inherit the active route context before transport serialization.
- [x] Export the new adapters from the runtime package.
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

# Phase 6.5 - Private NPM Packaging and Publish Readiness

- [x] Rename package scopes to `@anilkrblt/*`.
- [x] Update workspace and inter-package dependencies to the new scope.
- [x] Set package publish access to `restricted`.
- [x] Update package import specifiers required by the scope rename.
- [x] Refresh root lockfile through npm install.
- [x] Verify typechecks and full package builds after renaming.

# Phase 7 - Mobile Runtime Support

- [x] Add React Native-safe transport queue scheduler.
- [x] Add React Native fetch adapter without changing web fetch adapter.
- [x] Add React Navigation adapter without changing web router adapter.
- [x] Export mobile adapters from the runtime package.
- [x] Verify package typecheck/build and full root build.
- [x] Confirm protocol and CLI packages remain untouched.

# v0.1.0 Cross-Platform README Release

- [x] Update README introduction and architecture for Web plus React Native runtime support.
- [x] Document scoped `@anilkrblt/*` v0.1.0 install and CLI usage.
- [x] Add full Web quick start with fetch and router adapters.
- [x] Add full Mobile quick start with React Native fetch and React Navigation adapters.
- [x] Add mobile LAN IP host note for devices and emulators.
- [x] Refresh feature, adapter, package, and local development sections for v0.1.0.
- [x] Verify README examples and CLI invocation.
