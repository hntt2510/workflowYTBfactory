# G01 workflow contract

New IPC-created projects use `setup.workflowContract = "preproduction"` and resolve only the canonical registry in `packages/domain/src/workflowRegistry.ts`.

| Mode | Reference / Research | Idea / Story Architecture | Script | First current stage |
| --- | --- | --- | --- | --- |
| Topic | not applicable without included references | applicable | applicable | Idea Lab |
| Existing Script | not applicable | not applicable | source script is already approved | Timing |
| Reference | applicable when transcript/reference is included | applicable after reference intake | applicable | Idea Lab after intake |

The canonical stages are registry-defined and progress counts only applicable, required stages. Legacy stage definitions live in `legacyWorkflowRegistry.ts`; they are used only to normalize and operate old projects. Missing `workflowContract` on loaded data is treated as `legacy` and no project files are deleted or rewritten during normalization.

New pre-production projects do not enter the TTS, voice, subtitle, FFmpeg, preview, QA, CapCut, stock, provider-image, or packaging journey. Those implementations remain available to legacy projects and advanced compatibility routes.
