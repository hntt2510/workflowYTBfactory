import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Boxes, CheckCircle2, FlaskConical, KeyRound, Play, Route, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  createFixtureProject,
  routeChannelProfile,
  seedChannelProfiles,
  type ChannelProfile,
  type ChannelRouteDecision,
  type FactoryProject
} from "@lsf/domain";
import "./styles.css";

declare global {
  interface Window {
    longShortFactory?: {
      bootstrap: () => Promise<{ profiles: ChannelProfile[]; workspaceRoot: string }>;
      routeTopic: (input: {
        topic: string;
        format: "long" | "short";
        targetLanguage: string;
        selectedProfileId?: string;
      }) => Promise<ChannelRouteDecision>;
      fixtureProject: (topic: string) => Promise<FactoryProject>;
      mockImageBatch: (projectId: string) => Promise<unknown>;
    };
  }
}

const demoTopics = [
  "What did Aaron's breastpiece symbolize?",
  "term life vs whole life",
  "AI copyright lawsuit between a creator and a platform"
];

const navItems: Array<[string, LucideIcon]> = [
  ["Dashboard", CheckCircle2],
  ["Channel Profiles", Route],
  ["Idea Lab", FlaskConical],
  ["Generation Queue", Play],
  ["Provider Settings", KeyRound],
  ["CapCut Export", Settings]
];

function App() {
  const [topic, setTopic] = useState(demoTopics[0] ?? "");
  const [profiles, setProfiles] = useState<ChannelProfile[]>(seedChannelProfiles);
  const [decision, setDecision] = useState<ChannelRouteDecision>(() =>
    routeChannelProfile(seedChannelProfiles, {
      topic,
      format: "long",
      targetLanguage: "English"
    })
  );
  const [project, setProject] = useState<FactoryProject | null>(null);
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === decision.selectedProfileId),
    [decision.selectedProfileId, profiles]
  );

  useEffect(() => {
    void window.longShortFactory?.bootstrap().then((data) => setProfiles(data.profiles));
  }, []);

  async function routeTopic() {
    const input = { topic, format: "long" as const, targetLanguage: "English" };
    const routed = window.longShortFactory
      ? await window.longShortFactory.routeTopic(input)
      : routeChannelProfile(profiles, input);
    setDecision(routed);
  }

  async function buildFixture() {
    const fixture = window.longShortFactory
      ? await window.longShortFactory.fixtureProject(topic)
      : createFixtureProject({ topic, format: "long", targetLanguage: "English", profiles });
    setProject(fixture);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Boxes size={24} />
          <span>Long/Short Factory</span>
        </div>
        {navItems.map(([label, Icon]) => (
          <button className="nav-button" key={label}>
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Bảng điều khiển sản xuất</p>
            <h1>Tạo dự án faceless từ ý tưởng đến timeline</h1>
          </div>
          <button className="primary" onClick={buildFixture}>
            <Play size={18} />
            Tạo vertical slice
          </button>
        </header>

        <section className="panel">
          <div className="field-row">
            <label htmlFor="topic">Chủ đề</label>
            <input id="topic" value={topic} onChange={(event) => setTopic(event.target.value)} />
            <button onClick={routeTopic}>
              <Route size={18} />
              Route
            </button>
          </div>
          <div className="quick-topics">
            {demoTopics.map((sample) => (
              <button key={sample} onClick={() => setTopic(sample)}>
                {sample}
              </button>
            ))}
          </div>
        </section>

        <section className="grid">
          <article className="panel">
            <h2>Route quyết định</h2>
            <div className="metric">
              <span>{selectedProfile?.name ?? "Unknown"}</span>
              <strong>{Math.round(decision.confidence * 100)}%</strong>
            </div>
            <p className="muted">
              {decision.requiresUserConfirmation
                ? "Cần xác nhận trước khi chạy các bước sau."
                : "Đủ tin cậy để tiếp tục hoặc người dùng có thể đổi profile."}
            </p>
            <div className="tags">
              {decision.matchedSignals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
            </div>
          </article>

          <article className="panel">
            <h2>Channel memory</h2>
            {selectedProfile ? (
              <>
                <p>{selectedProfile.niche}</p>
                <p className="muted">{selectedProfile.tone}</p>
                <div className="tags">
                  {selectedProfile.coreHashtags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </>
            ) : null}
          </article>
        </section>

        {project ? (
          <section className="panel">
            <h2>Fixture project</h2>
            <div className="stage-grid">
              {project.stages.map((stage) => (
                <div className="stage" key={stage.id}>
                  <span>{stage.name}</span>
                  <strong>{stage.status}</strong>
                </div>
              ))}
            </div>
            <div className="grid">
              <div>
                <h3>Ideas</h3>
                <p>{project.ideas.length} candidates, default mix 4/4/4.</p>
              </div>
              <div>
                <h3>Shots</h3>
                <p>{project.shots.length} frame-accurate 30 FPS shots ready for routing.</p>
              </div>
              <div>
                <h3>Timeline</h3>
                <p>{project.timeline.items.length} deterministic items from approved script data.</p>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
