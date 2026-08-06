const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const baseUrl = process.env.UI_SCREENSHOT_URL || "http://127.0.0.1:5173";
const shouldManageVite = !process.env.UI_SCREENSHOT_URL;
const screenshotDir = path.resolve(process.env.UI_SCREENSHOT_DIR || "docs/screenshots");

const shots = {
  dashboard: path.join(screenshotDir, "dashboard.png"),
  "new-project": path.join(screenshotDir, "new-project-wizard.png"),
  "project-overview": path.join(screenshotDir, "project-overview.png"),
  "story-editor": path.join(screenshotDir, "story-editor.png"),
  director: path.join(screenshotDir, "director-storyboard.png"),
  "prompt-studio": path.join(screenshotDir, "scene-prompt-studio.png"),
  "asset-intake": path.join(screenshotDir, "asset-intake-missing.png"),
  "asset-intake-complete": path.join(screenshotDir, "asset-intake-complete.png"),
  build: path.join(screenshotDir, "build-render.png"),
  "final-export": path.join(screenshotDir, "final-export.png"),
  shots: path.join(screenshotDir, "shot-board.png"),
  "production-queue": path.join(screenshotDir, "production-queue.png"),
  providers: path.join(screenshotDir, "provider-settings.png")
};

function screenshotViewports() {
  const configured = process.env.UI_SCREENSHOT_VIEWPORTS;
  if (!configured) return [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }];
  return configured.split(",").map((value) => {
    const [width, height] = value.trim().split("x").map(Number);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 240) throw new Error(`Invalid screenshot viewport: ${value}`);
    return { width, height };
  });
}

function viewportOutputDir(viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  return label === "1440x900" ? screenshotDir : path.join(screenshotDir, label);
}

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

async function assertNoHorizontalOverflow(send, route) {
  const result = await send("Runtime.evaluate", {
    expression: "({ route: location.hash, width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth })",
    returnByValue: true
  });
  const metrics = result.result.value;
  if (metrics.scrollWidth > metrics.width + 1) throw new Error(`Horizontal overflow at ${route}: ${metrics.scrollWidth}px > ${metrics.width}px`);
}

async function assertImagesLoaded(send, route) {
  const result = await send("Runtime.evaluate", {
    expression: `Array.from(document.querySelectorAll("img")).map((image) => ({ alt: image.alt, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }))`,
    returnByValue: true
  });
  const broken = (result.result.value ?? []).filter((image) => !image.complete || image.width === 0 || image.height === 0);
  if (broken.length) throw new Error(`Broken images at ${route}: ${JSON.stringify(broken.slice(0, 5))}`);
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

async function clickProject(send, projectName) {
  const result = await send("Runtime.evaluate", {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll("tr, [role=\\"row\\"], .home-project-card"));
      const textOf = (item) => [item.innerText, item.textContent].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
      const row = rows.find((item) => textOf(item).includes(${JSON.stringify(projectName)}));
      const button = row && Array.from(row.querySelectorAll("button")).find((item) => !item.disabled && textOf(item).includes("Mở"));
      if (!button) return { clicked: false, rows: rows.map(textOf).slice(0, 10) };
      button.click();
      return { clicked: true, rows: [] };
    })()`,
    returnByValue: true
  });
  if (!result.result.value?.clicked) throw new Error(`Could not open screenshot fixture project: ${JSON.stringify(result.result.value)}`);
  await sleep(700);
}

async function setInputValue(send, selector, value) {
  const expression = `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) return false;
    setter.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })()`;
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true });
  if (!result.result.value) throw new Error(`Could not set ${selector}`);
  await sleep(250);
}

async function navigateAndScreenshot(send, route, outputPath) {
  await send("Page.navigate", { url: `${baseUrl}/#${route}` });
  await sleep(750);
  await send("Runtime.evaluate", { expression: "window.scrollTo(0, 0); document.querySelector('.content-scroll')?.scrollTo(0, 0)" });
  await assertNoHorizontalOverflow(send, route);
  await screenshot(send, outputPath);
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

async function captureViewport(viewport, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const chromeDebugPort = process.env.CHROME_DEBUG_PORT ? Number(process.env.CHROME_DEBUG_PORT) : await getAvailablePort();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "lsf-chrome-ui-shots-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    `--window-size=${viewport.width},${viewport.height}`,
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
    const output = (name) => path.join(outputDir, path.basename(shots[name]));
    await assertNoHorizontalOverflow(send, "dashboard");
    await screenshot(send, output("dashboard"));

    await navigateAndScreenshot(send, "create", output("new-project"));
    await setInputValue(send, "#simple-topic", "Creator Studio screenshot project");
    await clickText(send, "Tiếp tục: định dạng");
    await clickText(send, "Tiếp tục: xác nhận");
    await clickText(send, "Tạo dự án");
    await sleep(900);
    await assertNoHorizontalOverflow(send, "project-overview");
    await screenshot(send, output("project-overview"));
    await navigateAndScreenshot(send, "script", output("story-editor"));
    await navigateAndScreenshot(send, "scenes", output("director"));
    await navigateAndScreenshot(send, "visuals", output("prompt-studio"));
    await navigateAndScreenshot(send, "assets", output("asset-intake"));
    await navigateAndScreenshot(send, "timeline", output("build"));
    await navigateAndScreenshot(send, "export", output("final-export"));
    await navigateAndScreenshot(send, "shots", output("shots"));
    await navigateAndScreenshot(send, "production-queue", output("production-queue"));
    await navigateAndScreenshot(send, "providers", output("providers"));
    await send("Page.navigate", { url: `${baseUrl}/?creator-studio-fixture=asset-intake-complete#projects` });
    await sleep(1_000);
    const fixtureText = await send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
    if (!fixtureText.result.value.includes("Creator Studio asset intake fixture")) throw new Error(`Asset intake screenshot fixture did not load: ${fixtureText.result.value.slice(0, 500)}`);
    await clickProject(send, "Creator Studio asset intake fixture");
    const openedText = await send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
    if (openedText.result.value.includes("Chọn một dự án để bắt đầu")) throw new Error(`Asset intake screenshot fixture did not open: ${openedText.result.value.slice(0, 500)}`);
    await send("Runtime.evaluate", { expression: "window.location.hash = '#assets'" });
    await sleep(2_500);
    const assetText = await send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true });
    if (assetText.result.value.includes("Chọn một dự án để bắt đầu")) throw new Error(`Asset intake screenshot fixture lost selection: ${assetText.result.value.slice(0, 500)}`);
    await assertNoHorizontalOverflow(send, "asset-intake-complete");
    await assertImagesLoaded(send, "asset-intake-complete");
    await send("Runtime.evaluate", { expression: "document.querySelector('.content-scroll')?.scrollTo(0, 650)" });
    await screenshot(send, output("asset-intake-complete"));
  } finally {
    chrome.kill();
    await sleep(250);
    await removeTempDir(userDataDir);
  }
}

async function main() {
  await fs.mkdir(screenshotDir, { recursive: true });
  const vite = await ensureViteServer();
  try {
    for (const viewport of screenshotViewports()) await captureViewport(viewport, viewportOutputDir(viewport));
  } finally {
    if (vite) vite.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
