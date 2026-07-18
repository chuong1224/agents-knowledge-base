---
title: Vector Databases
tags: [research]
summary: "HNSW vs IVF, metadata filtering, when a flat index is enough."
---

# Vector Databases

Under ~1M vectors a flat numpy index is often fine — measure before adopting infrastructure.

- **HNSW**: graph-based, great recall/latency, memory hungry
- **IVF+PQ**: compressed, cheap at scale, tune nprobe
- Metadata filtering is where products differentiate; pre-filter vs post-filter changes recall

Feeds [[Retrieval-Augmented Generation]].
