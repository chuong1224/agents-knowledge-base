---
title: Prompt Engineering Patterns
tags: [research]
summary: "Reusable prompt structures that survive model upgrades."
---

# Prompt Engineering Patterns

Patterns that keep working across model generations:

- **Role + task + constraints + examples** — boring, effective
- Structured output: ask for JSON with a schema, validate, retry
- Decomposition beats one mega-prompt; chain small steps
- Few-shot examples are worth more than adjectives

Anti-patterns: prompt begging ("please please"), stacking 14 instructions nobody can follow. Related: [[Agent Memory Systems]], [[Evaluation Harnesses]].
