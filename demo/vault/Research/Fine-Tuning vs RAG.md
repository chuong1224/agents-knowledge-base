---
title: Fine-Tuning vs RAG
tags: [research]
summary: "Decision notes: when to tune weights vs retrieve context."
---

# Fine-Tuning vs RAG

Rule of thumb: **RAG for knowledge, fine-tuning for behavior.**

- Facts change → RAG (update the index, not the weights)
- Style, format, tool-calling reliability → fine-tune
- Both is common: tuned model + retrieved grounding

Cost math and eval design in [[Evaluation Harnesses]].
