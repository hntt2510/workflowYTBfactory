const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const baseUrl = process.env.UI_SCREENSHOT_URL || "http://127.0.0.1:5173";
const shouldManageVite = !process.env.UI_SCREENSHOT_URL;

const shots = {
  dashboard: "docs/screenshots/dashboard.png",
  "new-project": "docs/screenshots/new-project-wizard.png",
  "project-overview": "docs/screenshots/project-overview.png",
  shots: "docs/screenshots/shot-board.png",
  "production-queue": "docs/screenshots/production-queue.png",
  providers: "docs/screenshots/provider-settings.png"
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate Chrome debugging port."));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json();
}

async function isHttpReady(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function startVite() {
  const child = spawn("corepack", ["pnpm", "--filter", "@lsf/desktop", "dev:web"], {
    cwd: process.cwd(),
    shell: true,
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

async function ensureViteServer() {
  if (!shouldManageVite || await isHttpReady(baseUrl)) {
    return null;
  }
  const vite = startVite();
  for (let index = 0; index < 80; index += 1) {
    if (await isHttpReady(baseUrl)) return vite;
    if (vite.exitCode !== null) {
      throw new Error(`Vite exited before screenshots could run. Output: ${vite.output}`);
    }
    await sleep(250);
  }
  vite.kill();
  throw new Error(`Timed out waiting for ${baseUrl}. Output: ${vite.output}`);
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const callbacks = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) callbacks.reject(new Error(message.error.message));
    else callbacks.resolve(message.result);
  };
  return function send(method, params = {}) {
    id += 1;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
}

async function screenshot(send, outputPath) {
  await sleep(500);
  const result = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
  await fs.writeFile(outputPath, Buffer.from(result.data, "base64"));
}

async function removeTempDir(dir) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    if (!error || !["EBUSY", "EPERM"].includes(error.code)) {
      throw error;
    }
  }
}

async function clickText(send, text) {
  const expression = `(() => {
    const elements = Array.from(document.querySelectorAll("button,a"));
    const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
    const textOf = (el) => normalize([el.innerText, el.textContent, el.getAttribute("aria-label"), el.getAttribute("title")].filter(Boolean).join(" "));
    const exact = elements.filter((el) => textOf(el) === ${JSON.stringify(text)});
    const partial = elements.filter((el) => textOf(el).includes(${JSON.stringify(text)}));
    const target = exact.find((el) => !el.disabled) || partial.find((el) => !el.disabled);
    if (!target) return false;
    target.click();
    return true;
  })()`;
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true });
  if (!result.result.value) throw new Error(`Could not click ${text}`);
  await sleep(450);
}

async function waitForChromePage(port, chrome) {
  for (let index = 0; index < 80; index += 1) {
    try {
      const pages = await getJson(`http://127.0.0.1:${port}/json`);
      const page = pages.find((item) => item.type === "page");
      if (page) return page;
    } catch {
      // Chrome is still starting.
    }
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome exited before debugging page was available. Output: ${chrome.output}`);
    }
    await sleep(250);
  }
  throw new Error(`Chrome debugging page not available. Output: ${chrome.output}`);
}

async function main() {
  await fs.mkdir("docs/screenshots", { recursive: true });
  const vite = await ensureViteServer();
  const chromeDebugPort = process.env.CHROME_DEBUG_PORT ? Number(process.env.CHROME_DEBUG_PORT) : await getAvailablePort();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "lsf-chrome-ui-shots-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--window-size=1440,920",
    `--remote-debugging-port=${chromeDebugPort}`,
    `--user-data-dir=${userDataDir}`,
    `${baseUrl}/#dashboard`
  ], { stdio: ["ignore", "pipe", "pipe"] });
  chrome.output = "";
  chrome.stdout.on("data", (chunk) => {
    chrome.output += chunk.toString();
  });
  chrome.stderr.on("data", (chunk) => {
    chrome.output += chunk.toString();
  });

  try {
    const page = await waitForChromePage(chromeDebugPort, chrome);
    const send = await connect(page.webSocketDebuggerUrl);
    await send("Page.enable");
    await send("Runtime.enable");
    await sleep(900);
    await screenshot(send, shots.dashboard);

    await send("Page.navigate", { url: `${baseUrl}/#new-project` });
    await sleep(900);
    await screenshot(send, shots["new-project"]);

    await clickText(send, "Route channel profile");
    await clickText(send, "Continue");
    await clickText(send, "Continue");
    await clickText(send, "Review");
    await clickText(send, "Create Demo Project");
    await sleep(900);
    await screenshot(send, shots["project-overview"]);

    await clickText(send, "Shots");
    await screenshot(send, shots.shots);
    await clickText(send, "Production Queue");
    await screenshot(send, shots["production-queue"]);
    await clickText(send, "Providers");
    await screenshot(send, shots.providers);
  } finally {
    chrome.kill();
    await sleep(250);
    await removeTempDir(userDataDir);
    if (vite) vite.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
