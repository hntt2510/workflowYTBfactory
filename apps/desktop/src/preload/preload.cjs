const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("longShortFactory", {
  bootstrap: () => ipcRenderer.invoke("bootstrap"),
  routeTopic: (input) => ipcRenderer.invoke("route-topic", input),
  fixtureProject: (input) => ipcRenderer.invoke("fixture-project", input),
  listProjects: () => ipcRenderer.invoke("list-projects"),
  loadProject: (projectId) => ipcRenderer.invoke("load-project", { projectId }),
  deleteProject: (projectId) => ipcRenderer.invoke("delete-project", { projectId }),
  saveProviderCredential: (input) => ipcRenderer.invoke("save-provider-credential", input),
  loadProviderCredentialSettings: (providerId) => ipcRenderer.invoke("load-provider-credential-settings", { providerId }),
  hasProviderCredential: (providerId) => ipcRenderer.invoke("has-provider-credential", { providerId }),
  testCredentialPresence: (providerId) => ipcRenderer.invoke("test-credential-presence", { providerId }),
  deleteProviderCredential: (providerId) => ipcRenderer.invoke("delete-provider-credential", { providerId }),
  list9RouterModels: () => ipcRenderer.invoke("list-9router-models", { providerId: "9router" }),
  loadLocalTtsSettings: () => ipcRenderer.invoke("load-local-tts-settings"),
  saveLocalTtsSettings: (input) => ipcRenderer.invoke("save-local-tts-settings", input),
  generateLocalTts: (input) => ipcRenderer.invoke("generate-local-tts", input),
  addCompetitorReference: (input) => ipcRenderer.invoke("add-competitor-reference", input),
  mockImageBatch: (projectId) => ipcRenderer.invoke("mock-image-batch", projectId)
});
