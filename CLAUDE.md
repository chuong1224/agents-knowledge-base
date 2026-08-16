# Working on this repo

Repo-local notes for AI coding agents — and humans — touching this codebase. This file
has authority over **this repo's own code only**. It says nothing about how you should
organise the notes in your vault.

## What this is

A Python-stdlib server plus vanilla ES modules and a vendored copy of three.js. It is meant
to be cloned into a vault as that vault's `.graph3d` folder. The app **starts** on the
parent folder of the clone, but since v1.59.0 that is only the default: the user can switch
to any vault root on the machine from the UI, so never assume the served vault is the
parent of `.graph3d/`. Read the active root from the server rather than deriving it.

**No build step, no npm, no pip install needed to run the app.** Do not introduce a
bundler, a framework, or a runtime dependency. `PyYAML` is the one optional extra, and the
app must keep working without it — integrity then reports *degraded* rather than a false
clean result.

## Before you commit

```bash
python tests/selfcheck.py          # compile checks, behavior contracts, unit tests
python tests/selfcheck.py --slow   # add this whenever you touched port or kill policy
python tools/test_publish_from_vault.py  # add this whenever you touched the publish gate
```

A red suite is a stop, not a warning.

A green one is not automatically a measured one. Each suite is labelled `PASS`,
`PASS*`, `THIEU-LIB` or `FAIL`, and the summary counts every item a suite declared it
could not measure. `ALL PASS · BO QUA n muc` means the *rest* is green — a run without
`--slow` always has at least one such item, and a clone outside a vault has several.
`THIEU-LIB` means the interpreter is missing a library: the measurement is broken, not
the code, so install into the interpreter the run names instead of editing anything.
A suite that skips something must say so on a line starting with `[SKIP] ` (leading
whitespace is fine); contract 2m rejects the older bare `SKIP` marker, which nothing
could count.

And a suite can also skip **without saying anything at all** — `if not condition: pass`
prints nothing, deleted assertions print nothing. So from v1.60.0 the runner stops asking
and starts measuring: it counts the assertions each item actually ran, stores the count in
a per-machine mark outside this repo, and compares on the next run. Fewer assertions, or a
whole suite gone from disk, prints `TUT VUNG PHU` and exits 1 **even though every suite
says `ALL PASS`**. That is not a bug in the report; it is the report working.

Never conclude from the text alone. `ALL PASS` can accompany exit 1, and only the exit
code is authoritative. If the drop is deliberate, lower the mark on purpose and on the
record: `python tests/selfcheck.py --chap-nhan "why"`. Never silence it any other way.
Contract 2o rejects a new suite that scores itself without printing any `PASS`/`FAIL`
label, because such a suite can never be measured at all.

The maintainer's post-commit denylist audit must reuse the publisher's exact scanner:
`python tools/publish_from_vault.py --src "<path-to-vault>/.graph3d" --scan-only`.
Do not recreate it with `git grep`: different case and binary rules once made the two
gates contradict each other.

Read an exit code **directly**, never through a pipe: `python tests/selfcheck.py | tail -3`
reports the exit code of `tail`, which almost always succeeds, so a broken gate still
looks green. Do not run `python integrity.py` from a standalone source clone: the app
would treat the clone's parent as the vault and audit neighbouring folders. Selfcheck
already runs the integrity regression; run the CLI itself only from an installed
`.graph3d` inside the vault you intend to audit.

## House rules

- **Line endings are LF.** `.gitattributes` sets `* -text` so a clone on Windows cannot
  rewrite them. Write files as LF; do not let an editor save CRLF back.
- **Versioning is SemVer**, and the version badge in `index.html` is the version of
  record. Bump it in the same commit as the change it describes, then tag `vX.Y.Z`.
- **Published tags are never amended or force-pushed.** A mistake ships as a new PATCH.
- Commit messages in English; one logical change per commit.
- Code comments and docstrings here are Vietnamese; the README and this file are English,
  and the README additionally carries a full Vietnamese section at the end. Match the file
  and the section you are editing instead of converting it, and keep both halves of the
  README in step when you change what the app claims to do.
- The UI ships in English and Vietnamese. A user-visible string needs both locales in
  `src/i18n.js`, and `tests/test_i18n.py` enforces it: the two dictionaries must carry the
  same key set, every `tr('key')` and `data-i18n*` attribute must resolve, and a `{placeholder}`
  present in one locale must be present in the other.

## One file list, not several

`activity_paths.APP_TOP` / `APP_DIRS` is the single source of truth for which files make
up the app. The demo mirror, the launcher and the publish helper all read it. If you add a
module, declare it there — a hand-kept second copy is how a new module once got silently
skipped while every tool still reported success.

## Where the rest of the workflow lives

This repo is the public mirror of a private vault. The maintainer's full process — audit
discipline, release checklist, work tracking — lives there, not here, and is deliberately
not duplicated into this file.
