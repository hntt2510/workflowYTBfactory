import type { BootstrapData, ProviderPresence } from "../../types";
import type { RouteId } from "../../navigation";
import { DisabledAction, PageHeader, SectionCard, SettingsList } from "../../components/ui";

export function SettingsScreen(props: { bootstrap: BootstrapData; presence: ProviderPresence; setRoute: (route: RouteId) => void }) {
  const runtime = props.bootstrap.runtime;
  return (
    <>
      <PageHeader title="Cài đặt" description="Cài đặt workspace cục bộ. Thông tin xác thực chỉ được lưu qua Electron và keychain hệ điều hành." />
      <div className="settings-grid">
        <SectionCard title="Chung"><SettingsList items={[["Chế độ", "Ứng dụng cục bộ"], ["Lưu dự án", "SQLite"], ["Đồng bộ đám mây", "Chưa khả dụng"]]} /></SectionCard>
        <SectionCard title="AI / Text Provider" description="Cockpit là text provider đang dùng cho quy trình tiền sản xuất.">
          <SettingsList items={[["Provider", "Cockpit"], ["Trạng thái", props.presence.hasCredential ? "Đã cấu hình API key" : "Chưa cấu hình"]]} />
          <button className="button primary" type="button" onClick={() => props.setRoute("providers")}>Mở cài đặt Text Provider</button>
        </SectionCard>
        <SectionCard title="Workspace">
          <SettingsList items={[["Vị trí workspace", props.bootstrap.workspaceRoot], ["Vị trí cơ sở dữ liệu", props.bootstrap.databasePath], ["Vị trí asset", "Chưa cấu hình"], ["Vị trí log", "Chưa cấu hình"]]} />
          <DisabledAction reason="IPC mở thư mục chưa được triển khai.">Mở thư mục</DisabledAction>
        </SectionCard>
        <SectionCard title="Giao diện"><SettingsList items={[["Chủ đề", "Chỉ nền tối"], ["Mật độ", "Thoải mái"], ["Thanh bên", "Mở rộng / thu gọn"]]} /></SectionCard>
        <SectionCard title="Sản xuất"><SettingsList items={[["Chính sách duyệt", "Có hướng dẫn"], ["Tạo nội dung có phí", "Chỉ chạy khi bạn yêu cầu; không tự động"]]} /></SectionCard>
        <SectionCard title="Quy trình nâng cao" description="Màn hình legacy vẫn hiện trong sidebar audit để bạn đánh giá trước khi quyết định dọn dẹp.">
          <button className="button secondary" type="button" onClick={() => props.setRoute("new-project")}>Mở trình hướng dẫn nâng cao</button>
        </SectionCard>
        <SectionCard title="CapCut — Legacy / không dùng trong quy trình tiền sản xuất hiện tại"><SettingsList items={[["Trạng thái cài đặt", runtime.capcutInstalled ? "Đã phát hiện" : "Chưa khả dụng"], ["Đường dẫn cài đặt", runtime.capcutInstallPath], ["Trạng thái Python", runtime.pythonExists ? runtime.pythonVersion : "Cần thiết lập"], ["Tương thích", runtime.capcutCompatibility]]} /></SectionCard>
        <SectionCard title="FFmpeg — Legacy / không dùng trong quy trình tiền sản xuất hiện tại"><SettingsList items={[["Trạng thái", runtime.ffmpegAvailable ? "Đã phát hiện" : "Cần thiết lập"], ["Đường dẫn", runtime.ffmpegPath], ["Phiên bản", runtime.ffmpegStatus]]} /></SectionCard>
        <SectionCard title="Bảo mật"><SettingsList items={[["Lưu thông tin xác thực", "Tham chiếu keychain hệ điều hành"], ["API key ở renderer", "Chỉ ghi, không đọc lại"], ["Che thông tin trong log", "Đã bật"]]} /></SectionCard>
        <SectionCard title="Chẩn đoán"><SettingsList items={[["CodeGraph", "Chỉ dùng cho phát triển"], ["Ảnh chụp hàng đợi", `${props.bootstrap.queue.jobs.length} tác vụ`], ["Số dự án", `${props.bootstrap.projects.length}`]]} /></SectionCard>
      </div>
    </>
  );
}

export function DiagnosticsScreen(props: { bootstrap: BootstrapData; presence: ProviderPresence }) {
  const diagnostics = { workspaceRoot: props.bootstrap.workspaceRoot, databasePath: props.bootstrap.databasePath, projectCount: props.bootstrap.projects.length, queueJobs: props.bootstrap.queue.jobs.length, providerStatus: props.presence.hasCredential ? "credential_saved" : "not_configured" };
  return <><PageHeader title="Chẩn đoán" description="Trạng thái cục bộ đã lược bỏ thông tin nhạy cảm để gỡ lỗi." /><SectionCard><pre className="diagnostics">{JSON.stringify(diagnostics, null, 2)}</pre></SectionCard></>;
}
