# skills-manager

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
