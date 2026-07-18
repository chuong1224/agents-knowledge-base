---
title: Evaluation Harnesses
tags: [research]
summary: "Golden sets, LLM-as-judge, and regression gates for AI features."
---

# Evaluation Harnesses

If you can't measure it, you'll ship regressions with confidence.

- Golden question set per feature, versioned with the code
- LLM-as-judge for open-ended output; calibrate against human labels
- Run evals in CI like tests — block merges on regressions

Used by [[Project Atlas]] and [[Project Beacon]].
