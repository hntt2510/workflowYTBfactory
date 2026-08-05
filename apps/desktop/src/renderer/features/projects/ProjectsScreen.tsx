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
        title="Projects"
        description="Create, open, and manage SQLite-backed local projects."
        actions={<button className="button primary" type="button" onClick={() => props.setRoute("create")}><Plus size={16} /> Create Video Project</button>}
      />
      <SectionCard>
        {props.projectSummaries.length === 0 ? (
          <EmptyState title="No persisted projects" detail="The project list is empty because no SQLite-backed project has been created yet." />
        ) : (
          <DataTable label="Projects">
            <thead>
              <tr>
                <th>Name</th>
                <th>Profile</th>
                <th>Format</th>
                <th>Language</th>
                <th>Target duration</th>
                <th>Updated</th>
                <th>Status</th>
                <th>Actions</th>
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
                  <td><StatusBadge tone="success">Persisted</StatusBadge></td>
                  <td className="row-actions">
                    <button className="button compact" type="button" onClick={() => void props.onOpenProject(project.id)}>Open</button>
                    <button className="button danger compact" type="button" onClick={() => void props.onDeleteProject(project.id)}><Trash2 size={14} /> Delete</button>
                    <DisabledAction reason="Project duplication is not implemented.">Duplicate</DisabledAction>
                    <DisabledAction reason="Project export is not implemented.">Export</DisabledAction>
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
