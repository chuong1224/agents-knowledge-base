---
title: Embedding Models
tags: [research]
summary: "Choosing and evaluating text embedding models."
---

# Embedding Models

Embeddings turn text into vectors where distance ≈ meaning. Choosing one: check MTEB-style retrieval scores on YOUR domain, mind the max sequence length, and remember dimension × count = RAM.

Asymmetric search (short query vs long doc) benefits from instruction-tuned embedders. Downstream: [[Vector Databases]], [[Retrieval-Augmented Generation]].
