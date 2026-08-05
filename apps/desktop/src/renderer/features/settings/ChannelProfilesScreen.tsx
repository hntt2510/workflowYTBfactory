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

  function updatePersona(field: keyof typeof persona, value: string): void {
    setPersona((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <PageHeader
        title="Channel Profiles"
        description="Configure the teacher identity once per channel. New character-first projects reuse the active approved version."
        actions={
          <>
            <button className="button primary" type="button" disabled={busy || !selected} onClick={() => void generateCharacterPack()}>Create GG Lab Prompt Pack</button>
            <DisabledAction reason="Profile import/export is not implemented.">Import JSON</DisabledAction>
          </>
        }
      />
      <div className="split-grid">
        <SectionCard title="Profiles">
          <DataTable label="Channel profiles">
            <thead>
              <tr>
                <th>Name</th>
                <th>Main keyword</th>
                <th>Niche</th>
                <th>Language</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {props.profiles.map((profile) => (
                <tr key={profile.id} onClick={() => setSelectedId(profile.id)} className={selectedId === profile.id ? "selected-row" : ""}>
                  <td>{profile.name}</td>
                  <td>{profile.mainKeyword}</td>
                  <td>{profile.niche}</td>
                  <td>{profile.language}</td>
                  <td><StatusBadge tone="success">Seeded</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionCard>
        {selected ? (
          <SectionCard title="Teacher character setup" description="Tao prompt local, tu gen anh trong GG Lab, upload tung view roi duyet ca pack.">
            <div className="tabs-static">
              {["General", "Audience", "Content", "Tone", "Visuals", "Voice", "Hashtags", "Avoid Rules", "Router Signals"].map((tab) => <span key={tab}>{tab}</span>)}
            </div>
            <div className="inspector">
              <h3>{selected.name}</h3>
              <p>{selected.targetAudience}</p>
              <p><strong>Tone:</strong> {selected.tone}</p>
              <p><strong>Visuals:</strong> {selected.visualStyle}</p>
              <TagList items={selected.routerSignals} limit={10} />
              <TagList items={selected.coreHashtags.concat(selected.secondaryHashtags)} limit={8} />
            </div>
            <div className="form-grid">
              <FormField label="Teacher name" htmlFor="character-name"><input id="character-name" value={characterName} onChange={(event) => setCharacterName(event.target.value)} /></FormField>
              <FormField label="Role" htmlFor="character-role"><input id="character-role" value={persona.role} onChange={(event) => updatePersona("role", event.target.value)} /></FormField>
              <FormField label="Age range" htmlFor="character-age"><input id="character-age" value={persona.ageRange} onChange={(event) => updatePersona("ageRange", event.target.value)} /></FormField>
              <FormField label="Appearance" htmlFor="character-appearance"><textarea id="character-appearance" value={persona.appearance} onChange={(event) => updatePersona("appearance", event.target.value)} /></FormField>
              <FormField label="Wardrobe" htmlFor="character-wardrobe"><input id="character-wardrobe" value={persona.wardrobe} onChange={(event) => updatePersona("wardrobe", event.target.value)} /></FormField>
              <FormField label="Palette" htmlFor="character-palette"><input id="character-palette" value={persona.palette} onChange={(event) => updatePersona("palette", event.target.value)} /></FormField>
              <FormField label="Props (comma separated)" htmlFor="character-props"><input id="character-props" value={persona.props} onChange={(event) => updatePersona("props", event.target.value)} /></FormField>
              <FormField label="Gestures (comma separated)" htmlFor="character-gestures"><input id="character-gestures" value={persona.gestures} onChange={(event) => updatePersona("gestures", event.target.value)} /></FormField>
              <FormField label="Tone" htmlFor="character-tone"><input id="character-tone" value={persona.tone} onChange={(event) => updatePersona("tone", event.target.value)} /></FormField>
              <FormField label="Identity pack views" htmlFor="character-view-count"><select id="character-view-count" value={viewCount} onChange={(event) => setViewCount(Number(event.target.value))}><option value={4}>4 views</option><option value={5}>5 views</option><option value={6}>6 views</option></select></FormField>
              <FormField label="Invariant traits" htmlFor="character-invariants"><textarea id="character-invariants" value={invariantTraits} onChange={(event) => setInvariantTraits(event.target.value)} /></FormField>
              <FormField label="Prohibited changes" htmlFor="character-prohibited"><textarea id="character-prohibited" value={prohibitedChanges} onChange={(event) => setProhibitedChanges(event.target.value)} /></FormField>
            </div>
            {versions.map((version) => {
              const uploadReady = version.references.length >= 4 && version.references.every((reference) => Boolean(reference.relativeFilePath && reference.sha256));
              return <SectionCard key={version.id} title={`${version.name} v${version.version}`} description={`${characterVersionIsApproved(version) ? "approved" : creatorStatusLabel(version.status)}${selected.activeCharacterVersionId === version.id ? " / active" : ""}`}>
                <div className="profile-grid">{version.references.map((reference) => {
                  const key = `${version.id}:${reference.view}`;
                  return <div className="profile-card" key={reference.id}>
                    <strong>{reference.view.replaceAll("_", " ")}</strong>
                    <small>{reference.relativeFilePath ? "image uploaded / review pending" : "prompt ready / image missing"}</small>
                    {previewUrls[key] ? <img className="character-preview" src={previewUrls[key]} alt={`${version.name} ${reference.view}`} /> : reference.relativeFilePath ? <button className="button compact" type="button" onClick={() => void preview(version.id, reference.view)}>Preview</button> : <p className="muted">No image uploaded.</p>}
                    {reference.promptText ? <><textarea className="prompt-preview" readOnly value={reference.promptText} aria-label={`Prompt ${reference.view}`} /><button className="button compact" type="button" onClick={() => void navigator.clipboard.writeText(reference.promptText ?? "")}>Copy prompt</button></> : null}
                    <div className="button-row"><button className="button primary compact" type="button" disabled={busy} onClick={() => void upload(version.id, reference.view)}>Upload / replace</button><button className="button secondary compact" type="button" disabled={busy} onClick={() => void retry(version.id, reference.view)}>Regenerate prompt</button></div>
                  </div>;
                })}</div>
                {!characterVersionIsApproved(version) ? <><button className="button primary compact" type="button" disabled={busy || !uploadReady} onClick={() => void approve(version.id)}>Approve / Lock Version</button>{!uploadReady ? <small className="muted">Upload every identity view before approval.</small> : null}</> : <StatusBadge tone="success">Approved and active</StatusBadge>}
              </SectionCard>;
            })}
            {message ? <p className={message.includes("failed") || message.includes("unavailable") ? "error-message" : "safe-message"}>{message}</p> : null}
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}
