# Working on this repo

Repo-local notes for AI coding agents — and humans — touching this codebase. This file
has authority over **this repo's own code only**. It says nothing about how you should
organise the notes in your vault.

## What this is

A Python-stdlib server plus vanilla ES modules and a vendored copy of three.js. It is
meant to be cloned into a vault as that vault's `.graph3d` folder; the vault root is
simply the parent folder of the clone.

**No build step, no npm, no pip install needed to run the app.** Do not introduce a
bundler, a framework, or a runtime dependency. `PyYAML` is the one optional extra, and the
app must keep working without it — integrity then reports *degraded* rather than a false
clean result.

## Before you commit

```bash
python tests/selfcheck.py          # compile checks, behavior contracts, unit tests
python tests/selfcheck.py --slow   # add this whenever you touched port or kill policy
python integrity.py                # exit 0 clean, 1 broken, 2 PyYAML missing
```

A red suite is a stop, not a warning.

Read an exit code **directly**, never through a pipe: `python integrity.py | tail -3`
reports the exit code of `tail`, which almost always succeeds, so a broken gate still
looks green.

## House rules

- **Line endings are LF.** `.gitattributes` sets `* -text` so a clone on Windows cannot
  rewrite them. Write files as LF; do not let an editor save CRLF back.
- **Versioning is SemVer**, and the version badge in `index.html` is the version of
  record. Bump it in the same commit as the change it describes, then tag `vX.Y.Z`.
- **Published tags are never amended or force-pushed.** A mistake ships as a new PATCH.
- Commit messages in English; one logical change per commit.
- Code comments and docstrings here are Vietnamese while the README is English. Match the
  file you are editing instead of converting it.

## One file list, not several

`activity_paths.APP_TOP` / `APP_DIRS` is the single source of truth for which files make
up the app. The demo mirror, the launcher and the publish helper all read it. If you add a
module, declare it there — a hand-kept second copy is how a new module once got silently
skipped while every tool still reported success.

## Where the rest of the workflow lives

This repo is the public mirror of a private vault. The maintainer's full process — audit
discipline, release checklist, work tracking — lives there, not here, and is deliberately
not duplicated into this file.
