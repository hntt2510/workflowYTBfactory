# Prompt Pipeline

Prompt templates are versioned under `packages/prompts/templates`.

Required flow:

1. Channel router
2. Transcript cleaner
3. Reference segmenter
4. Competitor DNA
5. Pattern synthesis
6. Originality gate
7. Idea Lab
8. Outline builder
9. Script writer
10. Retention reviewer
11. Fact reviewer
12. Scene planner
13. Shot planner
14. Visual router
15. Image prompt compiler
16. Video prompt compiler
17. TTS preparer
18. Continuity reviewer
19. Final QA

Each template requests strict JSON and should be paired with Zod validation before provider output is trusted.
