import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFixtureProject,
  routeChannelProfile,
  seedChannelProfiles,
  type ChannelRouteInput
} from "@lsf/domain";
import { PersistentGenerationQueue } from "@lsf/generation-queue";

const workspaceRoot = process.env.WORKSPACE_ROOT ?? join(process.cwd(), "workspace");
const currentDir = fileURLToPath(new URL(".", import.meta.url));
const queue = new PersistentGenerationQueue({
  storagePath: join(workspaceRoot, "queue.json"),
  defaultConcurrency: 5
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    webPreferences: {
      preload: join(currentDir, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServer = process.env.VITE_DEV_SERVER_URL;
  if (devServer) {
    void win.loadURL(devServer);
  } else {
    void win.loadFile(join(currentDir, "../../dist/renderer/index.html"));
  }
}

app.whenReady().then(() => {
  mkdirSync(workspaceRoot, { recursive: true });
  createWindow();
});

ipcMain.handle("bootstrap", () => ({
  profiles: seedChannelProfiles,
  workspaceRoot,
  queue: queue.snapshotWorkers()
}));

ipcMain.handle("route-topic", (_event, input: ChannelRouteInput) =>
  routeChannelProfile(seedChannelProfiles, input)
);

ipcMain.handle("fixture-project", (_event, topic: string) =>
  createFixtureProject({
    topic,
    format: "long",
    targetLanguage: "English",
    profiles: seedChannelProfiles
  })
);

ipcMain.handle("mock-image-batch", async (_event, projectId: string) => {
  for (let index = 0; index < 5; index += 1) {
    queue.enqueue({
      projectId,
      shotId: `shot-${index + 1}`,
      requestType: "image",
      provider: "9router",
      model: "mock-image",
      promptVersionId: "16_image_prompt_compiler.v1",
      priority: index,
      idempotencyKey: `${projectId}-mock-${index}`
    });
  }
  await queue.runUntilIdle(async (job) => ({
    outputAssetIds: [`asset-${job.shotId}`],
    responseMetadata: { mocked: true },
    usageEstimate: { usd: 0 }
  }));
  return queue.snapshotWorkers();
});
