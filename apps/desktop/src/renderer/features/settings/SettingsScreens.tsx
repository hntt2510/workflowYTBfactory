import type { BootstrapData, ProviderPresence } from "../../types";
import type { RouteId } from "../../navigation";
import { DisabledAction, PageHeader, SectionCard, SettingsList } from "../../components/ui";

export function SettingsScreen(props: { bootstrap: BootstrapData; setRoute: (route: RouteId) => void }) {
  const runtime = props.bootstrap.runtime;
  return (
    <>
      <PageHeader title="Settings" description="Dark-only local workspace settings. Most backend settings are read-only until persistence endpoints exist." />
      <div className="settings-grid">
        <SectionCard title="General"><SettingsList items={[['Mode', 'Local desktop'], ['Project persistence', 'SQLite'], ['Cloud sync', 'Unavailable']]} /></SectionCard>
        <SectionCard title="Workspace">
          <SettingsList items={[['Workspace location', props.bootstrap.workspaceRoot], ['Database location', props.bootstrap.databasePath], ['Asset location', 'Not configured'], ['Logs location', 'Not configured']]} />
          <DisabledAction reason="Open-folder IPC is not implemented.">Open folder</DisabledAction>
        </SectionCard>
        <SectionCard title="Appearance"><SettingsList items={[['Theme', 'Dark only'], ['Density', 'Comfortable'], ['Sidebar', 'Expanded / collapsed']]} /></SectionCard>
        <SectionCard title="Generation"><SettingsList items={[['Approval policy', 'Guided'], ['Paid generation', 'Explicit stage runs only; never automatic'], ['Provider concurrency', 'Five-worker queue exists; provider-specific setting unavailable']]} /></SectionCard>
        <SectionCard title="Advanced workflow" description="The stage-by-stage guided experience is hidden from the default navigation but remains available for debugging and recovery.">
          <button className="button secondary" type="button" onClick={() => props.setRoute('new-project')}>Open Advanced Guided Wizard</button>
        </SectionCard>
        <SectionCard title="CapCut"><SettingsList items={[
          ['Installation status', runtime.capcutInstalled ? 'Detected' : 'Unavailable'],
          ['Version', 'Not verified'],
          ['Install path', runtime.capcutInstallPath],
          ['Draft directory', runtime.capcutDraftDir],
          ['Python status', runtime.pythonExists ? runtime.pythonVersion : 'Needs setup'],
          ['Python path', runtime.sidecarPythonPath],
          ['pycapcut status', runtime.pycapcutStatus],
          ['Compatibility status', runtime.capcutCompatibility]
        ]} /></SectionCard>
        <SectionCard title="FFmpeg"><SettingsList items={[['Status', runtime.ffmpegAvailable ? 'Detected' : 'Needs setup'], ['Path', runtime.ffmpegPath], ['Version', runtime.ffmpegStatus], ['Preview IPC', runtime.ffmpegAvailable ? 'Ready for explicit approved-media renders' : 'Blocked until FFmpeg is configured'], ['Competitor video processing', runtime.ffmpegAvailable ? 'Ready for future downloader/transcriber wiring' : 'Blocked until FFmpeg is configured']]} /></SectionCard>
        <SectionCard title="Security"><SettingsList items={[['Credential storage', 'OS keychain reference'], ['Renderer API keys', 'Write-only input'], ['Log redaction', 'Enabled'], ['Generic filesystem IPC', 'Unavailable']]} /></SectionCard>
        <SectionCard title="Diagnostics"><SettingsList items={[['CodeGraph', 'Development index only'], ['Queue snapshot', `${props.bootstrap.queue.jobs.length} jobs`], ['Project count', `${props.bootstrap.projects.length}`]]} /></SectionCard>
      </div>
    </>
  );
}

export function DiagnosticsScreen(props: { bootstrap: BootstrapData; presence: ProviderPresence }) {
  const diagnostics = {
    workspaceRoot: props.bootstrap.workspaceRoot,
    databasePath: props.bootstrap.databasePath,
    projectCount: props.bootstrap.projects.length,
    queueJobs: props.bootstrap.queue.jobs.length,
    providerStatus: props.presence.hasCredential ? "credential_saved" : "not_configured"
  };
  return (
    <>
      <PageHeader title="Diagnostics" description="Redacted local state for troubleshooting." />
      <SectionCard>
        <pre className="diagnostics">{JSON.stringify(diagnostics, null, 2)}</pre>
      </SectionCard>
    </>
  );
}
