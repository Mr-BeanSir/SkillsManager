<p align="center">
  <img src="images/skills.png" alt="Skills Manager" width="980" />
</p>

<h1 align="center">Skills Manager</h1>

<p align="center">
  [<a href="README.md">中文</a>] - [<a href="README.en.md">English</a>]
</p>

<p align="center">
  Manage all Skills in one place, activate them per project with symlinks, and reduce disk usage, context noise, and token cost.
</p>

<p align="center">
  <a href="#why">Why</a> • <a href="#workflow">Workflow</a> • <a href="#run">Run</a> • <a href="#credits">Credits</a>
</p>

## Why

Skills Manager stores Skills once in managed local storage, then projects them into `.agents/skills`, `.codex/skills`, and other project targets only when needed.

- one stored snapshot per Skill
- projects are the only activation boundary
- enable creates symlinks
- disable removes symlinks

## Workflow

Create a `[Planning]` group for requirement, design, and task-breakdown Skills.

1. Create a `[Planning]` group
2. Add planning Skills to it
3. Enable the group when a project enters planning
4. Let Skills Manager create the symlinks
5. Disable the group when planning is done
6. Let Skills Manager remove those links

This keeps one reusable planning toolkit while preventing planning-only Skills from staying in live project context longer than needed.

## Stack

- Tauri 2
- React 18
- TypeScript
- Vite
- Rust
- SQLite

## Run

### Requirements

- Node.js 20+
- npm 10+
- Rust stable
- WebView2 Runtime on Windows

If Cargo is missing from the current shell:

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
```

### Install

```powershell
npm install
```

### Dev

```powershell
npm run tauri dev
```

### Verify

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## Credits

This project was built through full AI collaboration.

Thanks to `gpt-5.5`, `gpt-5.4`, `mimo-v2.5-pro`, `claude-sonnet-4-6`, and `su8.codex`.
