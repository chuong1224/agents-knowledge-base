---
title: Transformer Architectures
tags: [research]
summary: "Attention, positional encodings and why decoder-only won."
---

# Transformer Architectures

Self-attention lets every token look at every other token in one hop, which is why transformers displaced RNNs: no recurrence bottleneck, full parallelism at train time.

Key design axes:
- Encoder-decoder vs **decoder-only** (GPT-style) — generation workloads pushed the field to decoder-only
- Positional encoding: sinusoidal → learned → RoPE
- Attention cost is O(n²) — see [[Long-Context Techniques]] for the workarounds

Related: [[Embedding Models]], [[Fine-Tuning vs RAG]].
