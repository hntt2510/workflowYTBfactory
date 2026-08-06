import { useEffect, useState, type ReactNode } from "react";
import { FileText, Lightbulb, Link2, NotebookPen } from "lucide-react";
import { IdeaLabScreen, ReferenceIntakeScreen, ScriptScreen } from "../story/StoryScreens";
import { ProjectOverview } from "../projects/ProjectOverview";
import { PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import type { ProjectWorkspaceProps } from "./types";

export type ContentWorkspaceTab = "brief" | "story" | "ideas" | "references";

export function ContentWorkspace(props: ProjectWorkspaceProps & { initialTab?: ContentWorkspaceTab }) {
  const [tab, setTab] = useState<ContentWorkspaceTab>(props.initialTab ?? "brief");
  const project = props.project;

  useEffect(() => {
    setTab(props.initialTab ?? "brief");
  }, [props.initialTab]);

  return (
    <div className="studio-workspace studio-workspace-content">
      <PageHeader
        eyebrow={tab === "brief" ? "01 · Brief" : "02 · Story"}
        title="Biến một ý tưởng thành câu chuyện có thể dựng"
        description="Chốt brief, phát triển ý tưởng, viết lời dẫn và duyệt những gì sẽ đi vào storyboard."
        actions={<StatusBadge tone={project.stages.find((stage) => stage.id === "script")?.status === "approved" ? "success" : "info"}>{project.scriptSections.length ? `${project.scriptSections.length} đoạn lời dẫn` : "Chưa có lời dẫn"}</StatusBadge>}
      />

      <div className="studio-subnav" role="tablist" aria-label="Các phần nội dung">
        <WorkspaceTab active={tab === "brief"} icon={<NotebookPen size={16} />} label="Brief" onClick={() => setTab("brief")} />
        <WorkspaceTab active={tab === "story"} icon={<FileText size={16} />} label="Kịch bản" onClick={() => setTab("story")} />
        <WorkspaceTab active={tab === "ideas"} icon={<Lightbulb size={16} />} label="Ý tưởng & nghiên cứu" onClick={() => setTab("ideas")} />
        <WorkspaceTab active={tab === "references"} icon={<Link2 size={16} />} label="Tài liệu tham khảo" onClick={() => setTab("references")} />
      </div>

      <SectionCard className="studio-context-bar">
        <div>
          <span className="studio-kicker">Đang làm việc trên</span>
          <strong>{project.setup.projectName || project.topic}</strong>
        </div>
        <div className="studio-context-meta">
          <span>{project.targetLanguage}</span>
          <span>{project.setup.targetDuration}</span>
          <span>{project.format === "short" ? "Short" : "Long"}</span>
        </div>
      </SectionCard>

      <div className="studio-workspace-body">
        {tab === "brief" ? (
          <ProjectOverview
            selectedProject={project}
            selectedProfile={props.selectedProfile}
            setRoute={props.setRoute}
            startSemiAutomatic={props.startSemiAutomatic}
            textCertification={props.textCertification}
            imageCertification={props.imageCertification}
            localTtsSettings={props.localTtsSettings}
            semiAutomaticProgress={props.semiAutomaticProgress}
            semiAutomaticRunning={props.semiAutomaticRunning}
            semiAutomaticError={props.semiAutomaticError}
          />
        ) : null}
        {tab === "story" ? <ScriptScreen project={project} selectedProfile={props.selectedProfile} setSelectedProject={props.setSelectedProject} textCertification={props.textCertification} /> : null}
        {tab === "ideas" ? <IdeaLabScreen project={project} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} textCertification={props.textCertification} startSemiAutomatic={props.startSemiAutomatic} /> : null}
        {tab === "references" ? <ReferenceIntakeScreen project={project} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} /> : null}
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
