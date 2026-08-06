import { ArrowRight, Plus } from "lucide-react";
import type { BootstrapData, ProjectSummary } from "../../types";
import { EmptyState, PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import { formatDate } from "../../utils";
import { creatorNextAction, creatorPhaseDefinitions } from "../../creatorStudioCopy";
import type { RouteId } from "../../navigation";

export function Dashboard(props: {
  bootstrap: BootstrapData;
  setRoute: (route: RouteId) => void;
  onOpenProject: (projectId: string) => Promise<void>;
}) {
  return (
    <>
      <PageHeader
        eyebrow="Home · Creator studio"
        title="Một ý tưởng. Một quy trình hoàn chỉnh."
        description="Đi từ brief đến một video YouTube có thể phát — với bạn là người duyệt những quyết định quan trọng."
        actions={
          <>
            <button className="button primary" type="button" onClick={() => props.setRoute("create")}>
              <Plus size={16} /> Tạo dự án video
            </button>
            <button className="button secondary" type="button" onClick={() => props.setRoute("projects")}>Mở dự án</button>
          </>
        }
      />
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="eyebrow">Manual-first production</span>
          <h2>Ảnh được tạo ở GG Lab. Câu chuyện, nhịp dựng và MP4 được hoàn thiện ở đây.</h2>
          <p>Không cần cấu hình image provider để bắt đầu. Chỉ chuyển sang bước tiếp theo khi quyết định hiện tại đã đủ chắc.</p>
        </div>
        <div className="home-hero-steps" aria-label="Năm bước sản xuất">
          <span><b>01</b>Brief</span><span><b>02</b>Story</span><span><b>03</b>Director</span><span><b>04</b>Assets</span><span><b>05</b>Build</span>
        </div>
      </section>
      <RecentProjects projects={props.bootstrap.projects} onOpenProject={props.onOpenProject} />
    </>
  );
}

function RecentProjects(props: { projects: ProjectSummary[]; onOpenProject: (projectId: string) => Promise<void> }) {
  return (
    <SectionCard title="Dự án gần đây" description="Mở lại nơi bạn đã dừng và tiếp tục đúng bước cần làm.">
      {props.projects.length === 0 ? (
        <EmptyState title="Chưa có dự án" detail="Tạo dự án đầu tiên để bắt đầu với brief và kịch bản." />
      ) : (
        <div className="home-project-grid">
          {props.projects.map((project) => (
            <article className="home-project-card" key={project.id}>
              <div className="home-project-card-top"><StatusBadge tone={projectCardTone(project)}>{projectCardPhase(project)}</StatusBadge><small>{formatDate(project.updatedAt)}</small></div>
              <h3>{project.projectName || project.topic}</h3>
              <p>{project.targetLanguage} · {project.format === "long" ? "YouTube Long" : "YouTube Short"} · {project.targetDuration}</p>
              <div className="home-project-next"><span>Việc tiếp theo</span><strong>{creatorNextAction(project.currentStageId, project.currentStageStatus)}</strong></div>
              <div className="home-project-progress"><span>Tiến độ sản xuất</span><strong>{project.progressPercent ?? 0}%</strong></div>
              <button className="button secondary" type="button" onClick={() => void props.onOpenProject(project.id)}>Mở dự án <ArrowRight size={15} /></button>
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function projectCardPhase(project: ProjectSummary): string {
  if (!project.currentStageId) return "Hoàn tất";
  return creatorPhaseDefinitions.find((phase) => phase.stageIds.some((stageId) => stageId === project.currentStageId))?.label ?? "Brief";
}

function projectCardTone(project: ProjectSummary): "default" | "success" | "warning" | "danger" | "info" {
  if (!project.currentStageId) return "success";
  if (project.currentStageStatus === "failed" || project.currentStageStatus === "rejected") return "danger";
  if (project.currentStageStatus === "needs_attention" || project.currentStageStatus === "blocked" || project.currentStageStatus === "stale") return "warning";
  return "info";
}
