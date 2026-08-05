# Long/Short Factory - Hướng Dẫn Vận Hành Workflow

> Tài liệu này hướng dẫn cách sử dụng Main Happy Path V1 của Long/Short Factory.
> Phạm vi gồm 27 stage từ Project Setup đến Packaging Export, cùng các quy tắc về
> provider, review, approval, persistence, restart recovery và xử lý lỗi.

## 1. Mục Đích Hệ Thống

Long/Short Factory là ứng dụng desktop local-first dùng để tạo dự án YouTube có cấu trúc.
Ứng dụng không phải là nút "generate tất cả". Mỗi stage phải được chạy, kiểm tra và
phê duyệt riêng trước khi stage tiếp theo được mở khóa.

Luồng chuẩn:

    Tạo project
      -> Nhập input
      -> Validate input
      -> Chạy một stage
      -> Kiểm tra output
      -> Sửa nếu cần
      -> Approve hoặc Reject
      -> Mở khóa stage tiếp theo

Mục tiêu của cách làm này:

- Mọi output có thể truy vết về input và artifact đã approved.
- Provider lỗi không bị che giấu bằng raw input, placeholder hoặc output giả.
- Restart Electron không làm mất project, run history, artifact hoặc approval.
- Người dùng luôn có quyền xem, sửa, approve hoặc reject output trước khi tiếp tục.
- Stage sau không thể dùng output draft, failed, rejected, stale hoặc chưa approved.

## 2. Kiến Trúc Tổng Quan

    React Renderer
        |
        v
    Typed Preload IPC
        |
        v
    Electron Main Process
        |-- Validate IPC payload (Zod/domain)
        |-- Check eligibility and upstream approvals
        |-- Run stage service
        |-- Persist run, artifact, approval and error
        |
        +--> packages/domain       workflow rules, types, state transitions
        +--> packages/db           SQLite, repositories, run history
        +--> packages/providers     9Router adapter and response parser
        +--> packages/media        FFmpeg/FFprobe and media validation
        +--> packages/capcut       CapCut adapter and Python bridge
        +--> packages/prompts      versioned prompt templates

### Nguyên tắc bảo mật

- Renderer chỉ gọi các hàm typed trong preload; không truy cập SQLite, filesystem, shell
  hoặc credential trực tiếp.
- API key được lưu trong Windows keychain thông qua keytar; SQLite chỉ lưu credential
  reference và các setting không nhạy cảm.
- Main process là nơi đọc credential, gọi provider, chạy Python/FFmpeg và validate đường dẫn.
- Không ghi API key, Authorization header, cookie, token, signed URL hoặc đường dẫn tuyệt đối
  của media vào log.
- Mọi đường dẫn file nhập vào phải nằm trong workspace hoặc được main process kiểm tra an toàn.

## 3. Các Khái Niệm Cần Nhớ

### Project

Project là aggregate chính của một sản phẩm YouTube. Nó chứa setup, reference, claims,
script, scenes, shots, assets, voice, timeline, approvals và settings.

### Stage

Stage là một bước sản xuất có ID ổn định. Ví dụ:

- transcript-cleaning
- reference-segmentation
- script
- asset-acquisition
- capcut-draft
- packaging-export

### Stage run

Mỗi lần người dùng bấm Run tạo ra một stage run riêng. Run lưu:

- stageRunId;
- project ID và stage ID;
- input artifact IDs và fingerprint;
- implementation, prompt và provider metadata;
- status, error category và retry metadata;
- progress nếu stage có chunk/job;
- thời điểm bắt đầu, kết thúc và cập nhật.

### Artifact

Artifact là output có thể review. Artifact không tự động trở thành input hợp lệ cho stage sau.
Nó phải được review và chuyển sang approved.

### Status

| Status | Ý nghĩa |
|---|---|
| not_started | Stage chưa từng chạy. |
| blocked | Chưa đủ điều kiện hoặc upstream chưa approved. |
| ready | Đủ điều kiện để người dùng chạy. |
| queued | Đã ghi nhận yêu cầu và đang chờ job. |
| running | Đang xử lý. |
| needs_review | Có output, đang chờ người dùng xem. |
| approved | Output hợp lệ và được phép làm input cho stage sau. |
| rejected | Người dùng từ chối output. |
| failed | Run lỗi; không có artifact approved. |
| stale | Output từng hợp lệ nhưng input upstream đã thay đổi hoặc bị revoke. |

Chỉ các chuyển đổi sau được phép:

    running -> needs_review
    needs_review -> approved
    needs_review -> rejected
    approved -> stale

Failed, rejected và stale không được tự động chuyển thành approved.

## 4. Cách Chạy Ứng Dụng

### Yêu cầu local

- Windows.
- Node.js và Corepack.
- pnpm 9.15.4.
- Python bridge environment trong python/capcut_bridge/.venv.
- FFmpeg/FFprobe cho preview và media validation.
- 9Router nếu chạy stage provider text/image.
- CapCut nếu cần tạo và kiểm tra draft trong desktop app.

### Khởi động

Tại root repository:

    corepack pnpm install
    corepack pnpm --filter @lsf/desktop dev

Lệnh trên chạy đồng thời:

1. Vite renderer tại http://127.0.0.1:5173.
2. Electron main process, kết nối preload và SQLite.

Nếu gặp lỗi Port 5173 is already in use:

    Get-NetTCPConnection -LocalPort 5173 -State Listen |
      Select-Object LocalAddress,LocalPort,OwningProcess

    Get-Process -Id <PID>
    Stop-Process -Id <PID>

Chỉ dùng Stop-Process với PID của Vite/Electron của project này. Không kill hàng loạt
nếu chưa xác định process.

### Workspace và SQLite

Khi bootstrap, main process:

1. Mở <WORKSPACE_ROOT>/long-short-factory.sqlite.
2. Bật WAL và foreign keys.
3. Chạy migrations.
4. Load project, profiles, queue, settings và runtime capabilities.
5. Hiển thị dữ liệu đã persist trong renderer.

Media lớn nằm trong workspace project; SQLite chỉ lưu metadata và relative path.

## 5. Các Bước Sử Dụng Trên UI

### Bước 1 - Kiểm tra Settings và Providers

1. Mở Providers.
2. Lưu 9Router base URL và API key.
3. Chọn model cho text, image và các capability cần dùng.
4. Chạy model/capability check nếu UI cho phép.
5. Kiểm tra Diagnostics để chắc chắn endpoint và runtime đã sẵn sàng.

Provider không được gọi khi người dùng chỉ mở project, save input, reload app hoặc đi qua
lại giữa các màn hình.

### Bước 2 - Tạo Project

1. Mở New Project.
2. Nhập topic, tên project, format, language, target duration và workflow mode.
3. Chọn channel profile routing.
4. Review thông tin.
5. Tạo project.

Sau khi tạo, project được ghi vào SQLite và có thể mở lại bằng project switcher.

### Bước 3 - Chạy một stage

Trên màn hình project:

1. Kiểm tra stage đang là ready và không có block reason.
2. Kiểm tra các artifact upstream đã approved.
3. Bấm Run một lần.
4. Chờ stage chuyển sang running và hiển thị progress nếu có.
5. Khi xong, mở output đang needs_review.
6. Sửa output nếu UI cho phép.
7. Bấm Approve hoặc Reject rõ ràng.

Không bấm Run lặp lại khi run cũ đang running. Hệ thống có active run lock và idempotency
để ngăn duplicate request trong cùng reference/project.

### Bước 4 - Restart recovery

Sau khi run hoặc approval:

1. Đóng Electron.
2. Khởi động lại app.
3. Mở lại cùng project.
4. Kiểm tra stage status, artifact, run history và progress.
5. Xác nhận stage sau vẫn chỉ mở khi upstream vẫn approved.

Run đang dở có thể được đánh dấu lỗi hoặc phục hồi theo service cụ thể. Restart không tạo
artifact mới chỉ vì app vừa khởi động.

## 6. Chi Tiết 27 Stage

### Nhóm A - Setup và Reference

#### 1. Project Setup

- Công dụng: tạo context sản xuất ban đầu.
- Input: topic, project name, format, language, target duration, workflow mode, channel profile.
- Output: project setup artifact và project record.
- Approval: xác nhận thông tin setup trước khi nhập reference.
- Mở khóa: Reference Intake.

#### 2. Reference Intake

- Công dụng: nhập transcript/reference ban đầu của video hoặc tài liệu tham chiếu.
- Input: reference title, source metadata, raw transcript và các field liên quan.
- Output: reference draft được lưu nguyên trạng.
- Approval: review reference đã nhập, không tự động sửa nội dung.
- Mở khóa: Reference Validation.

#### 3. Reference Validation

- Công dụng: kiểm tra reference có đủ dữ liệu, fingerprint và format hợp lệ.
- Input: reference draft.
- Xử lý: local deterministic, không tốn quota provider.
- Output: validated reference-set artifact.
- Approval: chỉ reference set đã approved mới được clean transcript.
- Mở khóa: Transcript Cleaning.

### Nhóm B - Transcript và Phân Tích Reference

#### 4. Transcript Cleaning

- Công dụng: sửa lỗi ASR rõ ràng mà không viết lại ý nghĩa.
- Input: raw transcript đã validated.
- Xử lý:
  - Tách transcript dài thành các chunk hợp lý.
  - Không gửi lại toàn bộ transcript trong từng chunk.
  - Đặt timeout riêng cho từng chunk.
  - Retry có giới hạn với exponential backoff.
  - Lưu progress dạng x/y chunks completed.
  - Cho phép resume từ chunk lỗi.
  - Dùng active run lock/idempotency để ngăn duplicate run.
  - Kiểm tra token budget trước khi gọi model.
  - Parser chấp nhận markdown fence/wrapper nhưng không fallback sang raw.
- Model chỉ được phép:
  - thêm dấu câu và viết hoa;
  - sửa lỗi ASR rõ ràng;
  - chia đoạn;
  - chuẩn hóa tên riêng khi đủ chắc chắn;
  - đánh dấu từ không chắc chắn;
  - tách hoặc đánh dấu sponsor.
- Model không được fact-check, thêm thông tin, đổi giọng kể hoặc viết lại ý tưởng.
- Fail-closed: output rỗng, output lỗi parse, output giống nguyên văn hoặc thay đổi quá ít đều
  bị đánh dấu failed.
- Raw transcript không bao giờ được gán làm cleaned output.
- Artifact gồm raw input, cleaned output, removed/marked sponsor, uncertain terms, chunk
  metadata, provider metadata và run metadata.
- Approval: xem cleaned text trước khi phê duyệt.
- Mở khóa: Reference Segmentation.

#### 5. Reference Segmentation

- Công dụng: chia cleaned transcript thành các segment có ý nghĩa.
- Input: cleaned transcript artifact đã approved.
- Xử lý: provider text có schema validation và giữ thứ tự.
- Output: segments, topic/role metadata và sponsor exclusion data.
- Approval: kiểm tra segment boundary và sponsor.
- Mở khóa: Competitor DNA.

#### 6. Competitor DNA

- Công dụng: rút ra đặc điểm cấu trúc, hook, pacing, proof pattern và rủi ro từ reference.
- Input: approved reference segments.
- Output: evidence-backed competitor DNA card.
- Quy tắc: không tạo claim không có evidence trong reference.
- Approval: kiểm tra evidence và confidence.
- Mở khóa: Opportunity Map.

#### 7. Opportunity Map

- Công dụng: tìm khoảng trống nội dung và cơ hội phù hợp với channel.
- Input: approved Competitor DNA.
- Output: opportunity map có confidence và limitation.
- Approval: xem cơ hội, không tự động chọn ý tưởng.
- Mở khóa: Idea Lab.

#### 8. Idea Lab

- Công dụng: tạo nhiều candidate để người dùng so sánh.
- Input: approved Opportunity Map và channel profile.
- Output: six idea candidates, gồm hai candidate cho mỗi risk bucket.
- Approval: chọn một candidate hoặc reject batch.
- Mở khóa: Originality Review.

#### 9. Originality Review

- Công dụng: kiểm tra ý tưởng có lặp lại reference quá mức, có rủi ro sao chép hoặc cần
  điều chỉnh không.
- Input: selected idea và reference evidence.
- Output: local/provider review artifact.
- Giới hạn: không tự động browse web; review chỉ dùng approved competitor evidence.
- Approval: xác nhận idea được phép phát triển.
- Mở khóa: Claim Map.

#### 10. Claim Map

- Công dụng: liên kết claim với source/evidence và đánh dấu claim không đủ chứng cứ.
- Input: approved competitor-reference transcripts và idea.
- Output: claim map có support status.
- Approval: block unsupported/allegation claim nếu cần.
- Mở khóa: Outline.

### Nhóm C - Script và Planning

#### 11. Outline

- Công dụng: tạo bố cục nội dung trước khi viết script.
- Input: approved claim map.
- Output: outline có liên kết claim và section.
- Approval: sửa thứ tự, emphasis và coverage.
- Mở khóa: Script.

#### 12. Script

- Công dụng: viết narration theo outline đã duyệt.
- Input: approved outline, claims, channel profile và duration.
- Output: script sections có stable IDs, narration text và metadata.
- Approval: đọc, sửa và phê duyệt script.
- Giới hạn: script không tự động fact-check thay người dùng và không được bỏ qua claim review.
- Mở khóa: Fact Review.

#### 13. Fact Review

- Công dụng: kiểm tra claim, wording, uncertainty và rủi ro trong script.
- Input: approved script và claim map.
- Output: fact review findings.
- Approval: sửa script hoặc chấp nhận findings theo workflow.
- Mở khóa: Retention Review.

#### 14. Retention Review

- Công dụng: đánh giá hook, pacing, open loops, transition và điểm rơi.
- Input: approved script.
- Output: retention findings/suggestions.
- Quy tắc: review không tự ý rewrite script; người dùng quyết định sửa.
- Approval: xác nhận script version tiếp tục.
- Mở khóa: Scene Plan.

#### 15. Scene Plan

- Công dụng: chia script thành scenes.
- Input: approved script và retention review.
- Output: scenes có section mapping và timing dự kiến.
- Approval: kiểm tra scene boundary và mục tiêu từng scene.
- Mở khóa: Shot Plan.

#### 16. Shot Plan

- Công dụng: chia scenes thành shots và xác định media requirement.
- Input: approved scene plan.
- Output: shots có source type, duration, visual intent và narration relation.
- Approval: review shot count, coverage và media route.
- Mở khóa: Visual Routing.

#### 17. Visual Routing

- Công dụng: chọn cách lấy visual cho từng shot.
- Route có thể gồm stock_video, document, manual_upload hoặc route AI phù hợp.
- Input: approved shot plan.
- Output: visual routing artifact.
- Approval: xác nhận route từng shot; route sai phải tạo revision, không sửa âm thầm.
- Mở khóa: Prompt Preparation.

#### 18. Prompt Preparation

- Công dụng: chuẩn bị prompt theo shot và route đã được phê duyệt.
- Input: approved visual routing.
- Output: prompt artifact cho image/video/asset acquisition.
- Quy tắc: prompt phải giữ context của shot, không tự ý thêm claim hoặc source.
- Approval: review prompt trước khi tốn quota image/video.
- Mở khóa: Asset Acquisition.

### Nhóm D - Media, Voice và Timeline

#### 19. Asset Acquisition

- Công dụng: lấy media theo prompt/route đã phê duyệt.
- Input: approved prompt preparation, verified image capability và asset policy.
- Xử lý: provider image có bounded timeout, retry và idempotent reuse.
- Output: asset metadata, file workspace-local, MIME/size/dimension/hash validation.
- Fail-closed: không tạo placeholder nếu provider lỗi; không cho raw prompt làm asset.
- Approval: chuyển Asset Review, không tự động assign asset vào timeline.

#### 20. Asset Review

- Công dụng: người dùng kiểm tra chất lượng và gán asset vào shot.
- Input: acquired asset batch.
- Output: approved/assigned assets.
- Quy tắc: asset bị reject không được feed timeline; manual upload tạo review revision mới.
- Approval: approve từng batch/asset theo UI.
- Mở khóa: Voice Generation.

#### 21. Voice Generation

- Công dụng: tạo narration audio theo approved script.
- Input: approved script section và asset/timing context.
- Xử lý: local Edge TTS/voice job hoặc runtime audio đã cấu hình; FFprobe validate output.
- Output: voice segments workspace-local, duration/sample metadata và run record.
- Quy tắc: không fallback sang provider khác nếu provider chính lỗi; không approved audio giả.
- Approval: nghe/kiểm tra audio và phê duyệt.
- Mở khóa: Subtitle Preparation.

#### 22. Subtitle Preparation

- Công dụng: tạo cue subtitles từ approved narration/timing.
- Input: approved voice segments và script text.
- Output: subtitle cues có start frame, duration frame, text và ordering.
- Quy tắc: frame là đơn vị thời gian chuẩn; cue phải nằm trong bounds audio/timeline.
- Approval: review cue text và timing.
- Mở khóa: Timeline Assembly.

#### 23. Timeline Assembly

- Công dụng: ghép visual, narration và subtitle thành timeline frame-based.
- Input: approved assets, voice, subtitles và shot plan.
- Output: timeline artifact với track/item IDs ổn định.
- Validation: FPS, frame integer, continuity, range không vượt media, primary visual coverage.
- Approval: review timeline trước khi render.
- Mở khóa: Preview Render.

#### 24. Preview Render

- Công dụng: tạo preview video bằng FFmpeg.
- Input: approved timeline và workspace media.
- Xử lý: plan scale/pad, audio gap, duration, FFprobe validation và SHA-256.
- Output: preview artifact chứa relative file path, dimensions, duration, hash và input artifact IDs.
- Approval: xem preview, kiểm tra lỗi render, khung hình, audio và subtitle.
- Mở khóa: QA.

#### 25. QA

- Công dụng: chạy deterministic checks trước khi tạo CapCut draft/export.
- Input: approved preview và approved upstream artifacts.
- Kiểm tra: media tồn tại, timing, continuity, claims, certification và CapCut prerequisites.
- Output: QA findings có code, severity, message và evidence.
- Quy tắc: blocking finding ngăn QA approval; QA không tự bịa finding AI.
- Approval: chỉ approve khi không còn blocking finding.
- Mở khóa: CapCut Draft.

#### 26. CapCut Draft

- Công dụng: tạo draft edit được trong CapCut từ approved timeline.
- Input: approved QA, timeline, preview, assets, voice và subtitles.
- Xử lý:
  - Python bridge tạo draft folder duy nhất.
  - Không overwrite draft đã tồn tại.
  - Tạo video, audio và text tracks.
  - Validate structural response trước khi persist artifact.
  - Mở draft trong CapCut để kiểm tra timeline/editability.
- Output: CapCut draft artifact với draft name, track counts và input artifact IDs.
- Approval: người dùng phải xác nhận video/audio/subtitle tracks mở được và edit được.
- Mở khóa: Packaging Export.

#### 27. Packaging Export

- Công dụng: tạo package manifest có thể truy vết.
- Input: approved script, assets, voice, subtitles, timeline, preview, QA và CapCut draft.
- Validation:
  - manifest path phải relative với workspace;
  - không path traversal hoặc absolute path;
  - file phải tồn tại;
  - SHA-256 phải khớp artifact đã review;
  - project ID, schema version và artifact IDs phải khớp.
- Output: JSON manifest trong workspace và packaging artifact.
- Approval: review manifest/export result; không tự động publish lên YouTube.

## 7. Transcript Cleaning - Luồng Chi Tiết

Transcript Cleaning là stage có cơ chế bảo vệ nghiêm ngặt vì raw transcript và cleaned
transcript khác nhau về chất lượng nhưng vẫn phải giữ nguyên ý nghĩa.

### Request flow

    Raw transcript
      -> Normalize boundary metadata
      -> Estimate token budget
      -> Split into ordered chunks
      -> Acquire active run lock
      -> Call provider per chunk
      -> Parse strict response
      -> Validate meaningful change
      -> Persist chunk result/progress
      -> Merge in original order
      -> Persist cleaning artifact as needs_review

### Retry và timeout

- Mỗi chunk có timeout riêng.
- Retry chỉ có giới hạn.
- Backoff tăng dần theo lần retry.
- Lỗi chunk được lưu riêng; resume chỉ chạy lại chunk lỗi/chưa xong.
- Không tạo nhiều request trùng lặp khi người dùng click Run nhiều lần.
- Run cùng reference chỉ có một active cleaning run.

### Các trường hợp phải fail

- Provider timeout sau khi hết retry.
- Provider trả body rỗng.
- JSON wrapper không parse được.
- Markdown fence không chứa payload hợp lệ.
- Output không có cleaned text.
- Output giống raw 100%.
- Output thay đổi quá ít, không có dấu câu/formatting/ASR correction có ý nghĩa.

Trong mọi trường hợp trên, run phải là failed và hiển thị error rõ ràng. Không tạo artifact
approved và không dùng raw transcript làm cleaned output.

## 8. Provider và Prompt Rules

### Khi nào provider được gọi

Provider chỉ được gọi sau khi:

1. credential đã được lưu;
2. endpoint reachable;
3. model ID đã chọn;
4. capability đúng với stage đã verified;
5. upstream artifact đã approved;
6. người dùng bấm Run.

Provider không được gọi khi:

- mở app;
- mở project;
- save input;
- reload/restart;
- approval một artifact;
- điều hướng giữa screen.

### Prompt

- Prompt phải ngắn, rõ, đúng mục đích stage.
- Text cleaning chỉ yêu cầu cleaned text hoặc schema JSON ổn định.
- Parser phải xử lý wrapper/fence nhưng không dùng raw fallback.
- Prompt version phải được ghi vào run metadata.
- Không đưa secret vào prompt hoặc log.

## 9. Persistence, Stale và Restart

Mọi thay đổi quan trọng phải được persist trong transaction phù hợp:

- project và settings;
- stage run và run history;
- artifact và artifact status;
- approval/rejection;
- jobs, attempts, retry metadata;
- asset metadata và relative paths;
- provider credential reference.

Khi input upstream thay đổi, hoặc approval của reference bị revoke:

1. artifact downstream bị đánh dấu stale;
2. stage downstream bị block;
3. người dùng phải run lại từ stage bị stale;
4. không được tái sử dụng artifact cũ như đang approved.

Restart chỉ load lại state đã persist; restart không tự động chạy provider hoặc approve output.

## 10. Xử Lý Lỗi Thường Gặp

### Vite báo port 5173 đã được sử dụng

Thường là Vite cũ vẫn đang chạy. Kiểm tra PID trên port, sau đó dừng đúng process cũ
hoặc tái sử dụng renderer đang chạy. Không kill CapCut, database hoặc process khác nếu không liên quan.

### Run báo provider_failed hoặc timeout

1. Xem run history để xác định stage và chunk lỗi.
2. Kiểm tra endpoint, credential, model capability và token budget.
3. Nếu là Transcript Cleaning, dùng Resume from failed chunk.
4. Không xóa raw transcript để "làm sạch" trạng thái.
5. Nếu hết retry, tạo retry run có idempotency mới theo UI; không bấm lặp liên tục.

### Cleaned output giống raw

Đây là lỗi validation, không phải kết quả thành công. Run phải hiển thị failed với lý do
output identical/minimally changed. Kiểm tra provider prompt, parser và model; không approve artifact.

### Provider trả output rỗng/JSON lỗi

Run phải fail-closed. Kiểm tra response wrapper, markdown fence, schema và provider response body.
Không thêm fallback return rawTranscript.

### Stage sau bị block

Kiểm tra theo thứ tự:

1. stage trước đã approved chưa;
2. artifact có bị stale không;
3. project/reference có bị thay đổi sau khi run không;
4. provider capability có đủ không;
5. có blocking QA finding không;
6. run cũ có đang active/failed không.

### CapCut draft không hiện

- Kiểm tra CAPCUT_DRAFT_DIR và draft folder.
- Kiểm tra Python bridge environment.
- Kiểm tra draft không trùng tên folder.
- Kiểm tra draft_content.json, draft_meta_info.json và track validation.
- Mở CapCut project grid và chọn đúng draft.
- Backup draft folder trước khi thay đổi thủ công.

### Preview không tạo được

- Kiểm tra FFmpeg/FFprobe trong Diagnostics.
- Kiểm tra mọi media path nằm trong workspace và đọc được.
- Kiểm tra frame range, FPS, audio duration và subtitle bounds.
- Kiểm tra artifact timeline đã approved.

## 11. Cách Kiểm Tra Một Project Đã Hoàn Tất

Một project chỉ được xem là hoàn tất khi có đủ các bằng chứng sau:

- 27 stage có status persist đúng mong đợi.
- Mỗi stage có output artifact và approval rõ ràng.
- Không có provider error bị che bằng raw/placeholder output.
- Restart Electron vẫn giữ nguyên project, run history và approval.
- Preview có FFprobe metadata và hash.
- QA không còn blocking finding.
- CapCut draft mở được và track video/audio/subtitle edit được.
- Packaging manifest có path relative, artifact IDs và SHA-256 khớp.

Các lệnh verification:

    corepack pnpm test:unit
    corepack pnpm typecheck
    corepack pnpm lint
    corepack pnpm --filter @lsf/desktop build
    git diff --check

## 12. Trạng Thái Runtime Đã Xác Nhận

Isolated project đã được dùng để xác minh Main Happy Path V1:

- Project: project-6a1fc78d-1a19-43c5-98fb-a0b8a16ad944.
- Checkpoint: Packaging Export approved.
- 27/27 stage đã persist approved sau restart.
- Preview: 1080x1920, 30fps, khoảng 69.979 giây.
- QA: zero blocking findings.
- CapCut: đã mở draft và chọn subtitle segment trong Text editor.
- Evidence: .tmp-main-flow-runtime/full-path-20260802/capcut-editable-text-selected.png.
- Báo cáo stage: docs/main-flow/MAIN_HAPPY_PATH_REPORT.md.
- Tiến độ và residual issues: docs/main-flow/MAIN_FLOW_PROGRESS.md và
  docs/main-flow/MAIN_FLOW_ISSUES.md.

Lưu ý: runtime verified của isolated project không có nghĩa mọi project bất kỳ đều tự động
chạy được. Mỗi project vẫn phải có credential, capability, input, asset và approval phù hợp.

## 13. Tài Liệu Liên Quan

- Main Happy Path Report: MAIN_HAPPY_PATH_REPORT.md
- Main Flow Progress: MAIN_FLOW_PROGRESS.md
- Main Flow Issues: MAIN_FLOW_ISSUES.md
- Architecture: ../ARCHITECTURE.md
- Workflow Contract: ../WORKFLOW_CONTRACT.md
- Workflow Stage Matrix: ../WORKFLOW_STAGE_MATRIX.md
- UI Workflows: ../UI_WORKFLOWS.md
- Domain Model: ../DOMAIN_MODEL.md
- Security: ../SECURITY.md
- 9Router: ../9ROUTER.md
- Troubleshooting: ../TROUBLESHOOTING.md
- CapCut Compatibility: ../CAPCUT_COMPATIBILITY.md

## 14. Glossary

| Từ | Nghĩa |
|---|---|
| Raw transcript | Transcript đầu vào, lưu nguyên trạng, không phải cleaned output. |
| Cleaned transcript | Transcript đã sửa lỗi ASR/dấu câu/format theo policy, đang chờ review. |
| Chunk | Đoạn transcript được tách để giới hạn token và timeout. |
| Artifact | Output có ID và metadata, có thể review/persist/truy vết. |
| Run lock | Cơ chế ngăn hai active run trùng nhau cho cùng scope. |
| Idempotency | Cùng request logic không tạo nhiều output trùng lặp. |
| Fail-closed | Khi không chắc chắn thì fail, không dùng raw/placeholder để giả thành công. |
| Stale | Artifact cũ không còn hợp lệ vì upstream đã thay đổi. |
| Approval gate | Điều kiện bắt buộc trước khi stage sau được mở khóa. |
