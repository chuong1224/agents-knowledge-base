---
title: SQL Window Functions
tags: [skill]
summary: "ROW_NUMBER, LAG/LEAD, running totals — the greatest hits."
---

# SQL Window Functions

Window functions compute per-row aggregates without collapsing rows. The three I reach for weekly: `ROW_NUMBER` for dedupe, `LAG` for deltas, `SUM() OVER (ORDER BY …)` for running totals.
