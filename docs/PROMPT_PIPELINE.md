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
8. Claim mapper
9. Outline builder
10. Script writer
11. Retention reviewer
12. Fact reviewer
13. Scene planner
14. Shot planner
15. Visual router
16. Image prompt compiler
17. Video prompt compiler
18. TTS preparer
19. Continuity reviewer
20. Final QA

Each template requests strict JSON and should be paired with Zod validation before provider output is trusted.

