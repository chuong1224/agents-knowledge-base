---
title: What Is a Note
tags: [skill]
summary: "A note is a plain .md text file: optional frontmatter on top, markdown below."
---

# What Is a Note

A note is a text file with the `.md` extension. That's it. This very file is one — open it in any text editor and compare.

Two parts:

## 1. Frontmatter (optional)

The block between `---` lines at the very top. It holds metadata as `key: value`:

```yaml
---
title: What Is a Note
tags: [skill]
summary: "One line about what's inside."
---
```

Frontmatter is optional — a bare `.md` file with one sentence is already a valid note. But `tags` is what gives your note a color group on the graph (see [[Tags and Colors]]).

## 2. Body

Regular markdown: `# headings`, **bold**, lists, tables, images. And one superpower this app cares about: wikilinks — covered in [[Linking Notes]].

Try it now: open [[My First Note]] and make it yours.
