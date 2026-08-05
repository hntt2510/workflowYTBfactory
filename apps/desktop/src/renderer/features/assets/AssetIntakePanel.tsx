import React, { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { FactoryProject } from "@lsf/domain";
import { factoryClient } from "../../services/factoryClient";
import type { AssetReviewArtifact, PromptPreparationArtifact } from "../../types";
import { EmptyState } from "../../components/ui";

gsap.registerPlugin(useGSAP);

type ReviewItem = AssetReviewArtifact["payloadJson"]["assets"][number];

export interface AssetIntakePanelProps {
  project: FactoryProject;
  latestPrompt?: PromptPreparationArtifact | undefined;
  latestReview?: AssetReviewArtifact | undefined;
  requiredShots: FactoryProject["shots"];
  reviewItems: ReviewItem[];
  itemForShot: (shotId: string) => ReviewItem | undefined;
  missingCount: number;
  warningCount: number;
  orphanCount: number;
  running: boolean;
  perform: (action: () => Promise<FactoryProject>, success: string) => Promise<void>;
  onMessage: (message: string) => void;
}

export function AssetIntakePanel(props: AssetIntakePanelProps) {
  const root = useRef<HTMLDivElement>(null);
  const latestReview = props.latestReview;
  const reusableShots = props.project.shots.filter((shot) => shot.visualMode === "reuse");
  const frameSpecForShot = (shotId: string) => props.latestPrompt?.payloadJson.scenePrompts
    ?.flatMap((scenePrompt) => scenePrompt.frameManifest)
    .find((frame) => frame.shotId === shotId);
  const reuseSourceForShot = (shot: FactoryProject["shots"][number]) => shot.continuityRefs
    .map((referenceId) => props.project.shots.find((candidate) => candidate.id === referenceId))
    .map((sourceShot) => sourceShot ? { shot: sourceShot, item: props.itemForShot(sourceShot.id) } : undefined)
    .find((source) => source?.item?.reviewStatus === "approved");

  useGSAP(() => {
    const items = gsap.utils.toArray<HTMLElement>(".asset-slot", root.current ?? undefined);
    const media = gsap.matchMedia();
    media.add({ reduceMotion: "(prefers-reduced-motion: reduce)" }, (context) => {
      gsap.set(items, { autoAlpha: 1, y: 0 });
      if (context.conditions?.reduceMotion) return;
      const timeline = gsap.timeline({ defaults: { duration: 0.18, ease: "power2.out" } });
      timeline.fromTo(items, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, stagger: 0.025 });
    }, root);
    return () => media.revert();
  }, { scope: root, dependencies: [props.reviewItems.length, props.requiredShots.length], revertOnUpdate: true });

  async function importDroppedFiles(event: React.DragEvent<HTMLDivElement>): Promise<void> {
    event.preventDefault();
    if (props.running || !props.latestPrompt || props.latestPrompt.status !== "approved") return;
    const sourcePaths = Array.from(event.dataTransfer.files)
      .map((file) => factoryClient.getDroppedFilePath(file))
      .filter(Boolean);
    if (!sourcePaths.length) {
      props.onMessage("Không đọc được đường dẫn file được thả. Hãy dùng nút tải ảnh.");
      return;
    }
    await props.perform(
      () => factoryClient.selectManualAssetUpload({ projectId: props.project.id, sourcePaths }),
      "Đã import ảnh. Tiếp tục duyệt và gán từng frame."
    );
  }

  async function uploadShot(shotId: string): Promise<void> {
    if (props.running || !props.latestPrompt || props.latestPrompt.status !== "approved") {
      props.onMessage("Hãy duyệt Scene Prompt trước khi tải storyboard frame.");
      return;
    }
    await props.perform(
      () => factoryClient.selectManualAssetUpload({
        projectId: props.project.id,
        shotId,
        ...(props.latestReview?.status === "needs_review" ? { artifactId: props.latestReview.id } : {})
      }),
      "Đã import frame. Tiếp tục duyệt và gán ảnh."
    );
  }

  return (
    <section ref={root}>
      <div className="intake-summary">
        <div><strong>{props.missingCount}</strong><span>frame còn thiếu</span></div>
        <div><strong>{props.requiredShots.length - props.missingCount}</strong><span>frame đã map/duyệt</span></div>
        <div><strong>{props.requiredShots.length}</strong><span>frame cần có</span></div>
      </div>
      <div className="upload-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void importDroppedFiles(event)}>
        <p><strong>Upload nhiều ảnh một lần</strong></p>
        <p>PNG, JPG hoặc WebP · tự kiểm tra MIME, kích thước, hash và mapping.</p>
        <button className="button primary" type="button" disabled={props.running || !props.latestPrompt || props.latestPrompt.status !== "approved"} onClick={() => void props.perform(() => factoryClient.selectManualAssetUpload({ projectId: props.project.id }), "Đã import ảnh. Tiếp tục duyệt từng frame.")}>Tải ảnh GG Lab lên</button>
        {!props.latestPrompt || props.latestPrompt.status !== "approved"
          ? <small>Hãy duyệt Scene Prompt trước khi upload.</small>
          : <small>Kéo thả nhiều ảnh vào vùng này để tự map theo storyboard.</small>}
      </div>
      <div className="asset-intake-grid">
        {props.requiredShots.map((shot) => {
          const item = props.itemForShot(shot.id);
          const frameSpec = frameSpecForShot(shot.id);
          return (
            <article className={`asset-slot ${item ? "" : "asset-slot-missing"}`} key={`slot-${shot.id}`}>
              {item && props.latestReview
                ? <AssetPreviewImage projectId={props.project.id} artifactId={props.latestReview.id} assetSha256={item.asset.sha256} />
                : <div className="asset-slot-preview asset-slot-placeholder">Chưa có ảnh</div>}
              <div>
                <strong>{frameSpec?.displayNumber ?? shot.id} · {shot.sceneId}</strong>
                <span>{frameSpec?.role ?? "STORYBOARD FRAME"} · {shot.purpose}</span>
                <span>{item ? `${item.asset.width}×${item.asset.height} · ${item.reviewStatus === "approved" ? "Đã duyệt" : "Chờ duyệt"}` : "Thiếu storyboard frame"}</span>
                {item?.warnings?.map((warning) => <small className="attention-copy" key={warning}>{warning}</small>)}
              </div>
              <button className="button compact" type="button" disabled={props.running || !props.latestPrompt || props.latestPrompt.status !== "approved"} onClick={() => void uploadShot(shot.id)}>{item ? "Tải lại / thay thế" : "Tải frame"}</button>
            </article>
          );
        })}
      </div>
      {reusableShots.length ? (
        <section className="reuse-intake" aria-label="Reusable storyboard frames">
          <div className="section-card-header">
            <h3>Frame tái sử dụng</h3>
            <p>Chọn một ảnh đã duyệt để dùng lại; không cần tạo thêm ảnh mới.</p>
          </div>
          <div className="asset-intake-grid">
            {reusableShots.map((shot) => {
              const source = reuseSourceForShot(shot);
              return (
                <article className={`asset-slot ${source ? "" : "asset-slot-missing"}`} key={`reuse-slot-${shot.id}`}>
                  {source?.item && latestReview ? <AssetPreviewImage projectId={props.project.id} artifactId={latestReview.id} assetSha256={source.item.asset.sha256} /> : <div className="asset-slot-preview asset-slot-placeholder">Chưa có frame nguồn</div>}
                  <div>
                    <strong>{shot.id} · REUSE</strong>
                    <span>{shot.purpose}</span>
                    {source ? <span>Tự dùng lại frame nguồn {source.shot.id}</span> : <small className="attention-copy">Chưa tìm thấy frame nguồn đã duyệt trong continuity refs.</small>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {props.warningCount > 0 ? <p className="attention-copy">{props.warningCount} ảnh có cảnh báo; hãy kiểm tra trước khi dựng.</p> : null}
      {props.orphanCount > 0 ? <p className="attention-copy">{props.orphanCount} file chưa khớp storyboard frame.</p> : null}
      {latestReview
        ? <div className="asset-intake-grid">
            {props.reviewItems.map((item) => (
              <article className="asset-slot" key={`${item.asset.sha256}-${item.assignedShotId ?? item.asset.shotId}`}>
                <AssetPreviewImage projectId={props.project.id} artifactId={latestReview.id} assetSha256={item.asset.sha256} />
                <div>
                  <strong>{item.assignedShotId ?? item.asset.shotId}</strong>
                  <span>{item.asset.width}×{item.asset.height} · {item.reviewStatus === "approved" ? "Đã duyệt" : item.reviewStatus === "rejected" ? "Cần thay" : "Chờ duyệt"}</span>
                </div>
                {latestReview.status === "needs_review" ? (
                  <>
                    <div className="button-row">
                      <button className="button compact" type="button" disabled={props.running} onClick={() => void props.perform(() => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: latestReview.id, assetSha256: item.asset.sha256, action: "approve" }), "Frame đã được duyệt.")}>Duyệt</button>
                      <button className="button danger compact" type="button" disabled={props.running} onClick={() => void props.perform(() => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: latestReview.id, assetSha256: item.asset.sha256, action: "reject" }), "Đã đánh dấu frame cần thay.")}>Cần thay</button>
                    </div>
                    {item.reviewStatus === "approved" ? (
                      <select
                        aria-label={`Gán ${item.asset.sha256} vào storyboard frame`}
                        value={item.assignedShotId ?? ""}
                        disabled={props.running}
                        onChange={(event) => {
                          const shotId = event.target.value;
                          void props.perform(
                            () => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: latestReview.id, assetSha256: item.asset.sha256, action: shotId ? "assign" : "unassign", ...(shotId ? { shotId } : {}) }),
                            "Đã cập nhật mapping frame."
                          );
                        }}
                      >
                        <option value="">Bỏ gán frame</option>
                        {props.project.shots.map((shot) => <option key={shot.id} value={shot.id}>{shot.id}{shot.visualMode === "reuse" ? " · REUSE" : ""}</option>)}
                      </select>
                    ) : null}
                    {item.reviewStatus !== "rejected" ? <button className="button danger compact" type="button" disabled={props.running} onClick={() => void props.perform(() => factoryClient.reviseAssetReview({ projectId: props.project.id, artifactId: latestReview.id, assetSha256: item.asset.sha256, action: "reject" }), "Đã gỡ ảnh khỏi batch review.")}>Gỡ khỏi batch</button> : null}
                  </>
                ) : null}
              </article>
            ))}
          </div>
        : <EmptyState title="Chưa có ảnh upload" detail="Tạo ảnh theo Prompt Studio rồi upload toàn bộ ở đây." />}
    </section>
  );
}

function AssetPreviewImage(props: { projectId: string; artifactId: string; assetSha256: string }) {
  const [url, setUrl] = React.useState<string>();
  React.useEffect(() => {
    let active = true;
    void factoryClient.getAssetPreviewUrl(props).then((result) => { if (active) setUrl(result.url); }).catch(() => undefined);
    return () => { active = false; };
  }, [props.projectId, props.artifactId, props.assetSha256]);
  return url ? <img className="asset-slot-preview" src={url} alt="Storyboard frame preview" /> : <div className="asset-slot-preview asset-slot-placeholder">Preview</div>;
}
