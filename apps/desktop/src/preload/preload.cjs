const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("longShortFactory", {
  bootstrap: () => ipcRenderer.invoke("bootstrap"),
  routeTopic: (input) => ipcRenderer.invoke("route-topic", input),
  fixtureProject: (topic) => ipcRenderer.invoke("fixture-project", topic),
  mockImageBatch: (projectId) => ipcRenderer.invoke("mock-image-batch", projectId)
});

