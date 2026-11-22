import { spawnSync } from "node:child_process";

// Forward Vercel options, e.g. npm run deploy -- --prod.
const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--yes", "vercel", "deploy", ...process.argv.slice(2)],
  { stdio: "inherit", shell: process.platform === "win32" },
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
