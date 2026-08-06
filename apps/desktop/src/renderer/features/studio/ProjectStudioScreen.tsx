import { AssetsWorkspace } from "./AssetsWorkspace";
import { BuildWorkspace, type BuildWorkspaceTab } from "./BuildWorkspace";
import { ContentWorkspace, type ContentWorkspaceTab } from "./ContentWorkspace";
import { DirectorWorkspace, type DirectorWorkspaceTab } from "./DirectorWorkspace";
import type { ProjectWorkspaceProps } from "./types";

export type CreatorWorkspace = "content" | "director" | "assets" | "build";

export function ProjectStudioScreen(props: ProjectWorkspaceProps & {
  workspace: CreatorWorkspace;
  initialTab?: ContentWorkspaceTab | DirectorWorkspaceTab | BuildWorkspaceTab;
}) {
  const { workspace, initialTab: requestedTab, ...workspaceProps } = props;
  if (workspace === "content") {
    const initialTab = requestedTab as ContentWorkspaceTab | undefined;
    return initialTab ? <ContentWorkspace {...workspaceProps} initialTab={initialTab} /> : <ContentWorkspace {...workspaceProps} />;
  }
  if (workspace === "director") {
    const initialTab = requestedTab as DirectorWorkspaceTab | undefined;
    return initialTab ? <DirectorWorkspace {...workspaceProps} initialTab={initialTab} /> : <DirectorWorkspace {...workspaceProps} />;
  }
  if (workspace === "assets") return <AssetsWorkspace {...workspaceProps} />;
  const initialTab = requestedTab as BuildWorkspaceTab | undefined;
  return initialTab ? <BuildWorkspace {...workspaceProps} initialTab={initialTab} /> : <BuildWorkspace {...workspaceProps} />;
}
