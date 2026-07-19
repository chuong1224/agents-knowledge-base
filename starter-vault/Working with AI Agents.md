---
title: Working with AI Agents
tags: [research]
summary: "Point an AI agent at this folder and this cockpit shows you everything it does — live."
---

# Working with AI Agents

This is the part no other note tool has, and the reason this cockpit exists.

Because your vault is plain files, an AI agent (like **Claude Code**) can work inside it: read your notes to answer questions, write new notes, maintain links and indexes. The vault becomes the agent's **long-term memory** — and your shared workspace with it.

The cockpit makes that work *visible*:

- Every file an agent reads or edits fires a **live effect** on the graph — comet trails and hops between notes
- The **retrieval chains** panel groups actions into replayable chains
- The **timeline** lets you scrub through a full day of agent work; the dashboard counts per-agent activity and hot notes
- Long-term **heatmaps** show which notes actually get used

## Hooking up Claude Code

Add the `PostToolUse` hook from the [project README](https://github.com/chuong1224/agents-knowledge-base#hook-up-an-agent) to `.claude/settings.json` inside your vault. Any other agent or script can join with one JSONL writer and its own `--agent` name and color.

No agent yet? Everything else still works — you just fly the graph solo for now.
