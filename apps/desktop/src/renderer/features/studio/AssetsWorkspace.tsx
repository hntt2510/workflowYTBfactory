import { ImagePlus, ShieldCheck, UploadCloud } from "lucide-react";
import { VisualsScreen } from "../director/DirectorScreens";
import { PageHeader, StatusBadge } from "../../components/ui";
import type { ProjectWorkspaceProps } from "./types";

export function AssetsWorkspace(props: ProjectWorkspaceProps) {
  const required = props.project.shots.filter((shot) => shot.visualMode !== "reuse");
  const approved = required.filter((shot) => Boolean(shot.approvedAssetId)).length;
  const missing = Math.max(required.length - approved, 0);

  return (
    <div className="studio-workspace studio-workspace-assets">
      <PageHeader
        eyebrow="04 · Assets"
        title="Tạo ảnh ở GG Lab, duyệt ảnh ngay tại đây"
        description="Copy prompt theo cảnh, upload nhiều file, sửa mapping khi cần và chỉ mở bước dựng khi mọi frame bắt buộc đã được duyệt."
        actions={<StatusBadge tone={missing === 0 && required.length > 0 ? "success" : "warning"}>{required.length ? (missing ? `Còn thiếu ${missing} ảnh` : "Đủ ảnh để dựng") : "Chưa có storyboard"}</StatusBadge>}
      />

      <div className="asset-workflow-callout">
        <div className="asset-workflow-icon"><UploadCloud size={20} /></div>
        <div>
          <strong>Quy trình thủ công, không cần image API</strong>
          <p>Tạo từng scene prompt trong GG Lab, tải các file `001`, `002`, `003` lên một lần rồi kiểm tra lại những frame bị thiếu hoặc đặt sai.</p>
        </div>
        <div className="asset-workflow-facts">
          <span><ImagePlus size={14} /> {required.length} frame bắt buộc</span>
          <span><ShieldCheck size={14} /> {approved} đã sẵn sàng</span>
        </div>
      </div>

      <div className="studio-workspace-body studio-assets-panel">
        <VisualsScreen project={props.project} textCertification={props.textCertification} imageCertification={props.imageCertification} setSelectedProject={props.setSelectedProject} setImageCertification={props.setImageCertification} startSemiAutomatic={props.startSemiAutomatic} surface="asset-intake" showHeader={false} />
      </div>
    </div>
  );
}
