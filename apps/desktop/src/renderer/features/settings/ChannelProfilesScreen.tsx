import { useEffect, useState } from "react";
import type { ChannelDna, ChannelProfile, CharacterReferenceView } from "@lsf/domain";
import { channelStylePresets, characterVersionIsApproved, createDefaultChannelDna, normalizeChannelDna, recommendChannelDirection } from "@lsf/domain";
import { DataTable, DisabledAction, FormField, PageHeader, SectionCard, StatusBadge, TagList } from "../../components/ui";
import { factoryClient } from "../../services/factoryClient";
import { creatorStatusLabel } from "../../creatorStudioCopy";
import { safeRendererError } from "../../utils";

export function ChannelProfilesScreen(props: { profiles: ChannelProfile[]; onRefresh: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(props.profiles[0]?.id ?? "");
  const selected = props.profiles.find((profile) => profile.id === selectedId) ?? props.profiles[0];
  const [characterName, setCharacterName] = useState("The Channel Teacher");
  const [persona, setPersona] = useState({ role: "Educational YouTube teacher", ageRange: "30-45", appearance: "Approachable, expressive, clear silhouette", wardrobe: "Smart casual blazer", palette: "Navy, cream, warm gold", props: "", gestures: "Pointing, open hand, presenting", tone: "Clear, curious, encouraging" });
  const [invariantTraits, setInvariantTraits] = useState("Same face, hairstyle, body proportions, wardrobe palette");
  const [prohibitedChanges, setProhibitedChanges] = useState("No age shift, costume redesign, logos, or identity changes");
  const [viewCount, setViewCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const versions = selected?.characterVersions ?? [];
  const [channelDna, setChannelDna] = useState<ChannelDna>(() => normalizeChannelDna(selected?.channelDna ?? createDefaultChannelDna(selected ? { name: selected.name } : {})));
  const [dnaBusy, setDnaBusy] = useState(false);
  const [dnaMessage, setDnaMessage] = useState("");
  const [characterDraft, setCharacterDraft] = useState({ name: "", role: "", priority: "supporting" as const });
  const [assetDraft, setAssetDraft] = useState({ name: "", kind: "prop" as ChannelDna["assets"][number]["kind"], description: "", tags: "" });

  useEffect(() => {
    setChannelDna(normalizeChannelDna(selected?.channelDna ?? createDefaultChannelDna(selected ? { name: selected.name } : {})));
  }, [selectedId, selected?.id]);

  async function generateCharacterPack(): Promise<void> {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await factoryClient.generateCharacterPack({ profileId: selected.id, name: characterName.trim(), persona: { ...persona, props: persona.props.split(",").map((item) => item.trim()).filter(Boolean), gestures: persona.gestures.split(",").map((item) => item.trim()).filter(Boolean) }, invariantTraits: invariantTraits.split("\n").map((item) => item.trim()).filter(Boolean), prohibitedChanges: prohibitedChanges.split("\n").map((item) => item.trim()).filter(Boolean), viewCount });
      await props.onRefresh();
      setMessage("Da tao prompt pack local. Copy tung prompt sang GG Lab, upload du anh roi approve.");
    } catch (error) {
      setMessage(`Character generation failed: ${safeRendererError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveDna(): Promise<void> {
    if (!selected) return;
    setDnaBusy(true);
    setDnaMessage("");
    try {
      const result = await factoryClient.saveChannelDna({ profileId: selected.id, channelDna: { ...channelDna, updatedAt: new Date().toISOString() } });
      setChannelDna(normalizeChannelDna(result.channelDna));
      await props.onRefresh();
      setDnaMessage("Channel DNA đã được lưu.");
    } catch (error) {
      setDnaMessage(`Không thể lưu Channel DNA: ${safeRendererError(error)}`);
    } finally {
      setDnaBusy(false);
    }
  }

  function addAsset(): void {
    if (!assetDraft.name.trim() || !assetDraft.description.trim()) return;
    setChannelDna((current) => ({
      ...current,
      assets: [...current.assets, { id: `asset-${Date.now()}`, name: assetDraft.name.trim(), kind: assetDraft.kind, description: assetDraft.description.trim(), tags: assetDraft.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }]
    }));
    setAssetDraft({ name: "", kind: "prop", description: "", tags: "" });
  }

  function addCharacter(): void {
    if (!characterDraft.name.trim() || !characterDraft.role.trim()) return;
    setChannelDna((current) => ({ ...current, characters: [...current.characters, { id: `character-${Date.now()}`, name: characterDraft.name.trim(), role: characterDraft.role.trim(), priority: characterDraft.priority }] }));
    setCharacterDraft({ name: "", role: "", priority: "supporting" });
  }

  async function preview(versionId: string, view: CharacterReferenceView): Promise<void> {
    try {
      const result = await factoryClient.getCharacterPreviewUrl({ profileId: selected!.id, versionId, view });
      setPreviewUrls((current) => ({ ...current, [`${versionId}:${view}`]: result.url }));
    } catch (error) {
      setMessage(`Preview unavailable: ${safeRendererError(error)}`);
    }
  }

  async function retry(versionId: string, view: CharacterReferenceView): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      await factoryClient.retryCharacterReference({ profileId: selected.id, versionId, view });
      await props.onRefresh();
      setMessage(`Da tao lai prompt cho view ${view.replaceAll("_", " ")}. Hay tao va upload anh moi.`);
    } catch (error) {
      setMessage(`Character view retry failed: ${safeRendererError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function upload(versionId: string, view: CharacterReferenceView): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      await factoryClient.uploadCharacterReference({ profileId: selected.id, versionId, view });
      await props.onRefresh();
      setMessage(`Da upload anh cho view ${view.replaceAll("_", " ")}.`);
    } catch (error) {
      setMessage(`Character upload failed: ${safeRendererError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function approve(versionId: string): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      await factoryClient.approveCharacterVersion({ profileId: selected.id, versionId });
      await props.onRefresh();
      setMessage("Character version approved and set active for new projects.");
    } catch (error) {
      setMessage(`Character approval failed: ${safeRendererError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function setActive(versionId: string): Promise<void> {
    if (!selected) return;
    setBusy(true);
    try {
      await factoryClient.setActiveCharacterVersion({ profileId: selected.id, versionId });
      await props.onRefresh();
      setMessage("Đã chọn phiên bản nhân vật này cho dự án mới.");
    } catch (error) {
      setMessage(`Không thể chọn nhân vật: ${safeRendererError(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function updatePersona(field: keyof typeof persona, value: string): void {
    setPersona((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <PageHeader
        title="Hồ sơ kênh"
        description="Cấu hình nhân vật của kênh một lần. Dự án mới sẽ dùng lại phiên bản nhân vật đang được duyệt."
        actions={
          <>
            <button className="button primary" type="button" disabled={busy || !selected} onClick={() => void generateCharacterPack()}>Tạo bộ prompt GG Lab</button>
            <DisabledAction reason="Nhập/xuất hồ sơ chưa được triển khai.">Nhập JSON</DisabledAction>
          </>
        }
      />
      <div className="split-grid">
        <SectionCard title="Các hồ sơ">
          <DataTable label="Hồ sơ kênh">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Từ khoá chính</th>
                <th>Ngách</th>
                <th>Ngôn ngữ</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {props.profiles.map((profile) => (
                <tr key={profile.id} onClick={() => setSelectedId(profile.id)} className={selectedId === profile.id ? "selected-row" : ""}>
                  <td>{profile.name}</td>
                  <td>{profile.mainKeyword}</td>
                  <td>{profile.niche}</td>
                  <td>{profile.language}</td>
                  <td><StatusBadge tone="success">Đã khởi tạo</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionCard>
        {selected ? (
          <SectionCard title="Thiết lập nhân vật kênh" description="Tạo prompt cục bộ, tạo ảnh trong GG Lab, tải từng góc nhìn rồi duyệt cả bộ.">
            <div className="tabs-static">
              {["Tổng quan", "Khán giả", "Nội dung", "Giọng điệu", "Hình ảnh", "Giọng đọc", "Hashtag", "Điều cần tránh", "Tín hiệu định tuyến"].map((tab) => <span key={tab}>{tab}</span>)}
            </div>
            <div className="inspector">
              <h3>{selected.name}</h3>
              <p>{selected.targetAudience}</p>
              <p><strong>Giọng điệu:</strong> {selected.tone}</p>
              <p><strong>Hình ảnh:</strong> {selected.visualStyle}</p>
              <TagList items={selected.routerSignals} limit={10} />
              <TagList items={selected.coreHashtags.concat(selected.secondaryHashtags)} limit={8} />
            </div>
            <SectionCard title="Channel DNA" description="Một nguồn sự thật cho nội dung, style, nhân vật, asset và mặc định dựng video.">
              <div className="form-grid">
                <FormField label="Visual style" htmlFor="channel-style"><select id="channel-style" value={channelDna.visualStyle.styleId} onChange={(event) => { const styleId = event.target.value as ChannelDna["visualStyle"]["styleId"]; const preset = channelStylePresets.find((item) => item.id === styleId)!; setChannelDna((current) => ({ ...current, visualStyle: { ...current.visualStyle, styleId, name: preset.name, description: preset.description, sceneGrammar: [...preset.sceneGrammar], motionGrammar: [...preset.motionGrammar], palette: [...preset.defaultPalette] }, contentDirection: { ...current.contentDirection, pillars: [...preset.defaultPillars], defaultAngles: [...preset.contentGrammar] } })); }} >{channelStylePresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></FormField>
                <FormField label="Channel promise" htmlFor="channel-promise"><textarea id="channel-promise" value={channelDna.identity.channelPromise} onChange={(event) => setChannelDna((current) => ({ ...current, identity: { ...current.identity, channelPromise: event.target.value } }))} /></FormField>
                <FormField label="Audience" htmlFor="channel-audience"><textarea id="channel-audience" value={channelDna.identity.audience} onChange={(event) => setChannelDna((current) => ({ ...current, identity: { ...current.identity, audience: event.target.value } }))} /></FormField>
                <FormField label="Content pillars (one per line)" htmlFor="channel-pillars"><textarea id="channel-pillars" value={channelDna.contentDirection.pillars.join("\n")} onChange={(event) => setChannelDna((current) => ({ ...current, contentDirection: { ...current.contentDirection, pillars: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) } }))} /></FormField>
                <FormField label="Default angles (one per line)" htmlFor="channel-angles"><textarea id="channel-angles" value={channelDna.contentDirection.defaultAngles.join("\n")} onChange={(event) => setChannelDna((current) => ({ ...current, contentDirection: { ...current.contentDirection, defaultAngles: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) } }))} /></FormField>
                <FormField label="Default motion" htmlFor="channel-motion"><select id="channel-motion" value={channelDna.productionDefaults.defaultMotion} onChange={(event) => setChannelDna((current) => ({ ...current, productionDefaults: { ...current.productionDefaults, defaultMotion: event.target.value as ChannelDna["productionDefaults"]["defaultMotion"] } }))}><option value="zoom_in">Zoom in</option><option value="zoom_out">Zoom out</option><option value="slide_up">Slide up</option><option value="dissolve">Dissolve</option><option value="none">None</option></select></FormField>
                <FormField label="Visual beat (seconds)" htmlFor="channel-beat"><input id="channel-beat" type="number" min="1" max="30" value={channelDna.productionDefaults.visualBeatSeconds} onChange={(event) => setChannelDna((current) => ({ ...current, productionDefaults: { ...current.productionDefaults, visualBeatSeconds: Number(event.target.value) || 3 } }))} /></FormField>
              </div>
              <div className="route-result"><strong>{recommendChannelDirection({ topic: selected.mainKeyword, styleId: channelDna.visualStyle.styleId, contentDirection: channelDna.contentDirection }).reason}</strong><TagList items={channelDna.visualStyle.sceneGrammar} /></div>
              <div className="profile-grid">
                {channelDna.characters.map((character) => <div className="profile-card" key={character.id}><strong>{character.name}</strong><span>{character.priority} · {character.role}</span></div>)}
                {channelDna.assets.map((asset) => <div className="profile-card" key={asset.id}><strong>{asset.name}</strong><span>{asset.kind} · {asset.description}</span><small>{asset.tags.join(", ")}</small></div>)}
              </div>
              <div className="form-grid">
                <FormField label="Character name" htmlFor="channel-character-name"><input id="channel-character-name" value={characterDraft.name} onChange={(event) => setCharacterDraft((current) => ({ ...current, name: event.target.value }))} /></FormField>
                <FormField label="Character role" htmlFor="channel-character-role"><input id="channel-character-role" value={characterDraft.role} onChange={(event) => setCharacterDraft((current) => ({ ...current, role: event.target.value }))} /></FormField>
                <FormField label="Character priority" htmlFor="channel-character-priority"><select id="channel-character-priority" value={characterDraft.priority} onChange={(event) => setCharacterDraft((current) => ({ ...current, priority: event.target.value as typeof current.priority }))}><option value="primary">Primary</option><option value="supporting">Supporting</option></select></FormField>
              </div>
              <div className="form-grid">
                <FormField label="Asset name" htmlFor="channel-asset-name"><input id="channel-asset-name" value={assetDraft.name} onChange={(event) => setAssetDraft((current) => ({ ...current, name: event.target.value }))} /></FormField>
                <FormField label="Asset kind" htmlFor="channel-asset-kind"><select id="channel-asset-kind" value={assetDraft.kind} onChange={(event) => setAssetDraft((current) => ({ ...current, kind: event.target.value as typeof current.kind }))}><option value="prop">Prop</option><option value="background">Background</option><option value="diagram">Diagram</option><option value="sound">Sound</option><option value="overlay">Overlay</option></select></FormField>
                <FormField label="Asset description" htmlFor="channel-asset-description"><input id="channel-asset-description" value={assetDraft.description} onChange={(event) => setAssetDraft((current) => ({ ...current, description: event.target.value }))} /></FormField>
                <FormField label="Tags (comma separated)" htmlFor="channel-asset-tags"><input id="channel-asset-tags" value={assetDraft.tags} onChange={(event) => setAssetDraft((current) => ({ ...current, tags: event.target.value }))} /></FormField>
              </div>
              <div className="button-row"><button className="button secondary compact" type="button" onClick={addCharacter}>Thêm character</button><button className="button secondary compact" type="button" onClick={addAsset}>Thêm asset vào library</button><button className="button primary compact" type="button" disabled={dnaBusy} onClick={() => void saveDna()}>{dnaBusy ? "Đang lưu..." : "Lưu Channel DNA"}</button></div>
              {dnaMessage ? <p className={dnaMessage.includes("Không thể") ? "error-message" : "safe-message"}>{dnaMessage}</p> : null}
            </SectionCard>
            <div className="form-grid">
              <FormField label="Tên nhân vật" htmlFor="character-name"><input id="character-name" value={characterName} onChange={(event) => setCharacterName(event.target.value)} /></FormField>
              <FormField label="Vai trò" htmlFor="character-role"><input id="character-role" value={persona.role} onChange={(event) => updatePersona("role", event.target.value)} /></FormField>
              <FormField label="Độ tuổi" htmlFor="character-age"><input id="character-age" value={persona.ageRange} onChange={(event) => updatePersona("ageRange", event.target.value)} /></FormField>
              <FormField label="Ngoại hình" htmlFor="character-appearance"><textarea id="character-appearance" value={persona.appearance} onChange={(event) => updatePersona("appearance", event.target.value)} /></FormField>
              <FormField label="Trang phục" htmlFor="character-wardrobe"><input id="character-wardrobe" value={persona.wardrobe} onChange={(event) => updatePersona("wardrobe", event.target.value)} /></FormField>
              <FormField label="Bảng màu" htmlFor="character-palette"><input id="character-palette" value={persona.palette} onChange={(event) => updatePersona("palette", event.target.value)} /></FormField>
              <FormField label="Đạo cụ (cách nhau bằng dấu phẩy)" htmlFor="character-props"><input id="character-props" value={persona.props} onChange={(event) => updatePersona("props", event.target.value)} /></FormField>
              <FormField label="Cử chỉ (cách nhau bằng dấu phẩy)" htmlFor="character-gestures"><input id="character-gestures" value={persona.gestures} onChange={(event) => updatePersona("gestures", event.target.value)} /></FormField>
              <FormField label="Giọng điệu" htmlFor="character-tone"><input id="character-tone" value={persona.tone} onChange={(event) => updatePersona("tone", event.target.value)} /></FormField>
              <FormField label="Số góc nhìn bộ nhân vật" htmlFor="character-view-count"><select id="character-view-count" value={viewCount} onChange={(event) => setViewCount(Number(event.target.value))}><option value={4}>4 góc nhìn</option><option value={5}>5 góc nhìn</option><option value={6}>6 góc nhìn</option></select></FormField>
              <FormField label="Đặc điểm bất biến" htmlFor="character-invariants"><textarea id="character-invariants" value={invariantTraits} onChange={(event) => setInvariantTraits(event.target.value)} /></FormField>
              <FormField label="Thay đổi bị cấm" htmlFor="character-prohibited"><textarea id="character-prohibited" value={prohibitedChanges} onChange={(event) => setProhibitedChanges(event.target.value)} /></FormField>
            </div>
            {versions.map((version) => {
              const uploadReady = version.references.length >= 4 && version.references.every((reference) => Boolean(reference.relativeFilePath && reference.sha256));
              return <SectionCard key={version.id} title={`${version.name} v${version.version}`} description={`${characterVersionIsApproved(version) ? creatorStatusLabel("approved") : creatorStatusLabel(version.status)}${selected.activeCharacterVersionId === version.id ? " / active" : ""}`}>
                <div className="profile-grid">{version.references.map((reference) => {
                  const key = `${version.id}:${reference.view}`;
                  return <div className="profile-card" key={reference.id}>
                    <strong>{reference.view.replaceAll("_", " ")}</strong>
                    <small>{reference.relativeFilePath ? "đã tải ảnh / chờ duyệt" : "prompt sẵn sàng / thiếu ảnh"}</small>
                    {previewUrls[key] ? <img className="character-preview" src={previewUrls[key]} alt={`${version.name} ${reference.view}`} /> : reference.relativeFilePath ? <button className="button compact" type="button" onClick={() => void preview(version.id, reference.view)}>Xem trước</button> : <p className="muted">Chưa tải ảnh.</p>}
                    {reference.promptText ? <><textarea className="prompt-preview" readOnly value={reference.promptText} aria-label={`Prompt ${reference.view}`} /><button className="button compact" type="button" onClick={() => void navigator.clipboard.writeText(reference.promptText ?? "")}>Copy prompt</button></> : null}
                    <div className="button-row"><button className="button primary compact" type="button" disabled={busy} onClick={() => void upload(version.id, reference.view)}>Tải lên / thay thế</button><button className="button secondary compact" type="button" disabled={busy} onClick={() => void retry(version.id, reference.view)}>Tạo lại prompt</button></div>
                  </div>;
                })}</div>
                {!characterVersionIsApproved(version) ? <><button className="button primary compact" type="button" disabled={busy || !uploadReady} onClick={() => void approve(version.id)}>Duyệt / khoá phiên bản</button>{!uploadReady ? <small className="muted">Hãy tải đủ mọi góc nhìn trước khi duyệt.</small> : null}</> : selected.activeCharacterVersionId === version.id ? <StatusBadge tone="success">Đã duyệt và đang dùng</StatusBadge> : <div className="button-row"><StatusBadge tone="success">Đã duyệt</StatusBadge><button className="button secondary compact" type="button" disabled={busy} onClick={() => void setActive(version.id)}>Dùng cho dự án mới</button></div>}
              </SectionCard>;
            })}
            {message ? <p className={message.includes("failed") || message.includes("unavailable") ? "error-message" : "safe-message"}>{message}</p> : null}
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}
