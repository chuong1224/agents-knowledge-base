---
title: Tags and Colors
tags: [skill]
summary: "Tags in frontmatter put notes into color groups on the graph."
---

# Tags and Colors

Add tags in the frontmatter:

```yaml
tags: [research]
```

Out of the box, these tags map to color groups on the 3D graph:

| Tag | Color group | Good for |
|---|---|---|
| `research` | green | things you're studying |
| `skill` | purple | how-to notes, snippets |
| `personal` | pink | life stuff |
| `vault-operation` | red | notes about maintaining the vault itself |
| `index` | white | navigation hubs ([[Folders and Hubs]]) |
| *(anything else / none)* | neutral | everything else |

Rules of thumb:

- One or two tags per note is plenty — tags are for **broad areas**, links are for specifics
- Untagged is fine; the note simply joins the neutral group
- When your own areas emerge ("cooking", "clients", …), you can remap the colors: `TAG_COLORS` in `build_graph_data.py` — but don't touch that until the defaults feel tight

Try the exercise at the bottom of [[My First Note]] to see a color flip live.
