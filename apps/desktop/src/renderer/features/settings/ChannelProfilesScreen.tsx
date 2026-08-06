import { useState } from "react";
import type { ChannelProfile, CharacterReferenceView } from "@lsf/domain";
import { characterVersionIsApproved } from "@lsf/domain";
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
              return <SectionCard key={version.id} title={`${version.name} v${version.version}`} description={`${characterVersionIsApproved(version) ? "approved" : creatorStatusLabel(version.status)}${selected.activeCharacterVersionId === version.id ? " / active" : ""}`}>
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
