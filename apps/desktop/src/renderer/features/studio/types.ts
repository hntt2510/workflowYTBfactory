import type { ChannelProfile, FactoryProject } from "@lsf/domain";
import type {
  ImageModelCertificationResponse,
  LocalTtsSettings,
  TextModelCertificationResponse
} from "../../types";
import type { RouteId } from "../../navigation";
import type { SemiAutomaticChain, SemiAutomaticProgress } from "../../semiAutomaticWorkflow";

export interface ProjectWorkspaceProps {
  project: FactoryProject;
  selectedProfile: ChannelProfile | undefined;
  setRoute: (route: RouteId) => void;
  setSelectedProject: (project: FactoryProject | null) => void;
  textCertification: TextModelCertificationResponse;
  imageCertification: ImageModelCertificationResponse;
  setImageCertification: (certification: ImageModelCertificationResponse) => void;
  localTtsSettings: LocalTtsSettings | null;
  onRefresh: () => Promise<void>;
  startSemiAutomatic: (chain: SemiAutomaticChain, project: FactoryProject) => Promise<void>;
  semiAutomaticProgress: SemiAutomaticProgress | null;
  semiAutomaticRunning: boolean;
  semiAutomaticError: string | null;
}
