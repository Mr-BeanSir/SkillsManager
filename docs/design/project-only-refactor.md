# Skills Manager Project-Only 架构重构设计

## 文档版本

- 创建日期：2026-05-18
- 最后更新：2026-05-18
- 状态：设计阶段

## 一、重构目标

### 1.1 核心问题

当前 global/custom/project 三层架构存在以下问题：

1. **逻辑复杂度高**：三种 link mode 的状态管理和 reconcile 逻辑难以维护
2. **多目录维护负担**：不同 CLI 需要维护多个目录，增加系统复杂度
3. **隐式激活风险**：global mode 可能导致 skills 在非预期的上下文中生效

### 1.2 重构原则

- **极度简单**：状态清晰，无隐式行为
- **project-only**：project 是唯一的 skill 生效边界
- **下载与启用分离**：下载 skill 不创建任何 symlink
- **可维护性优先**：减少状态组合，简化 reconcile 逻辑

### 1.3 核心变化

| 概念 | 旧架构 | 新架构 |
|------|--------|--------|
| skill 生效范围 | global/custom/project 三选一 | 仅 project |
| 下载行为 | 根据 link_mode 可能创建 symlink | 仅存储到 central store |
| symlink 目标 | home 目录 + custom directories + projects | 仅 projects |
| groups | 跨 project 共享，关联 project_roots | 全局定义，project-scoped 使用 |
| custom_directories | 独立概念 | 合并到 cli_targets |

## 二、核心概念定义

### 2.1 Project（项目）

**定义**：一个文件系统目录，通常是一个代码仓库的根目录。

**特征**：
- Project 是 skill 生效的唯一边界
- 一个 project = 一个文件系统路径
- 用户通过 UI 手动注册和管理 projects
- 同一时间可以有多个 active projects

**示例**：
```
/home/user/my-react-app/     ← Project A
/home/user/backend-service/  ← Project B
```

### 2.2 Skill Store（技能仓库）

**定义**：统一的 skill 存储位置，所有下载的 skills 都存储在这里。

**路径**：
```
AppData/SkillsManager/managed-skills/
  ├── grill-with-docs-499b7424/
  ├── react-skill-a1b2c3d4/
  └── ...
```

**特征**：
- 下载 skill 仅存储到 skill store
- 下载不创建任何 symlink
- Skill store 是 symlink 的源（source）

### 2.3 Group（技能组）

**定义**：一组 skills 的集合，用于快速批量管理。

**作用域**：
- Group 定义是全局的（可复用）
- Group 的启用/禁用状态是 project-scoped 的

**示例**：
```
Global Group Definitions:
  "frontend" → [react-skill, typescript-skill, eslint-skill]
  "backend" → [nodejs-skill, postgres-skill]

Project A:
  - 使用 group "frontend"（enabled）
  - react-skill: enabled
  - typescript-skill: disabled（单独禁用）

Project B:
  - 使用 group "frontend"（enabled）
  - 所有 skills: enabled
```

### 2.4 CLI Target（CLI 目标路径）

**定义**：预定义的相对路径模板，表示 CLI 工具查找 skills 的位置。

**特征**：
- 全局定义的路径模板库
- 存储相对路径字符串（如 `.agents/skills`）
- 用户可以添加自定义 cli_target
- Project 从中选择需要的 targets

**示例**：
```
Global CLI Targets:
  - .agents/skills
  - .codex/skills
  - tools/skills（用户自定义）

Project A 选择:
  - .agents/skills
  - .codex/skills
```

### 2.5 Symlink Projection（符号链接投影）

**定义**：Project 中的 symlinks 是 skill 状态的"投影"，而不是真实状态。

**原则**：
- Skill store 是"源"（source）
- Project/.agents/skills/ 是"投影"（projection）
- 真实状态存储在数据库中
- Symlinks 可以随时通过 reconcile 重建

**投影规则**：
```
IF project_skill.enabled = true
AND project_cli_target exists
THEN create symlink:
  project_path/cli_target_path/skill_name → skill_store/managed_dir_name
```

## 三、状态模型

### 3.1 Skill 启用状态

在 project 中，每个 skill 有一个 `enabled` 布尔值：

```
project_skills:
  - skill_id: react-skill
  - project_id: project-a
  - enabled: true
```

**不是"添加/移除"模型，而是"启用/禁用"模型。**

### 3.2 Skill 来源追踪

一个 skill 可以通过多种方式被添加到 project：

1. **直接添加**：用户在 project 中直接选择 skill
2. **通过 group**：用户启用包含该 skill 的 group

**来源不影响 enabled 状态，只影响 UI 显示。**

### 3.3 启用/禁用行为矩阵

#### 场景 1：Skill 同时来自 direct 和 group

```
Project A:
  - 直接添加: react-skill (enabled)
  - 启用 group "frontend": [react-skill, typescript-skill]
  
实际状态:
  - react-skill: enabled, sources: [direct, group:frontend]
  - typescript-skill: enabled, sources: [group:frontend]
```

**操作：禁用 react-skill**
- `react-skill.enabled = false`
- 在 UI 中，direct 和 group 视图都显示为 disabled

**操作：启用 react-skill**
- `react-skill.enabled = true`
- 在 UI 中，direct 和 group 视图都显示为 enabled

#### 场景 2：禁用整个 group

```
Project A:
  - 直接添加: react-skill (enabled)
  - 启用 group "frontend": [react-skill, typescript-skill]
```

**操作：禁用 group "frontend"**
- `project_groups.enabled = false`（只标记 group 状态）
- `react-skill.enabled` 不变（仍然 enabled，因为有 direct 来源）
- `typescript-skill.enabled = false`（只有 group 来源，所以禁用）

#### 场景 3：在 group 视图中禁用单个 skill

```
用户在 Project A 的 UI 中看到：
  Group "frontend" [enabled]
    ├─ react-skill [enabled]
    └─ typescript-skill [enabled]
```

**操作：点击禁用 react-skill**
- `react-skill.enabled = false`（在 Project A 中）
- Group "frontend" 在 Project A 中仍然是 attached 的
- 这个禁用只影响 Project A，不影响其他 projects

## 四、数据库设计

### 4.1 新增表

#### `projects` 表

存储用户注册的项目。

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (path)
);
```

**字段说明**：
- `id`: 项目唯一标识
- `name`: 用户定义的项目名称（可修改）
- `path`: 项目根目录的绝对路径（唯一）
- `created_at`: 创建时间
- `updated_at`: 最后更新时间

#### `project_skills` 表

存储 project 中 skill 的启用状态。

```sql
CREATE TABLE IF NOT EXISTS project_skills (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, skill_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_skills_project_id ON project_skills(project_id);
CREATE INDEX IF NOT EXISTS idx_project_skills_skill_id ON project_skills(skill_id);
```

**字段说明**：
- `enabled`: 1 = enabled, 0 = disabled
- 唯一约束确保同一 project 中不会重复添加同一 skill

#### `project_groups` 表

存储 project 使用哪些 groups 及其启用状态。

```sql
CREATE TABLE IF NOT EXISTS project_groups (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, group_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES skill_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_groups_project_id ON project_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_group_id ON project_groups(group_id);
```

**字段说明**：
- `enabled`: 整个 group 在该 project 中的启用状态
- 禁用 group 不会直接修改 `project_skills.enabled`，而是在 reconcile 时计算

#### `project_cli_targets` 表

存储 project 选择使用哪些 cli_targets。

```sql
CREATE TABLE IF NOT EXISTS project_cli_targets (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  cli_target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, cli_target_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (cli_target_id) REFERENCES cli_targets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_cli_targets_project_id ON project_cli_targets(project_id);
```

**字段说明**：
- 记录 project 选择的 cli_targets
- 删除 project 时级联删除

### 4.2 修改表

#### `skills` 表修改

**删除字段**：
- `link_mode`（不再需要 global/custom/project 区分）

**保留字段**：
- 所有其他字段保持不变
- `id`, `name`, `description`, `source_type`, `source_ref`, `skill_path`
- `managed_dir_name`, `installed_version`, `installed_hash`
- `latest_version`, `latest_hash`, `update_available`
- `created_at`, `updated_at`, `last_update_check_at`

```sql
-- 迁移时需要执行
ALTER TABLE skills DROP COLUMN link_mode;
```

#### `skill_groups` 表修改

**保持不变**：
- Group 定义仍然是全局的
- 不添加 `project_id` 字段
- Group 的 project-scoped 状态通过 `project_groups` 表管理

```sql
-- 无需修改
CREATE TABLE IF NOT EXISTS skill_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name)
);
```

#### `skill_group_skills` 表修改

**保持不变**：
- 继续记录 group 包含哪些 skills
- 这是 group 的全局定义

```sql
-- 无需修改
CREATE TABLE IF NOT EXISTS skill_group_skills (
  group_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, skill_id),
  FOREIGN KEY (group_id) REFERENCES skill_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);
```

#### `cli_targets` 表修改

**修改字段**：
- 删除 `home_directory_name` 字段（不再扫描 home 目录）
- 删除 `skills_subpath` 字段（改为存储完整相对路径）
- 添加 `relative_path` 字段（存储相对路径字符串）

```sql
-- 新的 cli_targets 表结构
CREATE TABLE IF NOT EXISTS cli_targets (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  is_common INTEGER NOT NULL DEFAULT 0 CHECK (is_common IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (relative_path)
);

-- 默认数据
INSERT INTO cli_targets (id, display_name, relative_path, is_common)
VALUES 
  ('agents-skills', 'Agents Skills', '.agents/skills', 1),
  ('codex-skills', 'Codex Skills', '.codex/skills', 1)
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  relative_path = excluded.relative_path,
  is_common = excluded.is_common,
  updated_at = CURRENT_TIMESTAMP;
```

**字段说明**：
- `relative_path`: 相对于 project 根目录的路径（如 `.agents/skills`）
- `is_common`: 是否在 UI 中作为"常用"显示
- 唯一约束确保路径不重复

### 4.3 删除表

以下表在新架构中不再需要：

```sql
DROP TABLE IF EXISTS skill_selected_targets;
DROP TABLE IF EXISTS custom_directories;
DROP TABLE IF EXISTS skill_group_project_roots;
DROP TABLE IF EXISTS project_roots;
DROP TABLE IF EXISTS project_targets;
DROP TABLE IF EXISTS skill_links;
```

**删除原因**：
- `skill_selected_targets`: custom mode 专用，不再需要
- `custom_directories`: 已合并到 cli_targets
- `skill_group_project_roots`: group 不再跨 project 关联
- `project_roots`: 被 `projects` 表替代
- `project_targets`: 被 `project_cli_targets` 表替代
- `skill_links`: symlink 状态不再持久化（改为动态计算）

## 五、核心流程设计

### 5.1 Skill 生命周期

#### 5.1.1 下载 Skill

**流程**：
```
用户在 Discover 页面选择 skill
  ↓
下载到 skill store (managed-skills/<name>-<hash>/)
  ↓
插入/更新 skills 表
  ↓
完成（不创建任何 symlink）
```

**数据变化**：
```sql
INSERT INTO skills (id, name, source_type, source_ref, ...)
VALUES (...);
```

**关键点**：
- 下载不会自动添加到任何 project
- 下载不会创建任何 symlink
- 用户需要手动将 skill 添加到 project

#### 5.1.2 添加 Skill 到 Project

**流程**：
```
用户进入 Project 编辑页
  ↓
从已下载的 skills 列表中选择
  ↓
添加到 project_skills 表（enabled = true）
  ↓
触发 reconcile（可选，如果开关开启）
  ↓
创建 symlinks
```

**数据变化**：
```sql
INSERT INTO project_skills (project_id, skill_id, enabled)
VALUES ('project-a', 'skill-1', 1);
```

**Symlink 创建**：
```
对于 project 选择的每个 cli_target:
  IF project_path/parent_dir/ 存在
  THEN 创建 project_path/cli_target_path/
       创建 symlink: skill_name → skill_store/managed_dir_name
  ELSE 跳过（父目录不存在）
```

#### 5.1.3 启用/禁用 Skill

**禁用 Skill**：
```
用户在 Project 中禁用 skill
  ↓
UPDATE project_skills SET enabled = 0
  ↓
删除该 skill 的所有 symlinks
```

**启用 Skill**：
```
用户在 Project 中启用 skill
  ↓
UPDATE project_skills SET enabled = 1
  ↓
创建该 skill 的 symlinks
```

**数据变化**：
```sql
UPDATE project_skills 
SET enabled = 0, updated_at = CURRENT_TIMESTAMP
WHERE project_id = 'project-a' AND skill_id = 'skill-1';
```

#### 5.1.4 删除 Skill（从 Store）

**流程**：
```
用户删除 skill
  ↓
删除所有 project_skills 记录（级联）
  ↓
删除所有 skill_group_skills 记录（级联）
  ↓
删除 managed-skills/ 目录
  ↓
删除 skills 表记录
  ↓
清理所有相关 symlinks
```

**影响范围**：
- 所有使用该 skill 的 projects 的 symlinks 被删除
- 所有包含该 skill 的 groups 自动移除该 skill

#### 5.1.5 更新 Skill

**流程**：
```
用户触发更新
  ↓
下载新版本到临时目录
  ↓
验证 SKILL.md
  ↓
替换 managed-skills/<name>-<hash>/ 目录
  ↓
更新 skills 表（version, hash）
  ↓
Symlinks 自动指向新版本（路径未变）
```

**关键点**：
- Symlink 路径不变，因为 managed_dir_name 不变
- 不需要重建 symlinks

### 5.2 Group 生命周期

#### 5.2.1 创建 Group

**流程**：
```
用户创建 group "frontend"
  ↓
插入 skill_groups 表
  ↓
进入 group 编辑页
  ↓
选择 skills 添加到 group
  ↓
插入 skill_group_skills 记录
```

**数据变化**：
```sql
INSERT INTO skill_groups (id, name) VALUES ('group-1', 'frontend');
INSERT INTO skill_group_skills (group_id, skill_id) 
VALUES ('group-1', 'skill-1'), ('group-1', 'skill-2');
```

#### 5.2.2 Project 使用 Group

**流程**：
```
用户在 Project A 中启用 group "frontend"
  ↓
插入 project_groups 记录（enabled = true）
  ↓
对于 group 中的每个 skill:
    IF project_skills 中不存在该 skill
    THEN 插入 project_skills（enabled = true）
  ↓
触发 reconcile
  ↓
创建 symlinks
```

**数据变化**：
```sql
INSERT INTO project_groups (project_id, group_id, enabled)
VALUES ('project-a', 'group-1', 1);

-- 自动添加 group 中的 skills
INSERT INTO project_skills (project_id, skill_id, enabled)
SELECT 'project-a', skill_id, 1
FROM skill_group_skills
WHERE group_id = 'group-1'
  AND skill_id NOT IN (
    SELECT skill_id FROM project_skills WHERE project_id = 'project-a'
  );
```

#### 5.2.3 禁用 Group

**流程**：
```
用户在 Project A 中禁用 group "frontend"
  ↓
UPDATE project_groups SET enabled = 0
  ↓
对于 group 中的每个 skill:
    IF skill 只来自该 group（不是直接添加）
    THEN UPDATE project_skills SET enabled = 0
  ↓
删除相关 symlinks
```

**数据变化**：
```sql
UPDATE project_groups 
SET enabled = 0, updated_at = CURRENT_TIMESTAMP
WHERE project_id = 'project-a' AND group_id = 'group-1';

-- 禁用只来自该 group 的 skills
UPDATE project_skills
SET enabled = 0, updated_at = CURRENT_TIMESTAMP
WHERE project_id = 'project-a'
  AND skill_id IN (SELECT skill_id FROM skill_group_skills WHERE group_id = 'group-1')
  AND skill_id NOT IN (
    -- 检查是否有其他 enabled 的 groups 也包含该 skill
    SELECT sgs.skill_id 
    FROM skill_group_skills sgs
    JOIN project_groups pg ON sgs.group_id = pg.group_id
    WHERE pg.project_id = 'project-a' 
      AND pg.enabled = 1 
      AND pg.group_id != 'group-1'
  );
```

**关键点**：
- 如果 skill 同时被直接添加，或被其他 enabled group 包含，则不禁用

#### 5.2.4 删除 Group

**流程**：
```
用户删除 group "frontend"
  ↓
删除所有 project_groups 记录（级联）
  ↓
删除所有 skill_group_skills 记录（级联）
  ↓
删除 skill_groups 记录
  ↓
project_skills 记录保持不变（skills 仍然存在于 projects 中）
```

**关键点**：
- 删除 group 不会删除 skills
- 删除 group 不会从 projects 中移除 skills
- Skills 继续以"直接添加"的方式存在

### 5.3 Project 生命周期

#### 5.3.1 创建 Project

**流程**：
```
用户添加 project
  ↓
选择项目根目录
  ↓
输入项目名称
  ↓
插入 projects 表
  ↓
选择默认 cli_targets（可选）
  ↓
插入 project_cli_targets 记录
```

**数据变化**：
```sql
INSERT INTO projects (id, name, path)
VALUES ('project-1', 'My React App', '/home/user/my-react-app');

-- 添加默认 cli_target
INSERT INTO project_cli_targets (project_id, cli_target_id)
VALUES ('project-1', 'agents-skills');
```

#### 5.3.2 配置 CLI Targets

**流程**：
```
用户在 Project 设置中选择 cli_targets
  ↓
插入/删除 project_cli_targets 记录
  ↓
触发 reconcile
  ↓
创建/删除对应的 symlinks
```

**添加 CLI Target**：
```sql
INSERT INTO project_cli_targets (project_id, cli_target_id)
VALUES ('project-1', 'codex-skills');
```

**移除 CLI Target**：
```sql
DELETE FROM project_cli_targets
WHERE project_id = 'project-1' AND cli_target_id = 'codex-skills';

-- 同时删除该 target 下的所有 symlinks
-- 删除 project_path/.codex/skills/ 下的所有 managed symlinks
```

#### 5.3.3 删除 Project

**流程**：
```
用户删除 project
  ↓
删除所有 project_skills 记录（级联）
  ↓
删除所有 project_groups 记录（级联）
  ↓
删除所有 project_cli_targets 记录（级联）
  ↓
删除所有 symlinks
  ↓
删除 projects 记录
  ↓
不删除文件系统中的项目目录
```

**关键点**：
- 只删除 Skills Manager 的管理数据
- 不删除实际的项目目录
- Skills 保留在 skill store 中

### 5.4 Symlink 管理

#### 5.4.1 创建 Symlink

**算法**：
```
FOR each project IN projects:
  FOR each cli_target IN project_cli_targets:
    target_path = project.path + cli_target.relative_path
    parent_dir = dirname(target_path)
    
    IF NOT exists(parent_dir):
      SKIP (父目录不存在)
    
    IF NOT exists(target_path):
      CREATE directory(target_path)
    
    FOR each skill IN project_skills WHERE enabled = true:
      link_path = target_path + skill.name
      source_path = skill_store + skill.managed_dir_name
      
      IF NOT exists(link_path):
        CREATE symlink(link_path → source_path)
```

**示例**：
```
Project: /home/user/my-app
CLI Target: .agents/skills

检查: /home/user/my-app/.agents/ 是否存在
  → 存在: 继续
  → 不存在: 跳过此 cli_target

创建: /home/user/my-app/.agents/skills/ (如果不存在)

创建 symlinks:
  /home/user/my-app/.agents/skills/react-skill 
    → AppData/SkillsManager/managed-skills/react-skill-a1b2c3d4/
  /home/user/my-app/.agents/skills/typescript-skill
    → AppData/SkillsManager/managed-skills/typescript-skill-x9y8z7w6/
```

#### 5.4.2 删除 Symlink

**清理策略**：

**场景 A：禁用 skill**
```
删除该 skill 在所有 cli_targets 下的 symlinks
```

**场景 B：移除 cli_target**
```
删除该 cli_target 路径下的所有 managed symlinks
保留非 managed symlinks（用户手动创建的）
```

**场景 C：删除 skill（从 store）**
```
删除所有 projects 中该 skill 的 symlinks
```

**安全检查**：
```
BEFORE delete symlink:
  IF is_symlink(path):
    target = readlink(path)
    IF target.startswith(skill_store_path):
      DELETE symlink
    ELSE:
      SKIP (不是 managed symlink)
  ELSE:
    SKIP (不是 symlink)
```

### 5.5 Reconcile 机制

#### 5.5.1 Reconcile 目标

**目的**：使文件系统 symlinks 与数据库状态保持一致。

**原则**：
- 幂等：多次执行结果相同
- 可恢复：不依赖内存状态
- 不怕中断：可以随时重新执行

#### 5.5.2 Reconcile 算法

```
FUNCTION reconcile_project(project_id):
  // 1. 计算期望状态
  expected_links = []
  
  FOR each cli_target IN project_cli_targets:
    target_path = project.path + cli_target.relative_path
    
    IF NOT exists(parent_dir):
      CONTINUE
    
    FOR each skill IN project_skills WHERE enabled = true:
      expected_links.add({
        link_path: target_path + skill.name,
        source_path: skill_store + skill.managed_dir_name
      })
  
  // 2. 扫描实际状态
  actual_links = []
  FOR each cli_target IN project_cli_targets:
    target_path = project.path + cli_target.relative_path
    IF exists(target_path):
      FOR each entry IN list_directory(target_path):
        IF is_symlink(entry):
          target = readlink(entry)
          IF target.startswith(skill_store_path):
            actual_links.add(entry)
  
  // 3. 计算差异
  to_create = expected_links - actual_links
  to_delete = actual_links - expected_links
  
  // 4. 执行同步
  FOR each link IN to_create:
    CREATE symlink(link.link_path → link.source_path)
  
  FOR each link IN to_delete:
    DELETE symlink(link)
```

#### 5.5.3 Reconcile 触发时机

**自动触发**（如果开关开启）：
- App 启动时
- 定时（每小时）
- 添加/删除 skill 后
- 启用/禁用 skill 后
- 添加/删除 cli_target 后
- 启用/禁用 group 后

**手动触发**：
- 用户点击"同步"按钮

**开关配置**：
```sql
-- 在 settings 表中存储
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value) VALUES ('auto_reconcile', 'true');
```

## 六、UI 设计

### 6.1 导航结构

```
Skills Manager
├── Projects (新增)
│   ├── 项目列表
│   └── 项目详情
│       ├── Skills 管理
│       ├── Groups 管理
│       └── CLI Targets 配置
├── Skills (修改)
│   └── 已下载的 skills 列表
├── Discover (保持)
│   └── 浏览和下载 skills
├── Groups (修改)
│   ├── Group 列表
│   └── Group 编辑（选择 skills）
└── Settings (保持)
    └── 语言、Reconcile 开关等
```

### 6.2 Projects 页面（新增）

#### 6.2.1 项目列表

**显示内容**：
- 项目名称
- 项目路径
- 启用的 skills 数量
- 使用的 groups 数量
- 操作按钮（编辑、删除）

**操作**：
- 添加项目（选择目录 + 输入名称）
- 删除项目（确认对话框）
- 进入项目详情

#### 6.2.2 项目详情页

**Tab 1: Skills**
```
已启用的 Skills (12)

[搜索框]

表格:
  ☑ react-skill          来源: Direct, Group:frontend    [禁用]
  ☑ typescript-skill     来源: Group:frontend           [禁用]
  ☐ vue-skill (已禁用)   来源: Direct                   [启用]

[+ 添加 Skill] 按钮 → 打开 skill 选择对话框
```

**Tab 2: Groups**
```
使用的 Groups (2)

☑ frontend (已启用)     包含 5 个 skills    [禁用] [展开]
  ├─ ☑ react-skill
  ├─ ☑ typescript-skill
  ├─ ☐ eslint-skill (已禁用)
  └─ ...

☐ backend (已禁用)      包含 3 个 skills    [启用] [展开]

[+ 添加 Group] 按钮 → 打开 group 选择对话框
```

**Tab 3: CLI Targets**
```
Symlink 目标路径 (2)

☑ .agents/skills        [移除]
☑ .codex/skills         [移除]

[+ 添加 CLI Target] 按钮 → 打开 cli_target 选择对话框
```

### 6.3 Skills 页面（修改）

**旧功能**：显示已安装的 skills + link mode 选择

**新功能**：只显示已下载的 skills（skill store）

```
已下载的 Skills (25)

[搜索框]  [检查更新]

表格:
  react-skill          GitHub: vercel-labs/skills    使用中: 3 projects    [更新] [删除]
  typescript-skill     GitHub: ...                   使用中: 2 projects    [删除]
  vue-skill           Local                         未使用                [删除]

统计:
  总计: 25 个 skills
  使用中: 18 个
  未使用: 7 个
```

**关键变化**：
- 移除 link mode 列
- 添加"使用中"列（显示有多少 projects 在使用）
- 点击 skill 可以查看详情（哪些 projects 在使用）

### 6.4 Groups 页面（修改）

**旧功能**：Group 列表 + 关联 project roots

**新功能**：Group 列表 + 编辑 group 包含的 skills

```
Skill Groups (5)

[+ 创建 Group]

表格:
  frontend        包含 5 个 skills    使用中: 3 projects    [编辑] [删除]
  backend         包含 3 个 skills    使用中: 1 project     [编辑] [删除]
  design          包含 2 个 skills    未使用                [编辑] [删除]
```

**编辑 Group 对话框**：
```
编辑 Group: frontend

Group 名称: [frontend]

包含的 Skills:
  ☑ react-skill
  ☑ typescript-skill
  ☑ eslint-skill
  ☐ vue-skill
  ☐ angular-skill

[保存] [取消]
```

**关键变化**：
- 移除 project roots 关联
- 添加"使用中"列（显示有多少 projects 在使用）
- 编辑 group 只是选择包含哪些 skills

### 6.5 Discover 页面（保持）

**功能保持不变**：
- 浏览 skills.sh
- 搜索 skills
- 下载 skills

**关键点**：
- 下载后不会自动添加到任何 project
- 下载完成后提示："Skill 已下载，前往 Projects 页面添加到项目"

### 6.6 Settings 页面（新增选项）

**新增设置**：
```
自动同步 Symlinks
  ○ 开启（推荐）
  ○ 关闭

说明：开启后，修改 skills 或 groups 时自动同步 symlinks。
     关闭后，需要手动点击"同步"按钮。
```

## 七、迁移计划

### 7.1 数据迁移策略

#### 7.1.1 迁移目标

将现有的 global/custom/project 数据迁移到新的 project-only 架构。

#### 7.1.2 迁移步骤

**步骤 1：备份现有数据**
```sql
-- 导出现有数据库
VACUUM INTO 'skills_backup_YYYYMMDD.db';
```

**步骤 2：创建新表**
```sql
-- 创建 projects, project_skills, project_groups, project_cli_targets
-- 见 4.1 节
```

**步骤 3：迁移 link_mode = 'project' 的数据**
```sql
-- 从 skill_groups 和 project_roots 重建 projects
INSERT INTO projects (id, name, path)
SELECT DISTINCT 
  pr.id,
  pr.name,
  pr.path
FROM project_roots pr;

-- 从 skill_group_project_roots 和 skill_group_skills 重建 project_skills
INSERT INTO project_skills (project_id, skill_id, enabled)
SELECT DISTINCT
  sgpr.project_root_id,
  sgs.skill_id,
  1
FROM skill_group_project_roots sgpr
JOIN skill_group_skills sgs ON sgpr.group_id = sgs.group_id
JOIN skills s ON sgs.skill_id = s.id
WHERE s.link_mode = 'project';
```

**步骤 4：处理 link_mode = 'global' 和 'custom' 的数据**

**策略**：提示用户手动迁移，因为无法自动确定这些 skills 应该属于哪个 project。

```
迁移向导 UI:
  
  发现 15 个 global/custom mode 的 skills 需要迁移：
  
  ☑ react-skill (global)
  ☑ typescript-skill (custom)
  ...
  
  请选择要迁移到的项目：
  ○ 创建新项目
  ○ 选择现有项目: [下拉列表]
  
  或者：
  ○ 不迁移（这些 skills 将保留在 skill store，但不会添加到任何 project）
```

**步骤 5：清理旧表**
```sql
-- 删除旧的 link mode 相关表
DROP TABLE IF EXISTS skill_selected_targets;
DROP TABLE IF EXISTS custom_directories;
DROP TABLE IF EXISTS skill_group_project_roots;
DROP TABLE IF EXISTS project_roots;
DROP TABLE IF EXISTS project_targets;
DROP TABLE IF EXISTS skill_links;

-- 修改 skills 表
ALTER TABLE skills DROP COLUMN link_mode;
```

**步骤 6：重建 symlinks**
```sql
-- 清理所有旧的 symlinks（在 home 目录和 custom directories）
-- 通过 reconcile 重建新的 project symlinks
```

### 7.2 迁移风险和缓解

**风险 1：用户有大量 global skills**
- **影响**：需要手动选择迁移到哪个 project
- **缓解**：提供批量操作，允许一次性将所有 global skills 添加到一个 project

**风险 2：Symlinks 路径变化**
- **影响**：从 home 目录移动到 project 目录，CLI 工具可能找不到
- **缓解**：迁移向导中明确说明路径变化，提供迁移前后对比

**风险 3：数据丢失**
- **影响**：迁移失败可能导致数据丢失
- **缓解**：强制备份，提供回滚机制

### 7.3 回滚计划

如果迁移失败，提供回滚机制：

```
1. 停止应用
2. 恢复备份数据库: skills_backup_YYYYMMDD.db
3. 重启应用（使用旧版本）
```

## 八、实现任务分解

### 8.1 Phase 1: 数据层重构

**Task 1.1: 创建新的数据库迁移**
- 创建 `0002_project_only_refactor.sql`
- 定义新表：`projects`, `project_skills`, `project_groups`, `project_cli_targets`
- 修改 `cli_targets` 表结构
- 添加 `settings` 表

**Task 1.2: 实现数据迁移逻辑**
- Rust 迁移服务：`src-tauri/src/migration.rs`
- 备份现有数据库
- 迁移 project mode 数据
- 生成迁移报告（哪些数据需要手动处理）

**Task 1.3: 更新 Rust domain 模型**
- 修改 `src-tauri/src/domain/skill.rs`（移除 link_mode）
- 新增 `src-tauri/src/domain/project.rs`
- 更新 `src-tauri/src/domain/targets.rs`

### 8.2 Phase 2: 核心服务重构

**Task 2.1: Project 管理服务**
- `src-tauri/src/projects.rs`
- CRUD 操作：create, list, get, update, delete
- Tauri commands

**Task 2.2: Project Skills 管理服务**
- `src-tauri/src/project_skills.rs`
- 添加/移除 skill
- 启用/禁用 skill
- 列出 project 的 skills

**Task 2.3: Project Groups 管理服务**
- `src-tauri/src/project_groups.rs`
- 添加/移除 group
- 启用/禁用 group
- 计算 group 对 skills 的影响

**Task 2.4: 重写 Reconcile 服务**
- 修改 `src-tauri/src/reconcile.rs`
- 移除 global/custom reconcile
- 实现新的 project reconcile 算法
- 添加 reconcile 开关支持

**Task 2.5: 更新 Symlink 服务**
- 修改 `src-tauri/src/fs_links.rs`
- 适配新的 project-based 路径计算
- 清理旧的 home 目录 symlinks

**Task 2.6: 更新 Install 服务**
- 修改 `src-tauri/src/install.rs`
- 移除 link_mode 参数
- 下载后不创建 symlinks

### 8.3 Phase 3: UI 重构

**Task 3.1: 创建 Projects 页面**
- `src/features/projects/ProjectsPage.tsx`
- `src/features/projects/projectsApi.ts`
- 项目列表视图
- 添加/删除项目

**Task 3.2: 创建 Project 详情页**
- `src/features/projects/ProjectDetailPage.tsx`
- Tab 1: Skills 管理
- Tab 2: Groups 管理
- Tab 3: CLI Targets 配置

**Task 3.3: 更新 Skills 页面**
- 修改 `src/features/skills/SkillsPage.tsx`
- 移除 link mode 选择
- 添加"使用中"统计
- 添加 skill 详情对话框（显示哪些 projects 在使用）

**Task 3.4: 更新 Groups 页面**
- 修改 `src/features/groups/GroupsPage.tsx`
- 移除 project roots 关联
- 添加"使用中"统计
- 简化为 group 编辑（选择 skills）

**Task 3.5: 更新 Discover 页面**
- 修改 `src/features/discover/DiscoverPage.tsx`
- 下载完成后的提示文案
- 移除 link mode 选择

**Task 3.6: 更新 Settings 页面**
- 修改 `src/features/settings/SettingsPage.tsx`
- 添加 reconcile 开关

**Task 3.7: 更新导航**
- 修改 `src/App.tsx`
- 添加 Projects 导航项
- 移除 Directories 导航项

**Task 3.8: 更新本地化文件**
- 修改 `public/locales/en.json`
- 修改 `public/locales/zh.json`
- 添加新的 UI 文案

### 8.4 Phase 4: 迁移向导

**Task 4.1: 创建迁移向导 UI**
- `src/features/migration/MigrationWizard.tsx`
- 检测旧数据
- 显示迁移选项
- 执行迁移

**Task 4.2: 迁移进度和报告**
- 显示迁移进度
- 生成迁移报告
- 处理迁移错误

### 8.5 Phase 5: 测试和文档

**Task 5.1: 单元测试**
- Rust 服务测试
- TypeScript 工具函数测试
- 覆盖核心逻辑

**Task 5.2: 集成测试**
- 完整的 skill 生命周期测试
- Project 管理测试
- Reconcile 测试

**Task 5.3: 更新文档**
- 更新 `README.md`
- 更新 `docs/design/skills-manager-core-design.md`
- 更新 `CONTEXT.md`
- 创建迁移指南

**Task 5.4: 手动测试**
- 完整的用户流程测试
- 边界情况测试
- 跨平台测试（Windows, macOS, Linux）

## 九、技术决策记录

### 9.1 为什么移除 link_mode？

**问题**：三种 link mode 导致状态组合爆炸，reconcile 逻辑复杂。

**决策**：只保留 project-only 模式。

**理由**：
1. **简化状态**：只有一种 skill 生效方式
2. **明确边界**：project 是唯一的激活边界
3. **易于理解**：用户不需要理解 global/custom/project 的区别
4. **易于维护**：reconcile 逻辑大幅简化

**权衡**：
- 失去了"全局安装一次，到处可用"的便利性
- 但获得了更清晰的状态模型和更低的维护成本

### 9.2 为什么合并 custom_directories 到 cli_targets？

**问题**：custom_directories 和 cli_targets 功能重叠。

**决策**：只保留 cli_targets，作为全局的路径模板库。

**理由**：
1. **概念统一**：都是"symlink 目标路径"
2. **减少表数量**：简化数据模型
3. **灵活性**：用户可以添加任意自定义路径到 cli_targets

**权衡**：
- 失去了 custom_directories 的"任意绝对路径"能力
- 但 project-only 架构下，绝对路径没有意义

### 9.3 为什么不持久化 symlink 状态？

**问题**：旧架构中 `skill_links` 表记录每个 symlink 的状态。

**决策**：移除 `skill_links` 表，symlink 状态动态计算。

**理由**：
1. **简化数据模型**：减少一个表
2. **避免状态不一致**：数据库和文件系统可能不同步
3. **Reconcile 更简单**：直接对比期望状态和实际状态

**权衡**：
- 失去了 symlink 历史记录
- 但 symlink 状态本身就是"投影"，不应该持久化

### 9.4 为什么 group 是全局定义？

**问题**：group 应该是全局的还是 project-scoped 的？

**决策**：group 定义是全局的，但使用是 project-scoped 的。

**理由**：
1. **复用性**：一个 "react-dev" group 可以在多个项目中使用
2. **一致性**：所有项目使用相同的 group 定义
3. **易于管理**：集中管理 group 定义

**权衡**：
- 不能为每个 project 定制 group
- 但可以通过在 project 中单独禁用 group 内的 skills 来实现定制

### 9.5 为什么 reconcile 做成开关？

**问题**：自动 reconcile 可能影响性能，但手动 reconcile 容易忘记。

**决策**：提供开关，默认开启。

**理由**：
1. **灵活性**：高级用户可以关闭自动 reconcile
2. **性能**：大量 projects 时可以手动控制同步时机
3. **安全性**：用户可以在修改前关闭自动同步

**权衡**：
- 增加了一个配置项
- 但提供了更多控制权

## 十、风险和缓解

### 10.1 技术风险

**风险 1：Symlink 权限问题（Windows）**
- **描述**：Windows 需要开发者模式或管理员权限
- **缓解**：保留现有的权限检查和错误提示

**风险 2：大量 projects 的性能**
- **描述**：reconcile 需要扫描所有 projects
- **缓解**：
  - 提供 reconcile 开关
  - 只 reconcile 修改的 project
  - 异步执行 reconcile

**风险 3：路径冲突**
- **描述**：多个 skills 可能有相同的名称
- **缓解**：保留现有的 skill 命名冲突检测

### 10.2 用户体验风险

**风险 1：迁移复杂度**
- **描述**：用户需要理解新架构并迁移数据
- **缓解**：
  - 提供清晰的迁移向导
  - 自动迁移 project mode 数据
  - 提供迁移前后对比

**风险 2：学习曲线**
- **描述**：用户需要学习新的 project-based 工作流
- **缓解**：
  - 提供迁移指南和教程
  - UI 中添加提示和帮助文本
  - 保持 UI 简洁直观

**风险 3：功能缺失感**
- **描述**：用户可能怀念 global mode 的便利性
- **缓解**：
  - 在文档中解释为什么移除 global mode
  - 提供"快速添加到所有 projects"的批量操作

### 10.3 数据风险

**风险 1：迁移失败**
- **描述**：数据迁移过程中可能出错
- **缓解**：
  - 强制备份
  - 提供回滚机制
  - 分步迁移，每步验证

**风险 2：数据丢失**
- **描述**：用户可能误删 project 或 skill
- **缓解**：
  - 删除前确认对话框
  - 明确说明删除影响范围
  - 考虑添加"回收站"功能（未来）

## 十一、未来扩展能力

### 11.1 Workspace 支持

**场景**：用户有多个相关的 projects（monorepo）。

**扩展方式**：
```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE workspace_projects (
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  PRIMARY KEY (workspace_id, project_id)
);
```

**不破坏 project-only 模型**：workspace 只是 projects 的分组，不改变 skill 生效边界。

### 11.2 Team Shared Groups

**场景**：团队成员共享 group 定义。

**扩展方式**：
- 导出 group 为 JSON
- 通过 URL 或文件导入 group
- Group 仍然是本地存储，只是定义可以共享

**不破坏 project-only 模型**：group 仍然是全局定义，project-scoped 使用。

### 11.3 Remote Registry

**场景**：企业内部 skill registry。

**扩展方式**：
- 添加 `source_type = 'registry'`
- 支持私有 registry URL
- 认证和权限管理

**不破坏 project-only 模型**：只是增加 skill 来源，不改变生效边界。

### 11.4 Version Pinning

**场景**：project 需要固定 skill 版本。

**扩展方式**：
```sql
ALTER TABLE project_skills ADD COLUMN pinned_version TEXT;
```

**不破坏 project-only 模型**：版本固定是 project-scoped 的。

### 11.5 Dependency Management

**场景**：skill 依赖其他 skills。

**扩展方式**：
```sql
CREATE TABLE skill_dependencies (
  skill_id TEXT NOT NULL,
  depends_on_skill_id TEXT NOT NULL,
  PRIMARY KEY (skill_id, depends_on_skill_id)
);
```

**不破坏 project-only 模型**：依赖检查在 project 启用时进行。

## 十二、反模式：绝对不要做的设计

### 12.1 ❌ 不要重新引入隐式全局激活

**错误做法**：
- 添加"默认启用"标志，让 skill 自动在所有 projects 中生效
- 添加"全局 project"概念

**为什么不要**：
- 违反 project-only 核心原则
- 重新引入状态复杂度
- 用户无法明确知道哪些 skills 在哪里生效

**正确做法**：
- 提供"批量添加到多个 projects"功能
- 保持显式激活

### 12.2 ❌ 不要持久化 symlink 状态

**错误做法**：
- 重新引入 `skill_links` 表
- 记录每个 symlink 的 `status`（linked/missing/conflict）

**为什么不要**：
- 数据库和文件系统状态会不一致
- 增加状态同步复杂度
- Reconcile 逻辑变复杂

**正确做法**：
- Symlink 状态动态计算
- 通过 reconcile 保持一致性

### 12.3 ❌ 不要让 group 变成 project-scoped

**错误做法**：
- 为每个 project 创建独立的 group 定义
- 添加 `project_id` 到 `skill_groups` 表

**为什么不要**：
- 失去 group 的复用性
- 增加管理负担
- 概念混乱（group 和 project 边界不清）

**正确做法**：
- Group 定义全局共享
- Group 使用 project-scoped
- 通过单独禁用 skills 实现定制

### 12.4 ❌ 不要自动创建父目录

**错误做法**：
```rust
// 错误：递归创建所有父目录
fs::create_dir_all(project_path.join(cli_target.relative_path))?;
```

**为什么不要**：
- 可能在错误的位置创建目录
- 用户无法控制目录结构
- 可能覆盖用户的文件组织

**正确做法**：
```rust
// 正确：只创建最后一级目录，父目录必须存在
let parent = project_path.join(cli_target.relative_path).parent();
if parent.exists() {
  fs::create_dir(project_path.join(cli_target.relative_path))?;
}
```

### 12.5 ❌ 不要添加"智能检测"

**错误做法**：
- 自动扫描文件系统检测 projects
- 自动推荐应该启用哪些 skills
- 自动创建 groups

**为什么不要**：
- 增加不可预测性
- 用户失去控制权
- 可能产生错误的推荐

**正确做法**：
- 用户显式添加 projects
- 用户显式选择 skills
- 保持系统行为可预测

### 12.6 ❌ 不要混合绝对路径和相对路径

**错误做法**：
- `cli_targets` 同时支持绝对路径和相对路径
- 根据路径格式自动判断类型

**为什么不要**：
- 概念混乱
- 难以验证路径有效性
- Project-only 架构下绝对路径没有意义

**正确做法**：
- `cli_targets` 只存储相对路径
- 所有路径相对于 project 根目录

### 12.7 ❌ 不要添加"临时启用"

**错误做法**：
- 添加"临时启用"功能，重启后自动禁用
- 添加"试用模式"

**为什么不要**：
- 增加状态复杂度
- 用户可能忘记临时状态
- 难以调试

**正确做法**：
- 只有 enabled/disabled 两种状态
- 状态持久化
- 用户显式修改

### 12.8 ❌ 不要缓存 reconcile 结果

**错误做法**：
```rust
// 错误：缓存 reconcile 结果
struct ReconcileCache {
  last_check: Instant,
  cached_state: Vec<SymlinkState>,
}
```

**为什么不要**：
- 缓存可能过期
- 文件系统可能被外部修改
- 增加状态不一致风险

**正确做法**：
- Reconcile 每次都扫描文件系统
- 依赖文件系统作为真实状态
- 保持幂等性

## 十三、总结

### 13.1 为什么这个架构长期稳定

**1. 单一生效边界**
- Project 是唯一的 skill 激活边界
- 没有 global/custom/project 的状态组合
- 状态空间小，易于理解和维护

**2. 清晰的数据流**
```
Skill Store (源) → Database (状态) → Symlinks (投影)
```
- 单向数据流
- 数据库是唯一的真实状态
- Symlinks 可以随时重建

**3. 幂等的 Reconcile**
- 多次执行结果相同
- 不依赖内存状态
- 可以随时恢复

**4. 显式的用户操作**
- 下载 != 启用
- 所有激活都需要用户确认
- 没有隐式行为

**5. 良好的扩展性**
- 核心模型简单稳定
- 扩展不破坏核心
- 向后兼容

### 13.2 核心不变量

以下原则在任何扩展中都必须保持：

1. **Project 是唯一生效边界**
2. **下载不创建 symlinks**
3. **Symlinks 是投影，不是状态**
4. **所有状态存储在数据库**
5. **Reconcile 是幂等的**

### 13.3 实施优先级

**P0（必须）**：
- 数据库迁移
- Project 管理
- Project Skills 管理
- 新的 Reconcile 逻辑

**P1（重要）**：
- Project Groups 管理
- CLI Targets 配置
- UI 重构
- 迁移向导

**P2（可选）**：
- 性能优化
- 批量操作
- 高级统计

---

**文档结束**

如需进一步讨论或澄清，请参考：
- 当前设计文档：`docs/design/skills-manager-core-design.md`
- 项目 README：`README.md`
- 领域术语表：`CONTEXT.md`
