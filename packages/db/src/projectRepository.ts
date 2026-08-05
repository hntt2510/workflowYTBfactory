import type { ChannelProfile, FactoryProject } from "@lsf/domain";
import { normalizeProjectStages, seedChannelProfiles } from "@lsf/domain";
import type { FactoryDatabase } from "./connection";

export interface ProjectSummary {
  id: string;
  topic: string;
  profileId: string;
  format: string;
  projectName: string;
  targetLanguage: string;
  targetDuration: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  topic: string;
  format: string;
  target_language: string;
  profile_id: string;
  route_decision_json: string;
  approved_idea_id: string | null;
  payload_json: string;
}

function defaultTargetDuration(format: string): string {
  return format === "short" ? "45-60 seconds" : "8-12 minutes";
}

interface ProjectSummaryRow {
  id: string;
  topic: string;
  profile_id: string;
  format: string;
  target_language: string;
  payload_json: string;
  updated_at: string;
}

function projectRowId(projectId: string, rowId: string): string {
  return `${projectId}:${rowId}`;
}

export class ProjectRepository {
  constructor(private readonly db: FactoryDatabase) {}

  createProject(project: FactoryProject): FactoryProject {
    this.saveProject(project);
    return project;
  }

  saveProject(project: FactoryProject, options: { withinTransaction?: boolean } = {}): void {
    if (!options.withinTransaction) this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.seedProfiles();
      this.db
        .prepare(
          `INSERT INTO projects (id, topic, format, target_language, profile_id, route_decision_json, approved_idea_id, payload_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             topic = excluded.topic,
             format = excluded.format,
             target_language = excluded.target_language,
             profile_id = excluded.profile_id,
             route_decision_json = excluded.route_decision_json,
             approved_idea_id = excluded.approved_idea_id,
             payload_json = excluded.payload_json,
             updated_at = CURRENT_TIMESTAMP`
        )
        .run(
          project.id,
          project.topic,
          project.format,
          project.targetLanguage,
          project.profileId,
          JSON.stringify(project.routeDecision),
          project.approvedIdeaId ?? null,
          JSON.stringify({
            stages: project.stages,
            timelineFps: project.timeline.fps,
           setup: project.setup,
            synthetic: project.synthetic === true,
            referenceSet: project.referenceSet,
            competitorReferences: project.competitorReferences,
            assetConcepts: project.assetConcepts
          })
        );

      this.replaceRows("ideas", project.id, project.ideas);
      this.replaceRows("claims", project.id, project.claims);
      this.replaceScript(project);
      this.replaceScenes(project);
      this.replaceShots(project);
      this.replaceTimeline(project);
      if (!options.withinTransaction) this.db.exec("COMMIT;");
    } catch (error) {
      if (!options.withinTransaction) this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  loadProject(projectId: string): FactoryProject | undefined {
    const projectRow = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as ProjectRow | undefined;
    if (!projectRow) return undefined;
    const payload = JSON.parse(projectRow.payload_json) as {
      stages: FactoryProject["stages"];
      timelineFps: number;
	      synthetic?: boolean;
	      setup?: FactoryProject["setup"];
      referenceSet?: FactoryProject["referenceSet"];
      competitorReferences?: FactoryProject["competitorReferences"];
      assetConcepts?: FactoryProject["assetConcepts"];
	    };
    return {
      id: projectRow.id,
      ...(payload.synthetic ? { synthetic: true } : {}),
      topic: projectRow.topic,
      format: projectRow.format as FactoryProject["format"],
      targetLanguage: projectRow.target_language,
      setup:
        payload.setup ?? {
          projectName: projectRow.topic,
          targetDuration: defaultTargetDuration(projectRow.format),
          language: projectRow.target_language,
          workflowMode: "guided"
        },
      profileId: projectRow.profile_id,
      routeDecision: JSON.parse(projectRow.route_decision_json) as FactoryProject["routeDecision"],
      stages: normalizeProjectStages(payload.stages ?? [], payload.setup?.visualWorkflow),
      referenceSet: payload.referenceSet ?? { status: payload.competitorReferences?.length ? "needs_validation" : "not_started" },
      ideas: this.loadPayloadRows("ideas", projectId),
      ...(projectRow.approved_idea_id ? { approvedIdeaId: projectRow.approved_idea_id } : {}),
	      claims: this.loadPayloadRows("claims", projectId),
	      competitorReferences: payload.competitorReferences ?? [],
	      scriptSections: this.loadPayloadRows("script_sections", projectId),
      scenes: this.loadPayloadRows("scenes", projectId),
      shots: this.loadPayloadRows("shots", projectId),
      ...(payload.assetConcepts ? { assetConcepts: payload.assetConcepts } : {}),
      timeline: {
        fps: payload.timelineFps,
        items: this.loadPayloadRows("timeline_items", projectId)
      }
    };
  }

  listProjects(): ProjectSummary[] {
    return this.db
      .prepare("SELECT id, topic, profile_id, format, target_language, payload_json, updated_at FROM projects ORDER BY updated_at DESC")
      .all()
      .map((row) => {
        const item = row as unknown as ProjectSummaryRow;
        const payload = JSON.parse(item.payload_json) as { setup?: FactoryProject["setup"] };
        const setup = payload.setup ?? {
          projectName: item.topic,
          targetDuration: defaultTargetDuration(item.format),
          language: item.target_language,
          workflowMode: "guided" as const
        };
        return {
          id: item.id,
          topic: item.topic,
          profileId: item.profile_id,
          format: item.format,
          projectName: setup.projectName,
          targetLanguage: setup.language,
          targetDuration: setup.targetDuration,
          updatedAt: item.updated_at
        };
      });
  }

  updateProject(project: FactoryProject): void {
    this.saveProject(project);
  }

  deleteProject(projectId: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  }

  seedProfiles(): void {
    const statement = this.db.prepare(
      `INSERT INTO channel_profiles (id, name, payload_json, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO NOTHING`
    );
    for (const profile of seedChannelProfiles) {
      statement.run(profile.id, profile.name, JSON.stringify(profile));
    }
  }

  listChannelProfiles(): ChannelProfile[] {
    this.seedProfiles();
    return (this.db.prepare("SELECT payload_json FROM channel_profiles ORDER BY name").all() as Array<{ payload_json: string }>).map((row) => JSON.parse(row.payload_json) as ChannelProfile);
  }

  saveChannelProfile(profile: ChannelProfile): void {
    this.db.prepare(
      `INSERT INTO channel_profiles (id, name, payload_json, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, payload_json = excluded.payload_json, updated_at = CURRENT_TIMESTAMP`
    ).run(profile.id, profile.name, JSON.stringify(profile));
  }

  loadChannelProfile(profileId: string): ChannelProfile | undefined {
    return this.listChannelProfiles().find((profile) => profile.id === profileId);
  }

  private replaceRows(table: string, projectId: string, rows: Array<{ id: string }>): void {
    this.db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(projectId);
    const statement = this.db.prepare(`INSERT INTO ${table} (id, project_id, payload_json) VALUES (?, ?, ?)`);
    for (const row of rows) {
      statement.run(projectRowId(projectId, row.id), projectId, JSON.stringify(row));
    }
  }

  private replaceScript(project: FactoryProject): void {
    this.db.prepare("DELETE FROM script_versions WHERE project_id = ?").run(project.id);
    const versionId = `${project.id}-script-v1`;
    this.db
      .prepare("INSERT INTO script_versions (id, project_id, version, payload_json) VALUES (?, ?, ?, ?)")
      .run(versionId, project.id, 1, JSON.stringify({ status: "current" }));
    const statement = this.db.prepare(
      "INSERT INTO script_sections (id, project_id, script_version_id, section_order, payload_json) VALUES (?, ?, ?, ?, ?)"
    );
    project.scriptSections.forEach((section, index) =>
      statement.run(projectRowId(project.id, section.id), project.id, versionId, index, JSON.stringify(section))
    );
  }

  private replaceScenes(project: FactoryProject): void {
    this.db.prepare("DELETE FROM scenes WHERE project_id = ?").run(project.id);
    const statement = this.db.prepare(
      "INSERT INTO scenes (id, project_id, script_section_id, start_frame, duration_frames, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const scene of project.scenes) {
      statement.run(
        projectRowId(project.id, scene.id),
        project.id,
        projectRowId(project.id, scene.scriptSectionId),
        scene.startFrame,
        scene.durationFrames,
        JSON.stringify(scene)
      );
    }
  }

  private replaceShots(project: FactoryProject): void {
    this.db.prepare("DELETE FROM shots WHERE project_id = ?").run(project.id);
    const statement = this.db.prepare(
      "INSERT INTO shots (id, project_id, scene_id, shot_order, start_frame, duration_frames, fps, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const shot of project.shots) {
      statement.run(
        projectRowId(project.id, shot.id),
        project.id,
        projectRowId(project.id, shot.sceneId),
        shot.order,
        shot.startFrame,
        shot.durationFrames,
        shot.fps,
        JSON.stringify(shot)
      );
    }
  }

  private replaceTimeline(project: FactoryProject): void {
    this.db.prepare("DELETE FROM timeline_tracks WHERE project_id = ?").run(project.id);
    const tracks = [...new Set(project.timeline.items.map((item) => item.track))];
    const trackStatement = this.db.prepare(
      "INSERT INTO timeline_tracks (id, project_id, track_type, payload_json) VALUES (?, ?, ?, ?)"
    );
    for (const track of tracks) {
      trackStatement.run(`${project.id}-track-${track}`, project.id, track, JSON.stringify({ track }));
    }
    const itemStatement = this.db.prepare(
      "INSERT INTO timeline_items (id, project_id, track_id, source_id, start_frame, duration_frames, fps, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const item of project.timeline.items) {
      itemStatement.run(
        item.id,
        project.id,
        `${project.id}-track-${item.track}`,
        item.sourceId,
        item.startFrame,
        item.durationFrames,
        item.fps,
        JSON.stringify(item)
      );
    }
  }

  private loadPayloadRows<T>(table: string, projectId: string): T[] {
    const orderBy =
      table === "script_sections"
        ? "section_order"
        : table === "shots"
          ? "shot_order"
          : table === "timeline_items" || table === "scenes"
            ? "start_frame"
            : "id";
    return this.db
      .prepare(`SELECT payload_json FROM ${table} WHERE project_id = ? ORDER BY ${orderBy}`)
      .all(projectId)
      .map((row) => JSON.parse((row as { payload_json: string }).payload_json) as T);
  }
}
