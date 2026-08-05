import type { FactoryProject } from "@lsf/domain";
import { EmptyState, PageHeader } from "../../components/ui";

export function AssetLibraryScreen(props: { selectedProject: FactoryProject | null }) {
  return (
    <>
      <PageHeader title="Asset Library" description="Asset metadata tables exist, but asset save/hash/assign runtime flow is not connected." />
      <EmptyState
        title="No assets available"
        detail={props.selectedProject ? "This project has no generated, uploaded, or assigned assets yet." : "Open a project to filter assets once asset persistence is wired."}
      />
    </>
  );
}
