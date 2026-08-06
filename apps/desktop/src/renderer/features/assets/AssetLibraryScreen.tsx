import type { FactoryProject } from "@lsf/domain";
import { EmptyState, PageHeader } from "../../components/ui";

export function AssetLibraryScreen(props: { selectedProject: FactoryProject | null }) {
  return (
    <>
      <PageHeader title="Thư viện asset" description="Các asset đã duyệt sẽ xuất hiện ở đây khi bạn cần xem lại hoặc dùng cho dự án khác." />
      <EmptyState
        title="Chưa có asset"
        detail={props.selectedProject ? "Dự án này chưa có ảnh được tải lên, gán hoặc duyệt." : "Mở một dự án để xem các asset đã lưu."}
      />
    </>
  );
}
