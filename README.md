# Agents Knowledge Base

**A 3D cockpit for your markdown knowledge vault — and a live window into the AI agents working inside it.**

Point it at a folder of markdown notes (an Obsidian-style vault) and it serves a local web app: an interactive, synthwave-styled 3D force graph of every note, tag and attachment — with a built-in reader, full-text finder, tabbed workspace, and a layer no PKM tool has: **real-time visualization, replay and analytics of AI-agent activity** (Claude Code out of the box; any agent via a simple JSONL hook).

> Python stdlib server + vanilla ES modules + vendored three.js. **No pip install, no npm, no build step.**

## Features

### 🌌 The graph
- Force-directed 3D graph of notes, tags and attachments, colored by tag groups, with a bloom "neon" glow and adjustable intensity
- Degree-aware physics (hubs get room, leaves hug their hub), optional 🧲 cluster-magnet mode per color group, collision guard, smooth settling when filtering
- Two deliberate filter semantics: color groups *spotlight* (dim but keep context), tag/extension filters *declutter* (remove entirely)
- Accessibility: AA-contrast panel palette, keyboard-operable controls, respects `prefers-reduced-motion`

### 🤖 Agent activity, live on the graph
- A `PostToolUse` hook (Claude Code example below) logs every file operation an agent performs in the vault
- Events fire cinematic effects: comet chains along retrieval paths, three-phase "hyperspace jump" hops between notes, per-agent colors, dwell trails that linger like a starfield
- Retrieval chains are grouped and replayable; hot links glow in the agent's color
- ⏱ **Cockpit** — scrub through a full day of agent activity on a timeline (play/pause/speed), plus a dashboard: per-agent stats, hourly histogram, top notes
- 🔥 Heatmaps — recent-window and long-term cumulative access frequency; hot notes swell and glow

### 📖 Reading & finding
- Click a node → read the note in place (markdown-it): wikilinks resolve, image/video embeds, backlinks
- Folder-tree sidebar (drag to resize) + quick switcher `Ctrl+P`: file names, `#tags`, and diacritic-insensitive full-text search
- Workspace: multi-tab reading, ⧉ two-pane split, ☆ pinned notes, 🕘 reading history — all persisted across sessions

### 🖥 Multi-machine, self-healing
- Per-host activity journals live inside the vault → two machines syncing the same vault (OneDrive, Drive, Syncthing…) merge their histories automatically; no server needed on the second machine
- Single-instance server keyed by port: verifies health by boot id, auto-restarts when source changes, cleans up stale processes — and refuses to kill anything it cannot verify as its own
- Loopback only (`127.0.0.1`) — your vault is never exposed to the network

## Quickstart

Requirements: **Python 3.9+** and a modern browser. Primary platform is **Windows** (process management shells out to PowerShell); the server itself is cross-platform and mac/linux support is on the roadmap.

```bash
# clone INTO your vault as a dot-folder (keeps it invisible to your note tools)
git clone https://github.com/chuong1224/agents-knowledge-base "path/to/YourVault/.graph3d"
cd "path/to/YourVault/.graph3d"
python ensure_graph3d.py
```

That's it — the app opens at `http://127.0.0.1:8321`. The vault root is simply the parent folder of `.graph3d/`. Re-running `ensure_graph3d.py` is idempotent (reuses a healthy server, replaces a stale one). On Windows you can also double-click `Start-Graph3D.bat`.

## Hook up an agent

**Claude Code** — add to your vault's `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Read|Grep|Glob|Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "python \"$CLAUDE_PROJECT_DIR/.graph3d/log_activity.py\"",
            "shell": "bash",
            "async": true,
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

**Any other agent or script**: pipe the same hook-style JSON payload into `log_activity.py` and label the stream with `--agent "MyAgent"` — each agent gets a stable color on the graph. See the module docstring for the payload shape.

Remove the hook and the app still works fully — you just lose the live layer.

## Configuration

| What | Where |
|---|---|
| Tag → color groups | `TAG_COLORS` in `build_graph_data.py` (order = priority) + `GROUP_ORDER` in `src/state.js` |
| Folders excluded from the graph | `EXCLUDED_DIRS` in `build_graph_data.py` |
| Port | `python ensure_graph3d.py --port 9000` |
| Physics feel | constants in `physics()` in `src/graph.js` |
| Default neon intensity | `S.neon` in `src/state.js` |

The default tag taxonomy reflects the author's vault — moving it to a config file is the top roadmap item.

> **Note on language:** the UI is currently in Vietnamese (the author's working language). English i18n is on the roadmap.

## Tests

```bash
python tests/selfcheck.py        # ~3s: compile checks + behavior contracts + unit tests
python tests/selfcheck.py --slow # adds port/kill-policy integration tests (~16s)
```

The suite is designed to run with the app installed inside a real vault.

## Roadmap

- Config file for tag groups & colors (no code edits needed)
- Standalone mode (`--vault path`) without installing into the vault
- English UI / i18n
- Cross-platform process management (mac/linux)
- Demo vault + screenshots/GIF
- Semantic search for vaults that outgrow full-text

## Origin

This is the daily driver for the author's own agent-operated knowledge base: AI agents read and write the vault all day, and this cockpit is how that work is watched, replayed and measured. It has grown through 30+ versioned iterations — graph first, then reader, finder, cockpit and workspace — pair-programmed with Claude, with a contract-encoded test suite guarding against every regression that ever actually happened.

## License

[MIT](LICENSE)

---

# 🇻🇳 Tiếng Việt

**Buồng lái 3D cho vault ghi chú markdown — và cửa sổ realtime nhìn các AI agent đang làm việc bên trong.**

Trỏ vào một thư mục note markdown (vault kiểu Obsidian), app phục vụ giao diện web local: graph 3D synthwave toàn bộ note/tag/file, kèm panel đọc note, tìm kiếm full-text, workspace đa tab — và lớp đặc sản: **hiển thị realtime + replay + thống kê hoạt động AI agent** (Claude Code dùng ngay; agent khác qua hook JSONL đơn giản).

- **Cài đặt:** chỉ cần Python 3.9+ — clone vào vault thành thư mục `.graph3d`, chạy `python ensure_graph3d.py`, app mở tại `http://127.0.0.1:8321`. Không pip, không npm, không build. Windows có thể double-click `Start-Graph3D.bat`.
- **Graph:** physics co giãn theo degree, 🧲 gom cụm theo nhóm màu, chống chồng node, lọc tag / đuôi file / nhóm màu (spotlight vs declutter), heatmap tần suất truy cập, độ chói neon chỉnh được, hỗ trợ tiếp cận (AA, bàn phím, reduced-motion).
- **Agent:** hook `PostToolUse` của Claude Code (mẫu ở phần tiếng Anh) ghi mọi thao tác đọc/sửa → hiệu ứng sao chổi, cú nhảy siêu không gian giữa các note, chuỗi truy xuất replay được, thanh tua cả ngày + dashboard per-agent. Agent khác truyền `--agent "Tên"` là có màu riêng.
- **Đọc & tìm:** click node đọc note ngay (wikilink, ảnh, backlink), cây thư mục kéo-giãn, `Ctrl+P` tìm tên / `#tag` / nội dung không dấu, tab + 2 pane + ghim + lịch sử đọc (persist).
- **2 máy:** journal per-máy nằm trong vault — 2 máy sync chung vault (OneDrive/Drive/Syncthing) tự thấy lịch sử của nhau, máy thứ hai không cần chạy server.
- **Cấu hình:** nhóm màu tag ở `TAG_COLORS` (`build_graph_data.py`) + `GROUP_ORDER` (`src/state.js`); loại folder ở `EXCLUDED_DIRS`; đổi port bằng `--port`. Taxonomy mặc định đang theo vault của tác giả — tách ra file config là mục roadmap số một.
- **Test:** `python tests/selfcheck.py` (~3s; thêm `--slow` cho test port/kill ~16s).

Giấy phép [MIT](LICENSE).
