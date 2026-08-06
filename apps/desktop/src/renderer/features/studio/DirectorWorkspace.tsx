import { useEffect, useState, type ReactNode } from "react";
import { Clapperboard, Images, MessageSquareText } from "lucide-react";
import { ScenesScreen, ShotsScreen, VisualsScreen } from "../director/DirectorScreens";
import { PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import type { ProjectWorkspaceProps } from "./types";

export type DirectorWorkspaceTab = "scenes" | "storyboard" | "prompts";

export function DirectorWorkspace(props: ProjectWorkspaceProps & { initialTab?: DirectorWorkspaceTab }) {
  const [tab, setTab] = useState<DirectorWorkspaceTab>(props.initialTab ?? "scenes");
  const sceneCount = props.project.scenes.length;
  const frameCount = props.project.shots.length;
  const requiredFrameCount = props.project.shots.filter((shot) => shot.visualMode !== "reuse").length;

  useEffect(() => {
    setTab(props.initialTab ?? "scenes");
  }, [props.initialTab]);

  return (
    <div className="studio-workspace studio-workspace-director">
      <PageHeader
        eyebrow="03 · Director"
        title="Chỉ đạo từng thay đổi nhìn thấy trên màn hình"
        description="Mỗi cảnh có một mục đích, một nhịp thay đổi và một storyboard frame cần thiết."
        actions={<button className="button primary" type="button" onClick={() => setTab("prompts")}>Mở Prompt Studio</button>}
      />

      <div className="studio-stat-line" aria-label="Tóm tắt storyboard">
        <Stat value={sceneCount} label="cảnh" />
        <Stat value={frameCount} label="frame storyboard" />
        <Stat value={requiredFrameCount} label="ảnh cần tạo" />
        <StatusBadge tone={props.project.scenes.length > 0 ? "success" : "warning"}>{props.project.scenes.length ? "Storyboard đã có" : "Chưa lập storyboard"}</StatusBadge>
      </div>

      <div className="studio-subnav" role="tablist" aria-label="Các phần đạo diễn">
        <WorkspaceTab active={tab === "scenes"} icon={<Clapperboard size={16} />} label="Bảng cảnh" onClick={() => setTab("scenes")} />
        <WorkspaceTab active={tab === "storyboard"} icon={<Images size={16} />} label="Storyboard" onClick={() => setTab("storyboard")} />
        <WorkspaceTab active={tab === "prompts"} icon={<MessageSquareText size={16} />} label="Prompt Studio" onClick={() => setTab("prompts")} />
      </div>

      <SectionCard className="studio-director-rail">
        <div className="scene-strip" aria-label="Danh sách cảnh">
          {props.project.scenes.length ? props.project.scenes.map((scene, index) => (
            <button className={`scene-strip-item ${tab === "scenes" && index === 0 ? "active" : ""}`} key={scene.id} type="button" onClick={() => setTab("scenes")}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{scene.id}</strong>
              <small>{scene.purpose}</small>
            </button>
          )) : <span className="studio-empty-inline">Cảnh sẽ xuất hiện sau khi kịch bản được duyệt.</span>}
        </div>
      </SectionCard>

      <div className="studio-workspace-body">
        {tab === "scenes" ? <ScenesScreen project={props.project} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} textCertification={props.textCertification} /> : null}
        {tab === "storyboard" ? <ShotsScreen project={props.project} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} /> : null}
        {tab === "prompts" ? <VisualsScreen project={props.project} selectedProfile={props.selectedProfile} textCertification={props.textCertification} imageCertification={props.imageCertification} setSelectedProject={props.setSelectedProject} setImageCertification={props.setImageCertification} startSemiAutomatic={props.startSemiAutomatic} surface="prompt-studio" showHeader={false} /> : null}
      </div>
    </div>
  );
}

function WorkspaceTab(props: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`studio-subnav-tab ${props.active ? "active" : ""}`} type="button" role="tab" aria-selected={props.active} onClick={props.onClick}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function Stat(props: { value: number; label: string }) {
  return <div className="studio-stat"><strong>{props.value}</strong><span>{props.label}</span></div>;
}
