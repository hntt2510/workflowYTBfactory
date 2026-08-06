import { useEffect, useState } from "react";
import type { ChannelProfile, ChannelRouteDecision } from "@lsf/domain";
import { characterVersionIsApproved, resolveApprovedCharacterVersion } from "@lsf/domain";
import { factoryClient } from "../../services/factoryClient";
import type { RouteId } from "../../navigation";
import { FormField, PageHeader, SectionCard, StatusBadge, TagList } from "../../components/ui";
import type { BootstrapData, ImageModelCertificationResponse, LocalTtsSettings, ProviderCredentialSettings, ProviderPresence, TextModelCertificationResponse, TtsProviderCatalog } from "../../types";
import { creatorStatusLabel, workflowModeOptions } from "../../creatorStudioCopy";
import { safeRendererError } from "../../utils";

const languageOptions = [
  "English",
  "Vietnamese",
  "Spanish",
  "Portuguese",
  "French",
  "German",
  "Italian",
  "Dutch",
  "Polish",
  "Turkish",
  "Arabic",
  "Hindi",
  "Indonesian",
  "Japanese",
  "Korean",
  "Thai",
  "Custom"
];

const ttsLanguageOptions: Array<{ code: string; label: string }> = [
  { code: "vi", label: "Vietnamese" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "pl", label: "Polish" },
  { code: "tr", label: "Turkish" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "th", label: "Thai" },
  { code: "zh", label: "Chinese" }
];

function simpleCreateLanguageOptions(profiles: ChannelProfile[], settings: LocalTtsSettings | null): string[] {
  const configured = new Set(languageOptions.filter((option) => option !== "Custom"));
  for (const profile of profiles) {
    const value = profile.language.trim();
    if (!value) continue;
    const option = ttsLanguageOptions.find((item) => item.code === ttsLanguageCode(value));
    configured.add(option?.label ?? value);
  }
  const storedLanguage = settings?.language?.trim();
  if (storedLanguage) {
    const option = ttsLanguageOptions.find((item) => item.code === ttsLanguageCode(storedLanguage));
    configured.add(option?.label ?? storedLanguage);
  }
  const storedVoice = settings?.ttsVoiceId?.trim().toLowerCase() ?? "";
  if (storedVoice.startsWith("vi-") || storedVoice.includes("/vi-")) configured.add("Vietnamese");
  return Array.from(configured).sort((left, right) => left.localeCompare(right));
}

function defaultTargetDuration(format: "long" | "short"): string {
  return format === "long" ? "8-12 minutes" : "45-60 seconds";
}

export function ttsLanguageCode(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  const option = ttsLanguageOptions.find((item) => item.code === normalized || item.label.toLowerCase() === normalized);
  return option?.code ?? (normalized ? normalized.split("-", 1)[0]! : "vi");
}

export function SimpleCreateScreen(props: {
  profiles: ChannelProfile[];
  localTtsSettings: LocalTtsSettings | null;
  setRoute: (route: RouteId) => void;
  onCreateProject: (input: {
    topic: string;
    format: "long" | "short";
    targetLanguage: string;
    selectedProfileId?: string;
    characterVersionId?: string;
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
    inputMode?: "topic" | "existing_script" | "reference";
    aspectRatio?: "16:9" | "9:16" | "1:1";
    visualStyle?: "vox-documentary";
    voiceId?: string;
    outputResolution?: "1080p" | "720p";
    sourceScript?: string;
    referenceUrl?: string;
    competitorReference?: { sourceUrl?: string; pastedTranscript: string; notes?: string };
  }) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [inputMode, setInputMode] = useState<"topic" | "existing_script" | "reference">("topic");
  const [topic, setTopic] = useState("");
  const [projectName, setProjectName] = useState("");
  const [script, setScript] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referenceTranscript, setReferenceTranscript] = useState("");
  const [notes, setNotes] = useState("");
  const [profileId, setProfileId] = useState(props.profiles[0]?.id ?? "");
  const selectedProfile = props.profiles.find((profile) => profile.id === profileId);
  const approvedCharacterVersions = (selectedProfile?.characterVersions ?? []).filter(characterVersionIsApproved);
  const defaultCharacterVersion = resolveApprovedCharacterVersion(selectedProfile);
  const [characterVersionId, setCharacterVersionId] = useState(defaultCharacterVersion?.id ?? "");
  const availableLanguages = simpleCreateLanguageOptions(props.profiles, props.localTtsSettings);
  const [language, setLanguage] = useState(availableLanguages.includes("Vietnamese") ? "Vietnamese" : availableLanguages[0] ?? "English");
  const [format, setFormat] = useState<"long" | "short">("long");
  const [duration, setDuration] = useState(() => defaultTargetDuration("long"));
  const [customDuration, setCustomDuration] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16" | "1:1">("16:9");
  const [voiceId, setVoiceId] = useState("");
  const [resolution, setResolution] = useState<"1080p" | "720p">("1080p");
  const [catalog, setCatalog] = useState<TtsProviderCatalog | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!showAdvanced) return;
    let cancelled = false;
    void factoryClient.listTtsProviders({ language: ttsLanguageCode(language) })
      .then((result) => { if (!cancelled) setCatalog(result); })
      .catch(() => { if (!cancelled) setCatalog(null); });
    return () => { cancelled = true; };
  }, [language, showAdvanced]);

  const configuredProvider = props.localTtsSettings?.ttsProvider;
  const selectedLanguageCode = ttsLanguageCode(language);
  const voices = (catalog?.voices ?? []).filter((voice) => voice.enabled && !voice.experimental && ttsLanguageCode(voice.language) === selectedLanguageCode && (!configuredProvider || voice.provider === configuredProvider));
  const configuredLanguageCode = ttsLanguageCode(props.localTtsSettings?.language);
  const configuredVoice = props.localTtsSettings?.available && props.localTtsSettings.ttsVoiceId
    && configuredLanguageCode === selectedLanguageCode
    ? [{ key: `configured:${props.localTtsSettings.ttsVoiceId}`, label: `Configured voice (${props.localTtsSettings.ttsVoiceId})` }]
    : [];
  const voiceOptions = voices.length ? voices.map((voice) => ({ key: voice.providerVoiceId, label: `${voice.label} (${voice.provider})` })) : configuredVoice;
  const defaultVoiceKey = voiceOptions[0]?.key ?? "";
  const contentReady = inputMode === "topic" ? topic.trim().length > 0 : inputMode === "existing_script" ? script.trim().length > 0 : referenceTranscript.trim().length > 0;
  const configurationReady = duration !== "Custom" || customDuration.trim().length > 0;

  function chooseFormat(nextFormat: "long" | "short"): void {
    if (duration === defaultTargetDuration(format)) setDuration(defaultTargetDuration(nextFormat));
    setFormat(nextFormat);
    if (nextFormat === "long" && aspectRatio === "9:16") setAspectRatio("16:9");
    if (nextFormat === "short" && aspectRatio === "16:9") setAspectRatio("9:16");
  }

  useEffect(() => {
    const nextDefault = resolveApprovedCharacterVersion(selectedProfile)?.id ?? "";
    setCharacterVersionId((current) => approvedCharacterVersions.some((version) => version.id === current) ? current : nextDefault);
  }, [profileId, selectedProfile, approvedCharacterVersions]);

  useEffect(() => {
    if (!voiceOptions.some((voice) => voice.key === voiceId)) setVoiceId(defaultVoiceKey);
  }, [defaultVoiceKey, voiceId, voiceOptions]);

  async function create(): Promise<void> {
    setMessage("");
    if (!contentReady || !configurationReady) {
      setMessage(inputMode === "topic" ? "Nhập chủ đề để tiếp tục." : inputMode === "existing_script" ? "Dán kịch bản có sẵn để tiếp tục." : "Dán transcript tham khảo để tiếp tục.");
      if (!configurationReady) setMessage("Nhập thời lượng tuỳ chỉnh để tiếp tục.");
      return;
    }
    setSaving(true);
    try {
      const title = projectName.trim() || (inputMode === "topic" ? topic.trim() : inputMode === "existing_script" ? "Dự án từ kịch bản" : "Dự án từ tài liệu tham khảo");
      await props.onCreateProject({
        topic: title,
        projectName: title.slice(0, 120),
        format,
        targetLanguage: language,
        ...(profileId ? { selectedProfileId: profileId } : {}),
        targetDuration: duration === "Custom" ? customDuration.trim() : duration,
        workflowMode: "semi_automatic",
        inputMode,
        aspectRatio,
        visualStyle: "vox-documentary",
        ...(characterVersionId ? { characterVersionId } : {}),
        ...(voiceId ? { voiceId: voiceId.startsWith("configured:") ? voiceId.slice("configured:".length) : voiceId } : {}),
        outputResolution: resolution,
        ...(inputMode === "existing_script" ? { sourceScript: script } : {}),
        ...(inputMode === "reference" ? {
          ...(referenceUrl.trim() ? { referenceUrl: referenceUrl.trim() } : {}),
          competitorReference: { ...(referenceUrl.trim() ? { sourceUrl: referenceUrl.trim() } : {}), pastedTranscript: referenceTranscript, ...(notes.trim() ? { notes: notes.trim() } : {}) }
        } : {})
      });
    } catch (error) {
      setMessage(safeRendererError(error, "Không thể tạo dự án. Hãy kiểm tra cấu hình và thử lại."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Tạo dự án video" description="Ba bước ngắn để bắt đầu. Ảnh sẽ được tạo thủ công trong GG Lab; provider và CapCut chỉ xuất hiện khi thật sự cần." />
      <div className="wizard wizard-compact">
        <aside className="wizard-steps" aria-label="Các bước tạo dự án">
          {["Nguồn nội dung", "Định dạng", "Xác nhận"].map((label, index) => <button className={step === index + 1 ? "active" : ""} key={label} type="button" onClick={() => setStep((index + 1) as 1 | 2 | 3)}><span>{index + 1}</span>{label}</button>)}
        </aside>
        <SectionCard>
          {step === 1 ? <div className="stack">
            <div className="option-grid">
              {(["topic", "existing_script", "reference"] as const).map((mode) => <Option key={mode} title={mode === "topic" ? "Bắt đầu từ chủ đề" : mode === "existing_script" ? "Tôi đã có kịch bản" : "Tôi có tài liệu tham khảo"} detail={mode === "topic" ? "Phát triển ý tưởng trong Story." : mode === "existing_script" ? "Dán lời dẫn và đi thẳng vào biên tập." : "Lưu transcript và nguồn để kiểm tra."} active={inputMode === mode} onClick={() => setInputMode(mode)} />)}
            </div>
            <FormField label="Tên dự án (tuỳ chọn)" htmlFor="simple-project-name"><input id="simple-project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Ví dụ: Những biểu tượng bị lãng quên" /></FormField>
            {inputMode === "topic" ? <FormField label="Chủ đề" htmlFor="simple-topic"><textarea id="simple-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Video sẽ giải thích điều gì?" /></FormField> : null}
            {inputMode === "existing_script" ? <FormField label="Kịch bản có sẵn" htmlFor="simple-script"><textarea id="simple-script" value={script} onChange={(event) => setScript(event.target.value)} placeholder="Dán kịch bản vào đây" /></FormField> : null}
            {inputMode === "reference" ? <div className="form-grid"><FormField label="URL tham khảo" htmlFor="simple-reference-url"><input id="simple-reference-url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="URL nguồn tuỳ chọn" /></FormField><FormField label="Transcript tham khảo" htmlFor="simple-reference-transcript"><textarea id="simple-reference-transcript" value={referenceTranscript} onChange={(event) => setReferenceTranscript(event.target.value)} placeholder="Dán transcript hoặc tài liệu tham khảo" /></FormField><FormField label="Ghi chú" htmlFor="simple-reference-notes"><textarea id="simple-reference-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ghi chú tuỳ chọn" /></FormField></div> : null}
            <button className="button primary" type="button" disabled={!contentReady} onClick={() => setStep(2)}>Tiếp tục: định dạng</button>
          </div> : null}
          {step === 2 ? <div className="stack">
            <div className="option-grid"><Option title="YouTube Long" detail="Video dài, nhịp kể đầy đủ." active={format === "long"} onClick={() => chooseFormat("long")} /><Option title="YouTube Short" detail="Khung dọc, nhịp gọn và trực diện." active={format === "short"} onClick={() => chooseFormat("short")} /></div>
            <div className="form-grid">
              <FormField label="Ngôn ngữ" htmlFor="simple-language"><select id="simple-language" value={language} onChange={(event) => setLanguage(event.target.value)}>{availableLanguages.map((option) => <option key={option} value={option}>{option}</option>)}</select></FormField>
              <FormField label="Tỷ lệ khung hình" htmlFor="simple-aspect-ratio"><select id="simple-aspect-ratio" value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)}><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option></select></FormField>
              <FormField label="Thời lượng mục tiêu" htmlFor="simple-duration"><select id="simple-duration" value={duration} onChange={(event) => setDuration(event.target.value)}>{[['30-45 seconds', '30-45 giây'], ['45-60 seconds', '45-60 giây'], ['60-90 seconds', '60-90 giây'], ['2-3 minutes', '2-3 phút'], ['5-8 minutes', '5-8 phút'], ['Custom', 'Tuỳ chỉnh']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField>
              {duration === "Custom" ? <FormField label="Thời lượng tuỳ chỉnh" htmlFor="simple-custom-duration"><input id="simple-custom-duration" value={customDuration} onChange={(event) => setCustomDuration(event.target.value)} placeholder="90-120 giây" /></FormField> : null}
            </div>
            <details className="advanced-disclosure" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
              <summary>Tuỳ chọn nâng cao</summary>
              <div className="form-grid">
                <FormField label="Hồ sơ kênh" htmlFor="simple-channel-profile"><select id="simple-channel-profile" value={profileId} onChange={(event) => setProfileId(event.target.value)}>{props.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></FormField>
                <FormField label="Nhân vật kênh" htmlFor="simple-character-version"><select id="simple-character-version" value={characterVersionId} onChange={(event) => setCharacterVersionId(event.target.value)}><option value="">Chọn sau khi tạo</option>{approvedCharacterVersions.map((version) => <option key={version.id} value={version.id}>{version.name} v{version.version}</option>)}</select></FormField>
                <FormField label="Giọng đọc" htmlFor="simple-voice"><select id="simple-voice" value={voiceId} onChange={(event) => setVoiceId(event.target.value)}><option value="">Chọn sau trong Build</option>{voiceOptions.map((voice) => <option key={voice.key} value={voice.key}>{voice.label}</option>)}</select></FormField>
                <FormField label="Độ phân giải" htmlFor="simple-resolution"><select id="simple-resolution" value={resolution} onChange={(event) => setResolution(event.target.value as typeof resolution)}><option value="1080p">1080p</option><option value="720p">720p</option></select></FormField>
              </div>
            </details>
            {message ? <p className="error-message">{message}</p> : null}
            <div className="button-row"><button className="button secondary" type="button" onClick={() => setStep(1)}>Quay lại</button><button className="button primary" type="button" disabled={!configurationReady} onClick={() => setStep(3)}>Tiếp tục: xác nhận</button></div>
          </div> : null}
          {step === 3 ? <div className="stack">
            <div className="review-list"><p><strong>Dự án:</strong> {projectName.trim() || (inputMode === "topic" ? topic : inputMode === "existing_script" ? "Dự án từ kịch bản" : "Dự án từ tài liệu tham khảo")}</p><p><strong>Nguồn:</strong> {inputMode === "topic" ? "Chủ đề" : inputMode === "existing_script" ? "Kịch bản có sẵn" : "Tài liệu tham khảo"}</p><p><strong>Định dạng:</strong> {format === "short" ? "YouTube Short" : "YouTube Long"} · {aspectRatio} · {duration === "Custom" ? customDuration : duration}</p><p><strong>Ngôn ngữ:</strong> {language}</p></div>
            <div className="asset-workflow-callout"><strong>Ảnh thủ công trong GG Lab</strong><p>Sau khi tạo, Story và Director sẽ tạo một prompt hoàn chỉnh cho từng cảnh. Bạn chỉ cần tạo ảnh, upload và duyệt trong Assets.</p></div>
            <details className="advanced-disclosure"><summary>Hiện tuỳ chọn kỹ thuật</summary><p className="muted">Hồ sơ: {selectedProfile?.name ?? "Chưa chọn"} · Nhân vật: {characterVersionId ? "Đã chọn" : "Chọn sau"} · Giọng: {voiceId ? "Đã chọn" : "Chọn sau trong Build"} · Đầu ra: {resolution}</p></details>
            {message ? <p className="error-message">{message}</p> : null}
            <div className="button-row"><button className="button secondary" type="button" onClick={() => setStep(2)}>Quay lại</button><button className="button primary" type="button" disabled={saving} onClick={() => void create()}>{saving ? "Đang tạo..." : "Tạo dự án"}</button></div>
          </div> : null}
        </SectionCard>
      </div>
    </>
  );
}

export function NewProjectWizard(props: {
  profiles: ChannelProfile[];
  providerPresence: ProviderPresence;
  stockPresence: ProviderPresence;
  providerSettings: ProviderCredentialSettings | null;
  textCertification: TextModelCertificationResponse;
  imageCertification: ImageModelCertificationResponse;
  bootstrap: BootstrapData;
  localTtsSettings: LocalTtsSettings | null;
  setRoute: (route: RouteId) => void;
  onCreateProject: (input: {
    topic: string;
    format: "long" | "short";
    targetLanguage: string;
    selectedProfileId?: string;
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
    visualWorkflow?: "legacy" | "character_first";
    characterVersionId?: string;
    competitorReference?: {
      sourceUrl?: string;
      pastedTranscript: string;
      notes?: string;
    };
  }) => Promise<void>;
}) {
  const [step, setStep] = useState(1);
  const [topic, setTopic] = useState("What did Aaron's breastpiece symbolize?");
  const [projectName, setProjectName] = useState("");
  const [format, setFormat] = useState<"long" | "short">("long");
  const [languageChoice, setLanguageChoice] = useState("Vietnamese");
  const [customLanguage, setCustomLanguage] = useState("");
  const [targetDuration, setTargetDuration] = useState("");
  const [workflowMode, setWorkflowMode] = useState<"guided" | "semi_automatic" | "full_automatic">("semi_automatic");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [competitorScript, setCompetitorScript] = useState("");
  const [competitorNotes, setCompetitorNotes] = useState("");
  const [message, setMessage] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [selectedCharacterVersionId, setSelectedCharacterVersionId] = useState<string | undefined>(undefined);
  const [decision, setDecision] = useState<ChannelRouteDecision | null>(null);
  const [saving, setSaving] = useState(false);
  const routedProfile = props.profiles.find((profile) => profile.id === (selectedProfileId || decision?.selectedProfileId));
  const characterVersions = (routedProfile?.characterVersions ?? []).filter(characterVersionIsApproved);
  const selectedCharacterVersion = characterVersions.find((version) => version.id === selectedCharacterVersionId) ?? characterVersions.find((version) => version.id === routedProfile?.activeCharacterVersionId);
  const targetLanguage = languageChoice === "Custom" ? customLanguage.trim() : languageChoice;
  const effectiveTargetDuration = targetDuration.trim() || defaultTargetDuration(format);
  // Provider capability gates belong to individual production stages, not project creation.
  const setupReady = Boolean(targetLanguage.trim());
  const missingSetupMessage = setupReady ? "" : "Choose a target language before creating the project.";

  async function routeTopic() {
    setMessage("");
    if (!setupReady) {
      setMessage(`Setup is incomplete. Finish these items before creating a project. ${missingSetupMessage}`);
      return;
    }
    if (!targetLanguage.trim()) return;
    const input = {
      topic,
      format,
      targetLanguage,
      ...(selectedProfileId ? { selectedProfileId } : {})
    };
    setDecision(await factoryClient.routeTopic(input));
    setStep(2);
  }

  async function create() {
    setMessage("");
    if (!setupReady) {
      setMessage(`Setup is incomplete. Finish these items before creating a project. ${missingSetupMessage}`);
      return;
    }
    setSaving(true);
    try {
      const competitorReference = competitorScript.trim()
        ? {
            ...(competitorUrl.trim() ? { sourceUrl: competitorUrl.trim() } : {}),
            pastedTranscript: competitorScript,
            ...(competitorNotes.trim() ? { notes: competitorNotes.trim() } : {})
          }
        : undefined;
      const routedProfileId = selectedProfileId || decision?.selectedProfileId;
      await props.onCreateProject({
        topic,
        projectName: projectName.trim() || topic,
        format,
        targetLanguage: targetLanguage.trim() || "English",
        targetDuration: effectiveTargetDuration,
        workflowMode,
        ...(competitorReference ? { competitorReference } : {}),
        ...(routedProfileId ? { selectedProfileId: routedProfileId } : {}),
        ...(workflowMode === "semi_automatic" ? { visualWorkflow: "character_first" as const } : { visualWorkflow: "legacy" as const }),
        ...(selectedCharacterVersion?.id ? { characterVersionId: selectedCharacterVersion.id } : {})
      });
    } catch (error) {
      setMessage(`Project create failed: ${safeRendererError(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Bắt đầu một video mới" title="Tạo dự án" description="Chốt brief trước. Bạn có thể tạo ảnh thủ công trong GG Lab mà không cần cấu hình image provider." />
      <div className="wizard">
        <aside className="wizard-steps">
          {["Brief", "Kênh", "Cách làm", "Đường đi video", "Xác nhận"].map((label, index) => (
            <button className={step === index + 1 ? "active" : ""} key={label} onClick={() => setStep(index + 1)} type="button">
              <span>{index + 1}</span>{label}
            </button>
          ))}
        </aside>
        <SectionCard>
          <div className="creator-intro">
            <span className="eyebrow">Manual-first studio</span>
            <strong>Ảnh được tạo ở GG Lab, video được dựng trong app.</strong>
            <p>Provider, giọng đọc và CapCut là phần mở rộng. Chúng không chặn việc tạo project hoặc đi qua Story.</p>
          </div>
          {message ? <p className="error-message">{message}</p> : null}
          {step === 1 ? (
            <div className="form-grid">
              <FormField label="Project name" htmlFor="project-name" hint="Saved as the display name for this setup. Leave it blank to reuse the topic.">
                <input id="project-name" value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Optional display name" />
              </FormField>
              <FormField label="Topic" htmlFor="project-topic">
                <textarea id="project-topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
              </FormField>
              <FormField label="Video format" htmlFor="project-format">
                <select id="project-format" value={format} onChange={(event) => setFormat(event.target.value as "long" | "short")}>
                  <option value="long">YouTube Long</option>
                  <option value="short">YouTube Short</option>
                </select>
              </FormField>
              <FormField label="Language" htmlFor="project-language">
                <select id="project-language" value={languageChoice} onChange={(event) => setLanguageChoice(event.target.value)}>
                  {languageOptions.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                </select>
              </FormField>
              {languageChoice === "Custom" ? (
                <FormField label="Custom language" htmlFor="project-custom-language" hint="Type any language, locale, or dialect label you want to keep with this channel setup.">
                  <input id="project-custom-language" value={customLanguage} onChange={(event) => setCustomLanguage(event.target.value)} placeholder="e.g. Tagalog, Swahili, pt-BR" />
                </FormField>
              ) : null}
              <FormField label="Target duration" htmlFor="project-duration" hint={`Leave blank to use the default ${defaultTargetDuration(format)}.`}>
                <input id="project-duration" value={targetDuration} onChange={(event) => setTargetDuration(event.target.value)} placeholder={defaultTargetDuration(format)} />
              </FormField>
              <FormField label="FPS / Aspect ratio" htmlFor="project-fps" hint="Current domain fixtures use 30 FPS, but the setup keeps room for future per-project overrides.">
                <input id="project-fps" value={format === "long" ? "30 FPS / 16:9" : "30 FPS / 9:16"} readOnly />
              </FormField>
              <FormField label="Competitor video URL" htmlFor="competitor-url" hint="Paste the source link manually for traceability. FFmpeg is only required later when the app downloads/processes competitor media.">
                <input id="competitor-url" value={competitorUrl} onChange={(event) => setCompetitorUrl(event.target.value)} placeholder="https://..." />
              </FormField>
              <FormField label="Competitor script / analysis" htmlFor="competitor-script" hint="Paste transcript or the full analysis block. This is saved with the project for later AI analysis.">
                <textarea id="competitor-script" value={competitorScript} onChange={(event) => setCompetitorScript(event.target.value)} placeholder="Paste competitor transcript and notes here" />
              </FormField>
              <FormField label="Competitor notes" htmlFor="competitor-notes">
                <textarea id="competitor-notes" value={competitorNotes} onChange={(event) => setCompetitorNotes(event.target.value)} placeholder="Optional notes, hook observations, or angle constraints" />
              </FormField>
              <button className="button primary" type="button" onClick={() => void routeTopic()} disabled={!targetLanguage.trim() || !setupReady}>
                Chọn kênh
              </button>
              {!setupReady ? <p className="error-message">Finish setup first: {missingSetupMessage}</p> : null}
            </div>
          ) : null}
          {step === 2 ? (
            <div className="stack">
              <div className="route-result">
                <strong>{routedProfile?.name ?? "No route yet"}</strong>
                <StatusBadge tone={decision?.requiresUserConfirmation ? "warning" : "success"}>
                  {decision ? `${Math.round(decision.confidence * 100)}% confidence` : "Needs routing"}
                </StatusBadge>
                {decision ? <TagList items={decision.matchedSignals.length ? decision.matchedSignals : ["No signal matched"]} /> : null}
              </div>
              <div className="profile-grid">
                {props.profiles.map((profile) => (
                  <button
                    className={`profile-card ${selectedProfileId === profile.id || (!selectedProfileId && decision?.selectedProfileId === profile.id) ? "active" : ""}`}
                    key={profile.id}
                    type="button"
                  onClick={() => setSelectedProfileId(profile.id)}
                  >
                    <strong>{profile.name}</strong>
                    <span>{profile.niche}</span>
                    <small>{profile.language} / {profile.tone}</small>
                    <small>{profile.imageStyleModel.name}</small>
                    <small>Cần tránh: {profile.avoidList[0] ?? "Chưa có quy tắc"}</small>
                  </button>
                ))}
              </div>
              <button className="button primary" type="button" onClick={() => setStep(3)}>Tiếp tục</button>
              <SectionCard title="Nhân vật kênh" description="Dự án sản xuất đơn giản dùng nhân vật đang được duyệt theo mặc định. Bạn có thể chọn phiên bản khác ở đây.">
                {characterVersions.length ? <div className="option-grid">{characterVersions.map((version) => <Option key={version.id} title={`${version.name} v${version.version}`} detail={`${creatorStatusLabel(version.status)} / ${version.references.length} góc nhìn`} active={selectedCharacterVersion?.id === version.id} onClick={() => setSelectedCharacterVersionId(version.id)} />)}</div> : <p className="muted">Hồ sơ này chưa có bộ nhân vật được duyệt. Hãy tạo trong Hồ sơ kênh trước khi sản xuất hình ảnh.</p>}
              </SectionCard>
            </div>
          ) : null}
          {step === 3 ? (
            <div className="option-grid">
              {workflowModeOptions.map((option) => (
                <Option
                  key={option.value}
                  title={option.label}
                  detail={option.detail}
                  active={workflowMode === option.value}
                  disabled={option.value === "full_automatic"}
                  onClick={option.value === "full_automatic" ? undefined : () => setWorkflowMode(option.value)}
                />
              ))}
              <button className="button primary" type="button" onClick={() => setStep(4)}>Continue</button>
            </div>
          ) : null}
          {step === 4 ? (
            <div className="capability-grid">
              <div className="capability-card creator-path-card">
                <span className="eyebrow">Mặc định</span>
                <strong>GG Lab thủ công</strong>
                <span>Tạo prompt theo từng cảnh, tự tạo ảnh, rồi upload 001.png, 002.png...</span>
                <StatusBadge tone="success">Không cần image API</StatusBadge>
              </div>
              <div className="capability-card creator-path-card">
                <strong>FFmpeg dựng MP4</strong>
                <span>Pan, zoom, transition, voice và subtitle được ghép ở Build.</span>
                <StatusBadge tone={props.bootstrap.runtime.ffmpegAvailable ? "success" : "warning"}>{props.bootstrap.runtime.ffmpegAvailable ? "Sẵn sàng" : "Cấu hình ở Build"}</StatusBadge>
              </div>
              <div className="capability-card creator-path-card">
                <strong>Giọng đọc và nhạc</strong>
                <span>Có thể thêm sau khi duyệt asset. Không chặn việc tạo project.</span>
                <StatusBadge tone="info">Thiết lập sau</StatusBadge>
              </div>
              <button className="button primary" type="button" onClick={() => setStep(5)}>Xem lại</button>
            </div>
          ) : null}
          {step === 5 ? (
            <div className="review-list">
              <p><strong>Dự án:</strong> {projectName.trim() || topic}</p>
              <p><strong>Chủ đề:</strong> {topic}</p>
              <p><strong>Kênh:</strong> {routedProfile?.name ?? "Chưa chọn"}</p>
              <p><strong>Ngôn ngữ:</strong> {targetLanguage.trim() || "Vietnamese"}</p>
              <p><strong>Thời lượng:</strong> {effectiveTargetDuration}</p>
              <p><strong>Cách làm:</strong> {workflowModeOptions.find((option) => option.value === workflowMode)?.label ?? "Guided"}</p>
              <p><strong>Ảnh:</strong> Tạo thủ công trong GG Lab, upload và duyệt trong Assets.</p>
              <p><strong>Tài liệu tham khảo:</strong> {competitorScript.trim() ? "1 transcript sẽ được lưu để phân tích" : "Chưa có; có thể thêm sau"}</p>
              <p><StatusBadge tone="success">Sẵn sàng tạo</StatusBadge> Cấu hình provider sẽ chỉ được hỏi khi một bước thực sự cần nó.</p>
              {!setupReady ? <p className="error-message">Chưa thể tạo. {missingSetupMessage}</p> : null}
              <button className="button primary" type="button" onClick={() => void create()} disabled={saving || !topic.trim() || !targetLanguage.trim() || !setupReady}>
                {saving ? "Đang tạo..." : "Tạo dự án"}
              </button>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </>
  );
}

function Option(props: { title: string; detail: string; active?: boolean; disabled?: boolean; onClick?: (() => void) | undefined }) {
  return (
    <button className={`option-card ${props.active ? "active" : ""} ${props.disabled ? "disabled" : ""}`} type="button" onClick={props.onClick} disabled={props.disabled}>
      <strong>{props.title}</strong>
      <span>{props.detail}</span>
    </button>
  );
}
