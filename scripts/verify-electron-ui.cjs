const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = process.cwd();
const baseUrl = "http://127.0.0.1:5173";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Process is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startVite() {
  return spawn("corepack", ["pnpm", "--filter", "@lsf/desktop", "dev:web", "--", "--host", "127.0.0.1", "--port", "5173"], {
    cwd: repoRoot,
    shell: true,
    stdio: "ignore"
  });
}

function startElectron(workspaceRoot, reportPath, mode) {
  const child = spawn("corepack", ["pnpm", "--filter", "@lsf/desktop", "exec", "electron", "src/main/main.ts"], {
    cwd: repoRoot,
    shell: true,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: baseUrl,
      NODE_OPTIONS: "--import tsx",
      WORKSPACE_ROOT: workspaceRoot,
      // Keep isolated tests credential-free unless the caller explicitly opts into the configured OS keychain.
      LSF_DEV_MEMORY_KEYCHAIN: process.env.LSF_UI_USE_CONFIGURED_KEYCHAIN === "1" ? "" : "1",
      LSF_E2E_UI_REPORT_PATH: reportPath,
      LSF_E2E_UI_MODE: mode
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.output = "";
  child.stdout.on("data", (chunk) => {
    child.output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    child.output += chunk.toString();
  });
  return child;
}

async function runElectronMode(workspaceRoot, mode) {
  const reportPath = path.join(workspaceRoot, `ui-${mode}.json`);
  const electron = startElectron(workspaceRoot, reportPath, mode);
  const exitCode = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      electron.kill();
      resolve("timeout");
    }, mode === "vox-simple-flow" ? 90000 : 45000);
    electron.on("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  let report;
  try {
    report = JSON.parse(await fs.readFile(reportPath, "utf8"));
  } catch {
    throw new Error(`Electron UI verification produced no report in ${mode}. Exit: ${exitCode}. Output: ${electron.output}`);
  }
  if (exitCode !== 0 || !report.ok) {
    throw new Error(`Electron UI verification failed in ${mode}: ${report.error || `exit ${exitCode}`}. Evidence: ${JSON.stringify(report)}. Output: ${electron.output}`);
  }
  return report;
}

async function main() {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lsf-electron-ui-"));
  const vite = startVite();
  try {
    await waitForHttp(baseUrl);
    const modes = (process.env.LSF_UI_MODES || "workflow-contract,reference-restart,reference-invalidation,vox-simple-flow,verify").split(",").map((mode) => mode.trim()).filter(Boolean);
    const reports = {};
    for (const mode of modes) reports[mode] = await runElectronMode(workspaceRoot, mode);
    console.log(JSON.stringify({ ok: true, workspaceRoot, reports }, null, 2));
  } finally {
    vite.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
