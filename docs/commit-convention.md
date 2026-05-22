# Commit 提交规范

本项目使用 [Changesets](https://github.com/changesets/changesets) 管理版本和 changelog。Commit 信息本身不强制格式，但建议使用 **emoji 前缀** 让提交历史更易读。

## Commit 信息格式

```
<emoji> <简短描述>

[可选：详细说明为什么做这个变更]
```

### 示例

```
✨ 设置页面新增应用更新功能

从 GitHub Releases 检测新版本，下载安装包并静默安装。
```

```
🐛 修复切换语言后部分文案未刷新
```

```
♻️ 设置页面重构为左侧导航布局
```

```
🔥 移除未使用的 DirectoriesPage 及相关代码
```

## Emoji 速查表

### 功能类

| Emoji | 说明 |
|-------|------|
| ✨ | 新功能 |
| 🐛 | 修复 Bug |
| 🚑️ | 紧急修复 |
| ♻️ | 重构（非新功能、非修复） |
| ⚡️ | 性能优化 |
| 🩹 | 小修补（非 Bug） |

### 工程类

| Emoji | 说明 |
|-------|------|
| 📝 | 文档变更 |
| 💄 | 代码风格（不影响逻辑） |
| ✅ | 添加或修改测试 |
| 🔧 | 构建/工具/依赖等杂项 |
| 👷 | CI 配置变更 |
| 🏗️ | 构建系统变更 |
| 📦️ | 依赖更新 |

### 资源类

| Emoji | 说明 |
|-------|------|
| 🔥 | 删除代码或文件 |
| 🌐 | 国际化 (i18n) |
| 🏷️ | TypeScript 类型定义 |
| 🔒️ | 安全相关 |
| 🚨 | 修复 linter/compiler 警告 |
| ✏️ | 修正拼写错误 |

## Changesets 使用规范

### 什么时候需要添加 changeset

| 场景 | 需要 changeset |
|------|---------------|
| 新功能 | ✅ `minor` |
| Bug 修复 | ✅ `patch` |
| 破坏性变更 | ✅ `major` |
| 文档/注释/测试 | ❌ |
| 代码风格调整 | ❌ |
| CI/构建配置 | ❌ |
| 内部重构（不改 API） | ❌ |

### 如何添加 changeset

```bash
npx changeset
```

按照提示选择：
1. **版本类型**：`patch` / `minor` / `major`
2. **变更摘要**：一句话描述这次变更（会出现在 CHANGELOG.md 中）

### changeset 文件格式

生成的文件位于 `.changeset/xxx.md`：

```markdown
---
"skills-manager": minor
---

设置页面新增应用自动更新功能，支持从 GitHub Releases 检测并安装更新。
```

### 写好 changeset 摘要

- 用中文或英文均可，保持团队一致
- 说明**用户能感知到的变化**，而不是内部实现细节
- 好的例子：`新增应用自动更新功能`
- 不好的例子：`添加了 updater.rs 模块和相关 Tauri command`

## 发布流程

```
开发 → 添加 changeset → 合并到 main
                            ↓
                    CI 自动创建 "Version Packages" PR
                            ↓
                    合并 PR → 自动 bump 版本 + 更新 CHANGELOG
                            ↓
                    CI 自动创建 GitHub Release (tag)
```

1. 开发时在 commit 中附带 changeset 文件
2. 合并到 `main` 后，`changesets/action` 自动创建 "Version Packages" PR
3. 审查并合并该 PR，版本号自动更新，CHANGELOG 自动生成
4. 合并后 CI 自动打 tag 并创建 GitHub Release

## 完整工作流示例

```bash
# 1. 开发功能
git checkout -b feat/auto-update

# 2. 编码...
# 3. 添加 changeset
npx changeset
# 选择 minor，输入摘要：新增应用自动更新功能

# 4. 提交
git add .
git commit -m "✨ 新增应用自动更新功能"

# 5. 推送并创建 PR
git push origin feat/auto-update

# 6. 合并到 main 后，CI 自动处理版本发布
```
