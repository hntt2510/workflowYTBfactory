import { Plus, Trash2 } from "lucide-react";
import type { ProjectSummary } from "../../types";
import { DataTable, DisabledAction, EmptyState, PageHeader, SectionCard, StatusBadge } from "../../components/ui";
import { formatDate } from "../../utils";
import type { RouteId } from "../../navigation";

export function ProjectsScreen(props: {
  projectSummaries: ProjectSummary[];
  onOpenProject: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  setRoute: (route: RouteId) => void;
}) {
  return (
    <>
      <PageHeader
        title="Dự án"
        description="Tạo, mở và quản lý các dự án cục bộ được lưu bằng SQLite."
        actions={<button className="button primary" type="button" onClick={() => props.setRoute("create")}><Plus size={16} /> Tạo dự án video</button>}
      />
      <SectionCard>
        {props.projectSummaries.length === 0 ? (
          <EmptyState title="Chưa có dự án đã lưu" detail="Danh sách trống vì chưa có dự án nào được tạo và lưu bằng SQLite." />
        ) : (
          <DataTable label="Dự án">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Hồ sơ</th>
                <th>Định dạng</th>
                <th>Ngôn ngữ</th>
                <th>Thời lượng mục tiêu</th>
                <th>Cập nhật</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {props.projectSummaries.map((project) => (
                <tr key={project.id}>
                  <td>{project.projectName || project.topic}</td>
                  <td>{project.profileId}</td>
                  <td>{project.format === "long" ? "YouTube Long" : "YouTube Short"}</td>
                  <td>{project.targetLanguage}</td>
                  <td>{project.targetDuration}</td>
                  <td>{formatDate(project.updatedAt)}</td>
                    <td><StatusBadge tone="success">Đã lưu</StatusBadge></td>
                  <td className="row-actions">
                    <button className="button compact" type="button" onClick={() => void props.onOpenProject(project.id)}>Mở</button>
                    <button className="button danger compact" type="button" onClick={() => void props.onDeleteProject(project.id)}><Trash2 size={14} /> Xoá</button>
                    <DisabledAction reason="Nhân bản dự án chưa được triển khai.">Nhân bản</DisabledAction>
                    <DisabledAction reason="Xuất dự án chưa được triển khai.">Xuất</DisabledAction>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </SectionCard>
    </>
  );
}
