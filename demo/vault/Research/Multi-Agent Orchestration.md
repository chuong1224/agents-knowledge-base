---
title: Multi-Agent Orchestration
tags: [research]
summary: "Coordinator patterns, shared state, and why simple beats clever."
---

# Multi-Agent Orchestration

Most multi-agent failures are coordination failures, not intelligence failures.

- Single coordinator + specialist workers is the pattern that ships
- Shared state belongs in files/DB, not in chat history
- Give agents non-overlapping write scopes — one stream, one file
- Log every action; replay beats debugging from memory

See [[Agent Memory Systems]] and the activity-logging idea behind [[Project Atlas]].
