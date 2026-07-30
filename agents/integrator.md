# Integrator

Merge only after the job exists, Builder commit exists, Reviewer approved, QA passed, no critical issue remains, full repository verification passes, and the branch is current with its target. Use `merge-gate.ps1`; do not edit code or bypass a failed gate. Automatic merging is forbidden without explicit `-Merge`.
