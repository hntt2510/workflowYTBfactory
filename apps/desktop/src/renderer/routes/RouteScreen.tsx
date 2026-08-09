import type { ChannelProfile, FactoryProject } from "@lsf/domain";
import { EmptyState } from "../components/ui";
import type {
  BootstrapData,
  ImageModelCertificationResponse,
  LocalTtsSettings,
  ProjectSummary,
  ProviderCredentialSettings,
  ProviderPresence,
  TextModelCertificationResponse
} from "../types";
import type { RouteId } from "../navigation";
import type { SemiAutomaticChain, SemiAutomaticProgress } from "../semiAutomaticWorkflow";
import { ScenesScreen, ShotsScreen, VisualsScreen } from "../features/director/DirectorScreens";
import { Dashboard } from "../features/home/HomeScreens";
import { AssetLibraryScreen } from "../features/assets/AssetLibraryScreen";
import { ProjectOverview } from "../features/projects/ProjectOverview";
import { CheckpointWorkspace } from "../features/projects/CheckpointWorkspace";
import { NewProjectWizard, SimpleCreateScreen, ttsLanguageCode } from "../features/projects/CreateScreens";
import { AdvancedPipelineScreen, ProductionScriptPanel, ProductionScreen, SceneReviewScreen } from "../features/production/ProductionScreens";
import { ProjectsScreen } from "../features/projects/ProjectsScreen";
import { QueueScreen } from "../features/queue/QueueScreen";
import { VoiceScreen } from "../features/voice/VoiceScreen";
import { ChannelProfilesScreen } from "../features/settings/ChannelProfilesScreen";
import { DiagnosticsScreen, SettingsScreen } from "../features/settings/SettingsScreens";
import { ProvidersScreen } from "../features/settings/ProvidersScreen";
import { CompetitorDnaScreen, IdeaLabScreen, ReferenceIntakeScreen, ScriptScreen } from "../features/story/StoryScreens";
import { ExportScreen, QaScreen, TimelineScreen } from "../features/build/BuildScreens";
import { FinalPreviewScreen } from "../features/build/FinalPreviewScreen";
import { ProjectStudioScreen } from "../features/studio/ProjectStudioScreen";

export interface RouteScreenProps {
  route: RouteId;
  setRoute: (route: RouteId) => void;
  bootstrap: BootstrapData;
  providerPresence: ProviderPresence;
  stockPresence: ProviderPresence;
  providerSettings: ProviderCredentialSettings | null;
  textCertification: TextModelCertificationResponse;
  imageCertification: ImageModelCertificationResponse;
  localTtsSettings: LocalTtsSettings | null;
  selectedProject: FactoryProject | null;
  selectedProfile: ChannelProfile | undefined;
  profiles: ChannelProfile[];
  projectSummaries: ProjectSummary[];
  onOpenProject: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onCreateProject: (input: {
    topic: string;
    format: "long" | "short";
    targetLanguage: string;
    selectedProfileId?: string;
    targetDuration?: string;
    projectName?: string;
    workflowMode?: "guided" | "semi_automatic" | "full_automatic";
    visualWorkflow?: "legacy" | "character_first";
    characterVersionId?: string;
    inputMode?: "topic" | "existing_script" | "reference";
    aspectRatio?: "16:9" | "9:16" | "1:1";
    visualStyle?: "vox-documentary";
    voiceId?: string;
    outputResolution?: "1080p" | "720p";
    sourceScript?: string;
    referenceUrl?: string;
    competitorReference?: {
      sourceUrl?: string;
      pastedTranscript: string;
      notes?: string;
    };
  }) => Promise<void>;
  onRefresh: () => Promise<void>;
  setSelectedProject: (project: FactoryProject | null) => void;
  setProviderPresence: (presence: ProviderPresence) => void;
  setStockPresence: (presence: ProviderPresence) => void;
  setProviderSettings: (settings: ProviderCredentialSettings | null) => void;
  setTextCertification: (certification: TextModelCertificationResponse) => void;
  setImageCertification: (certification: ImageModelCertificationResponse) => void;
  startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void>;
  semiAutomaticProgress: SemiAutomaticProgress | null;
  semiAutomaticRunning: boolean;
  semiAutomaticError: string | null;
}

export function RouteScreen(props: RouteScreenProps) {
  if (props.route === "dashboard") return <Dashboard {...props} />;
  if (props.route === "projects") return <ProjectsScreen {...props} />;
  if (props.route === "create" || props.route === "new-project") return props.route === "create" ? <SimpleCreateScreen {...props} /> : <NewProjectWizard {...props} />;
  if (props.route === "channel-profiles") return <ChannelProfilesScreen profiles={props.profiles} onRefresh={props.onRefresh} />;
  if (props.route === "production-queue") return <QueueScreen queue={props.bootstrap.queue} selectedProject={props.selectedProject} onRunDemo={props.onRefresh} />;
  if (props.route === "asset-library") return <AssetLibraryScreen selectedProject={props.selectedProject} />;
  if (props.route === "providers") return <ProvidersScreen presence={props.providerPresence} settings={props.providerSettings} textCertification={props.textCertification} setTextCertification={props.setTextCertification} setPresence={props.setProviderPresence} setSettings={props.setProviderSettings} onRefresh={props.onRefresh} />;
  if (props.route === "settings") return <SettingsScreen bootstrap={props.bootstrap} presence={props.providerPresence} setRoute={props.setRoute} />;
  if (props.route === "diagnostics") return <DiagnosticsScreen bootstrap={props.bootstrap} presence={props.providerPresence} />;
  if (!props.selectedProject) {
    return (
      <EmptyState
        title="Mở một dự án để xem quy trình"
        detail="Các màn hình sản xuất dùng dữ liệu dự án đã lưu. Hãy mở dự án có sẵn hoặc tạo dự án mới trước."
        action={<button className="button primary" onClick={() => props.setRoute("projects")} type="button">Mở dự án</button>}
      />
    );
  }
  const project = props.selectedProject;
  const workspaceProps = {
    project,
    selectedProfile: props.selectedProfile,
    setRoute: props.setRoute,
    setSelectedProject: props.setSelectedProject,
    textCertification: props.textCertification,
    imageCertification: props.imageCertification,
    setImageCertification: props.setImageCertification,
    localTtsSettings: props.localTtsSettings,
    onRefresh: props.onRefresh,
    startSemiAutomatic: props.startSemiAutomatic,
    semiAutomaticProgress: props.semiAutomaticProgress,
    semiAutomaticRunning: props.semiAutomaticRunning,
    semiAutomaticError: props.semiAutomaticError
  };
  if (props.route === "project-overview") return <CheckpointWorkspace project={project} setRoute={props.setRoute} setSelectedProject={props.setSelectedProject} />;
  if (props.route === "content") return <ProjectStudioScreen {...workspaceProps} workspace="content" />;
  if (props.route === "script") return <ProjectStudioScreen {...workspaceProps} workspace="content" initialTab="story" />;
  if (props.route === "idea-lab") return <ProjectStudioScreen {...workspaceProps} workspace="content" initialTab="ideas" />;
  if (props.route === "reference-intake") return <ProjectStudioScreen {...workspaceProps} workspace="content" initialTab="references" />;
  if (props.route === "director" || props.route === "scenes") return <ProjectStudioScreen {...workspaceProps} workspace="director" initialTab="scenes" />;
  if (props.route === "shots") return <ProjectStudioScreen {...workspaceProps} workspace="director" initialTab="storyboard" />;
  if (props.route === "assets") return <ProjectStudioScreen {...workspaceProps} workspace="assets" />;
  if (props.route === "visuals") return <ProjectStudioScreen {...workspaceProps} workspace="director" initialTab="prompts" />;
  if (props.route === "build" || props.route === "timeline") return <ProjectStudioScreen {...workspaceProps} workspace="build" initialTab="timeline" />;
  if (props.route === "voice") return <ProjectStudioScreen {...workspaceProps} workspace="build" initialTab="voice" />;
  if (props.route === "qa") return <ProjectStudioScreen {...workspaceProps} workspace="build" initialTab="qa" />;
  if (props.route === "production") return <><ProductionScreen project={props.selectedProject} selectedProfile={props.selectedProfile} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} /><ProductionScriptPanel project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} /></>;
  if (props.route === "scene-review") return <SceneReviewScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} />;
  if (props.route === "final-preview") return <FinalPreviewScreen project={props.selectedProject} localTtsSettings={props.localTtsSettings} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "advanced-pipeline") return <AdvancedPipelineScreen project={props.selectedProject} setRoute={props.setRoute} />;
  if (props.route === "competitor-dna") return <CompetitorDnaScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} textCertification={props.textCertification} startSemiAutomatic={props.startSemiAutomatic} />;
  if (props.route === "export") return <ExportScreen project={props.selectedProject} setSelectedProject={props.setSelectedProject} setRoute={props.setRoute} />;
  return <EmptyState title="Tuyến chưa được triển khai" detail="Tuyến này được đăng ký cho đợt kiểm tra giao diện nhưng chưa có màn hình thực thi." action={<button className="button secondary" type="button" onClick={() => props.setRoute("dashboard")}>Về trang chủ</button>} />;
}
