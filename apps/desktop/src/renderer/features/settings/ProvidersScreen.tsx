import { useEffect, useRef, useState } from "react";
import { factoryClient } from "../../services/factoryClient";
import { DataTable, DisabledAction, FormField, PageHeader, SectionCard, SettingsList, StatusBadge } from "../../components/ui";
import type {
  ModelListStatus,
  ProviderCredentialSettings,
  ProviderPresence,
  TextModelCertificationResponse,
  TextModelCertificationStatus
} from "../../types";
import { textCertificationLabel } from "../../certificationLabels";
import { creatorStatusLabel } from "../../creatorStudioCopy";
import { formatDate } from "../../utils";

export function ProvidersScreen(props: {
  presence: ProviderPresence;
  settings: ProviderCredentialSettings | null;
  textCertification: TextModelCertificationResponse;
  setTextCertification: (certification: TextModelCertificationResponse) => void;
  setPresence: (presence: ProviderPresence) => void;
  setSettings: (settings: ProviderCredentialSettings | null) => void;
  onRefresh: () => Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [textModel, setTextModel] = useState("");
  const [message, setMessage] = useState("");
  const [modelConfigMessage, setModelConfigMessage] = useState("");
  const [modelListStatus, setModelListStatus] = useState<ModelListStatus>("not_tested");
  const [modelListMessage, setModelListMessage] = useState("Endpoint not tested.");
  const [models, setModels] = useState<Array<{ id: string }>>([]);
  const [savingCredential, setSavingCredential] = useState(false);
  const [savingModelConfiguration, setSavingModelConfiguration] = useState(false);
  const [certificationRunning, setCertificationRunning] = useState(false);
  const [certificationRetryUsed, setCertificationRetryUsed] = useState(false);
  const modelRefreshRunning = useRef(false);
  const modelListingRunning = modelListStatus === "testing";
  const baseUrlValid = isValidProviderBaseUrl(baseUrl);
  const discoveredModelIds = models.map((model) => model.id);
  const discoveredModelIdSet = new Set(discoveredModelIds);
  const displayedCertificationStatus: TextModelCertificationStatus = certificationRunning ? "testing" : props.textCertification.status;
  const certificationRetryExhausted = isRetryableCertificationError(props.textCertification.errorCategory) && certificationRetryUsed;

  useEffect(() => {
    const settings = props.settings;
    if (!settings) return;
    setBaseUrl(settings.baseUrl);
    setTextModel(settings.textModel ?? "");
    props.setPresence({ providerId: settings.providerId, hasCredential: settings.hasCredential });
    setCertificationRetryUsed(false);
  }, [props.settings, props.setPresence]);

  useEffect(() => {
    if (!props.presence.hasCredential || !isValidProviderBaseUrl(baseUrl)) return;
    void refreshModels();
  }, [props.presence.hasCredential, baseUrl]);

  async function saveCredential() {
    setSavingCredential(true);
    setMessage("");
    try {
      await factoryClient.saveProviderCredential({ providerId: "cockpit", baseUrl, apiKey });
      setApiKey("");
      const settings = await factoryClient.loadProviderCredentialSettings("cockpit");
      props.setSettings(settings);
      const presence = { providerId: settings.providerId, hasCredential: settings.hasCredential };
      props.setPresence(presence);
      setMessage(presence.hasCredential ? "Credential saved. Raw key was cleared from the form." : "Credential saved to SQLite, but the keychain did not return the secret.");
      await props.onRefresh();
    } catch {
      setMessage("Credential save failed. The typed API key was preserved; check diagnostics or provider settings and try again.");
    } finally {
      setSavingCredential(false);
    }
  }

  async function deleteCredential() {
    await factoryClient.deleteProviderCredential("cockpit");
    const settings = await factoryClient.loadProviderCredentialSettings("cockpit");
    props.setSettings(settings);
    const presence = { providerId: settings.providerId, hasCredential: settings.hasCredential };
    props.setPresence(presence);
    setMessage("Credential reference deleted.");
    await props.onRefresh();
  }

  async function refreshModels() {
    if (modelRefreshRunning.current) return;
    modelRefreshRunning.current = true;
    setModelListStatus("testing");
    setModelListMessage("Testing endpoint...");
    try {
      const result = await factoryClient.listCockpitTextModels();
      setModelListStatus(result.status);
      setModelListMessage(result.message);
      if (result.status === "models_discovered" || result.status === "empty_model_list") setModels(result.models);
    } catch {
      setModelListStatus("network_error");
      setModelListMessage("Model listing failed before a safe response was returned.");
    } finally {
      modelRefreshRunning.current = false;
    }
  }

  async function saveModelConfiguration() {
    setSavingModelConfiguration(true);
    setModelConfigMessage("");
    try {
      const settings = await factoryClient.saveCockpitTextModelConfiguration({ textModel });
      props.setSettings(settings);
      setTextModel(settings.textModel ?? "");
      setModelConfigMessage("Model configuration saved. Selected models are not verified.");
      await props.onRefresh();
    } catch {
      setModelConfigMessage("Model configuration save failed. Previous saved configuration was preserved.");
    } finally {
      setSavingModelConfiguration(false);
    }
  }

  async function runTextCertification() {
    const model = textModel || "No selected model";
    const confirmed = window.confirm(`This test sends real requests to Cockpit and may consume provider quota.\n\nProvider: Cockpit\nModel: ${model}\nEndpoint: /v1/responses\nRequests: 2`);
    if (!confirmed) return;
    const retryingTransientFailure = isRetryableCertificationError(props.textCertification.errorCategory);
    setCertificationRunning(true);
    try {
      props.setTextCertification({ status: "testing", message: "Text model certification is running." });
      const result = await factoryClient.runCockpitTextCapability({ providerId: "cockpit", confirmation: "Run 2 text capability requests" });
      if (retryingTransientFailure) setCertificationRetryUsed(true);
      props.setTextCertification(result);
      await props.onRefresh();
    } catch {
      if (retryingTransientFailure) setCertificationRetryUsed(true);
      props.setTextCertification({ status: "failed", message: "Text model certification failed before a safe response was returned.", errorCategory: "unknown_error" });
    } finally {
      setCertificationRunning(false);
    }
  }

  return (
    <>
      <PageHeader title="Text Provider" description="Cockpit text settings. API keys are write-only and stored through the secure credential provider." />
      <SectionCard title="Cockpit" description="OpenAI-compatible text generation via /v1/models and /v1/responses.">
        <div className="form-grid">
          <FormField label="Base URL" htmlFor="provider-base-url" hint="Example: http://localhost:55773/v1"><input id="provider-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></FormField>
          <FormField label="API key" htmlFor="provider-api-key" hint={props.presence.hasCredential ? "Credential configured. Leave blank unless replacing it." : "Write-only input."}><input id="provider-api-key" value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="off" /></FormField>
          <ModelSelect label="Model" id="provider-text-model" value={textModel} modelIds={discoveredModelIds} onChange={setTextModel} />
          <div className="capability-card"><strong>Text provider status</strong><StatusBadge tone={props.presence.hasCredential ? "success" : "warning"}>{props.presence.hasCredential ? "API key configured" : "Not configured"}</StatusBadge></div>
          <div className="button-row">
            {apiKey.trim() ? <button className="button primary" type="button" onClick={() => void saveCredential()} disabled={savingCredential}>{savingCredential ? "Saving..." : "Save Cockpit settings"}</button> : <DisabledAction reason="Enter an API key before saving or replacing the credential.">Save Cockpit settings</DisabledAction>}
            {props.presence.hasCredential ? <button className="button danger" type="button" onClick={() => void deleteCredential()}>Delete API key</button> : null}
            {props.presence.hasCredential && baseUrlValid && !modelListingRunning ? <button className="button secondary" type="button" onClick={() => void refreshModels()}>Refresh models</button> : <DisabledAction reason={!props.presence.hasCredential ? "Save Cockpit settings first." : !baseUrlValid ? "Use a valid Cockpit base URL." : "Model listing is already running."}>Refresh models</DisabledAction>}
            {textModel && discoveredModelIdSet.has(textModel) && !savingModelConfiguration ? <button className="button primary" type="button" onClick={() => void saveModelConfiguration()}>Save model</button> : <DisabledAction reason="Refresh models and choose a discovered model first.">Save model</DisabledAction>}
          </div>
          {message ? <p className={message.includes("failed") ? "error-message" : "safe-message"}>{message}</p> : null}
          {modelConfigMessage ? <p className={modelConfigMessage.includes("failed") ? "error-message" : "safe-message"}>{modelConfigMessage}</p> : null}
          <div className="capability-card"><strong>Model discovery</strong><StatusBadge tone={modelListTone(modelListStatus)}>{creatorStatusLabel(modelListStatus)}</StatusBadge><small>{modelListMessage}</small></div>
          <TextModelCertificationPanel selectedModel={textModel} certification={props.textCertification} displayedStatus={displayedCertificationStatus} running={certificationRunning} retryExhausted={certificationRetryExhausted} hasCredential={props.presence.hasCredential} onRun={() => void runTextCertification()} />
          {models.length ? <DataTable label="Cockpit models"><thead><tr><th>Discovered</th></tr></thead><tbody>{models.map((model) => <tr key={model.id}><td>{model.id}</td></tr>)}</tbody></DataTable> : null}
        </div>
      </SectionCard>
      <SectionCard title="Legacy / không dùng trong quy trình hiện tại" description="Ảnh được tạo và duyệt thủ công qua GG Lab. Các adapter provider cũ vẫn tồn tại ở backend để tương thích, nhưng không có cấu hình hay chứng nhận nào có thể thao tác tại đây."><p className="safe-message">Không có provider image nào đang hoạt động trong giao diện creator.</p></SectionCard>
    </>
  );
}

function ModelSelect(props: { label: string; id: string; value: string; modelIds: string[]; onChange: (value: string) => void }) {
  const valueInDiscovered = props.modelIds.includes(props.value);
  return <FormField label={props.label} htmlFor={props.id} hint="Select from Discovered models only. Manual entry is disabled."><select id={props.id} value={valueInDiscovered ? props.value : ""} onChange={(event) => props.onChange(event.target.value)} disabled={!props.modelIds.length}><option value="">Select Discovered model</option>{props.modelIds.map((modelId) => <option key={modelId} value={modelId}>{modelId}</option>)}</select></FormField>;
}

function TextModelCertificationPanel(props: { selectedModel: string; certification: TextModelCertificationResponse; displayedStatus: TextModelCertificationStatus; running: boolean; retryExhausted: boolean; hasCredential: boolean; onRun: () => void }) {
  const record = props.certification.record;
  const exact = record?.exactTextTest;
  const json = record?.strictJsonTest;
  return <div className="form-grid"><div className="section-heading"><h3>Text capability verification</h3><p>This sends two real Cockpit requests and may consume provider quota.</p></div><div className="form-grid"><div className="capability-card"><strong>Selected model</strong><StatusBadge tone={props.selectedModel ? "info" : "warning"}>{props.selectedModel || "Not selected"}</StatusBadge><small>{props.selectedModel ? "Selected" : "Select a discovered model first."}</small></div><div className="capability-card"><strong>Endpoint strategy</strong><StatusBadge tone="info">/v1/responses</StatusBadge><small>Requests: 2</small></div><div className="capability-card"><strong>Capability status</strong><StatusBadge tone={modelCertificationTone(props.displayedStatus)}>{textCertificationLabel(props.displayedStatus)}</StatusBadge><small>{props.certification.message}</small></div><SettingsList items={[["Last tested time", record?.testedAt ? formatDate(record.testedAt) : "Not tested"], ["Text probe", exact ? testResultLabel(exact) : "Not tested"], ["Structured output", json ? testResultLabel(json) : "Not tested"], ["Returned model ID", record?.returnedModelId ?? "Not returned"]]} /><div className="button-row">{props.hasCredential && props.selectedModel && !props.running && !props.retryExhausted ? <button className="button primary" type="button" onClick={props.onRun}>Test connection</button> : <DisabledAction reason={!props.hasCredential ? "Save Cockpit settings first." : !props.selectedModel ? "Select and save a text model first." : props.retryExhausted ? "One manual retry was already used for this network or timeout failure." : "Text capability verification is already running."}>Test connection</DisabledAction>}</div></div></div>;
}

function testResultLabel(result: { status: "passed" | "failed"; skipped?: boolean; errorCategory?: string }): string {
  if (result.skipped) return `Skipped (${result.errorCategory ?? "unknown_error"})`;
  if (result.status === "passed") return "Passed";
  return `Failed (${result.errorCategory ?? "unknown_error"})`;
}

function modelCertificationTone(status: TextModelCertificationStatus): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "verified") return "success";
  if (status === "failed") return "danger";
  if (status === "testing") return "info";
  return "warning";
}

function isRetryableCertificationError(errorCategory: string | undefined): boolean {
  return errorCategory === "timeout" || errorCategory === "network_error";
}

function isValidProviderBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function modelListTone(status: ModelListStatus): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "models_discovered" || status === "empty_model_list") return "success";
  if (status === "testing") return "info";
  if (status === "not_tested") return "warning";
  return "danger";
}
