# UI 设计规范

## 页面布局

### 返回按钮位置规范

**规则**: 所有页面的返回按钮统一放置在页面右上角。

**实现方式**:
- 使用 `topbar` 容器的 flex 布局
- 返回按钮作为 `topbar` 的最后一个子元素
- 通过 `justify-content: space-between` 实现标题区域和按钮的左右分布

**示例结构**:
```tsx
<header className="topbar page-topbar">
  <div>
    <p className="eyebrow">页面标识</p>
    <h1>页面标题</h1>
    <p>页面描述</p>
  </div>
  <button className="button button-secondary" onClick={onBack}>
    <ArrowLeft size={16} weight="bold" />
    返回上级页面
  </button>
</header>
```

**适用场景**:
- 所有子页面（非顶级导航页面）
- 详情页面
- 设置子页面

**原因**:
- 保持视觉一致性
- 符合用户从左到右的阅读习惯（标题在左，操作在右）
- 避免返回按钮与标题区域的视觉冲突

---

## 间距系统

### 统一间距规范

- 基础间距单位: 8px
- 常用间距: 8px, 12px, 16px, 18px, 24px
- 避免使用任意间距值

### 间距层次

1. **紧密间距** (8-12px): 相关元素之间（如标签和输入框）
2. **标准间距** (16-18px): 同级元素之间（如表单字段）
3. **分隔间距** (24px+): 不同区域之间（如表单和操作按钮）

---

## 表单布局

### Modal 表单规范

- 使用 `modal-panel-compact` (520px) 适用于简单表单
- 表单区域使用 `padding: 18px`
- 字段间距使用 `gap: 16px`
- 操作按钮区域添加顶部边框分隔

---

## 颜色规范

### 中性色

- 主要文字: `#111111`
- 次要文字: `#787774`
- 边框: `#eaeaea`
- 背景: `#ffffff`

### 状态色

- 成功: 待定义
- 错误: 待定义
- 警告: 待定义

---

## 字体规范

### 字体栈

```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
```

### 字号

- 标题 H1: 待定义
- 标题 H2: 待定义
- 正文: 待定义
- 小字: 12px

---

## 组件规范

### 按钮

- 主要按钮: `.button-primary`
- 次要按钮: `.button-secondary`
- 图标按钮: `.icon-button`
- 危险按钮: `.danger-button`

### 状态徽章

- 内置: `.status-badge.status-global`
- 自定义: `.status-badge.status-project`

---

## 更新日志

- 2026-05-23: 初始版本，添加返回按钮位置规范
