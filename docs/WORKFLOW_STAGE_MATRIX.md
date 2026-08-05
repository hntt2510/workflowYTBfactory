# Workflow Stage Matrix

| # | Stage | Dependency | Execution | Capability | Output | Current status |
|---:|---|---|---|---|---|---|
| 01 | Project Setup | None | manual_input | None | project.setup | Runtime Implemented |
| 02 | Reference Intake | Project Setup | manual_input | None | reference.draft | Runtime Implemented |
| 03 | Reference Validation | Reference Intake | local_deterministic | None | reference-set.validated | Runtime Verified |
| 04 | Transcript Cleaning | Reference Validation | provider_text | Text | transcript.cleaned | Runtime Implemented |
| 05 | Reference Segmentation | Transcript Cleaning | provider_text | Text | reference-segments | Blocked |
| 06 | Competitor DNA | Reference Segmentation | provider_text | Text | competitor-dna-card | Blocked |
| 07 | Opportunity Map | Competitor DNA | provider_text | Text | opportunity-map | Blocked |
| 08 | Idea Lab | Opportunity Map | provider_text | Text | idea-candidates | UI Only |
| 09 | Originality Review | Idea Lab | provider_text | Text | originality-review | Blocked |
| 10 | Research Source Intake | Originality Review | manual_input | None | research-sources | Not Implemented |
| 11 | Claim Map | Research Source Intake | provider_text | Text | claim-map | Blocked |
| 12 | Outline | Claim Map | provider_text | Text | outline | Blocked |
| 13 | Script | Outline | provider_text | Text | script | Blocked |
| 14 | Fact Review | Script | provider_text | Text | fact-review | Blocked |
| 15 | Retention Review | Fact Review | provider_text | Text | retention-review | Blocked |
| 16 | Scene Plan | Retention Review | provider_text | Text | scene-plan | Blocked |
| 17 | Shot Plan | Scene Plan | provider_text | Text | shot-plan | Blocked |
| 18 | Visual Routing | Shot Plan | local_deterministic | None | visual-routing | UI Only |
| 19 | Prompt Preparation | Visual Routing | provider_text | Text | visual-prompts | Blocked |
| 20 | Asset Acquisition | Prompt Preparation | provider_image | Image | asset | Blocked |
| 21 | Asset Review | Asset Acquisition | manual_input | None | asset.approved | UI Only |
| 22 | Voice Generation | Asset Review | provider_audio | Audio/TTS | voice-segment | UI Only |
| 23 | Subtitle Preparation | Voice Generation | local_deterministic | None | subtitles | Not Implemented |
| 24 | Timeline Assembly | Subtitle Preparation | local_deterministic | None | timeline | UI Only |
| 25 | Preview Render | Timeline Assembly | media_process | None | preview-video | Not Implemented |
| 26 | QA | Preview Render | local_deterministic | None | qa-report | UI Only |
| 27 | CapCut Draft | QA | export | None | capcut-draft | UI Only |
| 28 | Packaging Export | CapCut Draft | export | None | package-export | UI Only |

Every row has its own eligibility and approval gate. A screen grouping is never permission to merge runs or consume a draft, failed, rejected, stale, or unapproved upstream artifact.
