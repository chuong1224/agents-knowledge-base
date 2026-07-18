---
title: Retrieval-Augmented Generation
tags: [research]
summary: "RAG pipeline notes: chunking, retrieval, reranking, grounding."
---

# Retrieval-Augmented Generation

RAG bolts a search engine onto a language model so answers can cite live, private data instead of frozen weights.

## Pipeline

| Stage | Choices | Notes |
|---|---|---|
| Chunking | fixed, semantic, layout-aware | chunk ≈ retrieval unit |
| Embedding | see [[Embedding Models]] | store in a [[Vector Databases\|vector DB]] |
| Retrieval | dense, hybrid BM25+dense | hybrid wins on names/IDs |
| Rerank | cross-encoder | biggest quality jump per dollar |
| Generate | grounded prompt | cite sources, refuse when empty |

Failure modes: stale index, chunk boundaries splitting answers, retrieval winning on vibes not facts. Evaluate with a golden-question set before shipping.

Compare with [[Fine-Tuning vs RAG]]; used by [[Project Atlas]].
