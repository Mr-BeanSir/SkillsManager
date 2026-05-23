# skills-manager

## 0.6.0

### Minor Changes

- 68e3e79: ✨ 技能页面新增删除按钮，支持删除已安装技能及其软链接
- e9eaff7: ✨ 项目技能新增来源追踪，支持按分组/手动添加过滤和搜索

## 0.5.0

### Minor Changes

- a33c53f: Windows 上改用 NTFS junction 替代目录 symlink，不再需要管理员权限或开发者模式即可管理 skill 链接。移除管理员权限检查和管理员重启功能。

## 0.4.0

### Minor Changes

- 0e4c7f0: Skills 页面新增按来源仓库筛选功能，支持默认/来源两种视图模式切换。

### Patch Changes

- 0e4c7f0: 修复设置页分页大小输入框样式丢失，语言包按版本号释放避免更新后不刷新，并同步主页面 eyebrow/title 多语言文案。
- 0e4c7f0: 修复软链接操作失败时状态不一致的问题：启用/禁用分组或技能时，如果软链接创建或删除失败（如权限不足），现在会回滚数据库状态并显示错误提示。
- 0e4c7f0: CLI Targets 翻译 key 迁移至 settings 命名空间，统一 i18n 键名规范。
- 0e4c7f0: 前端 src 目录重构：页面子目录分离、公共 Modal 组件抽取、项目详情页布局重构及多项交互问题修复。

## 0.3.0

### Minor Changes

- 23edb12: 分组列表添加分页功能，分页大小复用全局分页大小设置。
- 10c79e9: 技能列表添加分页功能，分页大小复用设置中的全局分页大小值。
- 0c81bea: 仓库安装支持通配符\*批量安装全部技能，安装过程异步化并实时显示进度，新增全局消息提示组件。

### Patch Changes

- e04bb24: 修复发现页远程技能解析与 JSON 容错，恢复从仓库安装入口，优化安装弹框布局并限定来源为 GitHub 仓库。
- fae4f50: 统一分页栏布局为[上一页 页码 下一页]顺序，抽取通用分页 i18n 键减少语言包冗余。

## 0.2.3

### Patch Changes

- df7fc30: 添加 Rust 编译缓存加速 workflow 构建

## 0.2.2

### Patch Changes

- 2bb9b90: NSIS 安装包支持中英文语言切换，更新时显示安装界面
- 7679d60: 更新 commit 规范文档，明确每次 commit 前必须生成 changeset

## 0.2.1

### Patch Changes

- de9826f: 修复打包和更新问题：解决 Windows 命令行窗口、Linux AppImage 图标和更新后自动重启

## 0.2.0

### Minor Changes

- c528bd3: 支持 Windows、macOS、Linux 三平台自动构建，更新器适配 NSIS/DMG/AppImage 单文件安装包。
- aac07fc: 重构设置页面布局，布尔设置统一使用 switch 开关，新增应用更新检测和 locale 热更新支持。
