import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const childEnv = { ...process.env };

const packages = ["protocol", "runtime", "cli"];

for (const key of Object.keys(childEnv)) {
  if (key.toLowerCase().startsWith("npm_") || key === "INIT_CWD") {
    delete childEnv[key];
  }
}

for (const packageName of packages) {
  const result = spawnSync(npmCommand, ["run", "build"], {
    cwd: join(rootDir, "packages", packageName),
    env: childEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error(result.error.message);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
