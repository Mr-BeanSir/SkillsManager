# skills-manager

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
