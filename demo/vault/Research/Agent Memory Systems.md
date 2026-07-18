---
title: Agent Memory Systems
tags: [research]
summary: "Working vs episodic vs semantic memory for LLM agents."
---

# Agent Memory Systems

Agents forget everything between sessions unless you build memory deliberately.

1. **Working memory** — the context window; manage with summarization
2. **Episodic** — logs of what happened; enables replay and audits
3. **Semantic** — distilled facts in files or a knowledge base, like this vault

The knowledge-base-as-memory pattern is exactly what [[Project Atlas]] explores: agents read and write markdown notes, and the vault becomes shared long-term memory. See [[Multi-Agent Orchestration]] for coordination.
