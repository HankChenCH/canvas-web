# @hankchen/canvas-editor-vue

[@hankchen/canvas-editor](https://www.npmjs.com/package/@hankchen/canvas-editor) 的 Vue 3 薄绑定：画布表面组件（CanvasSurface）、composables 切片桥、schema 驱动属性面板、图层面板与状态栏。

## 安装

```sh
npm install @hankchen/canvas @hankchen/canvas-editor @hankchen/canvas-editor-vue
```

peerDependencies 要求 `vue ^3.5`。

## 使用

子路径出口：`.`、`./canvas`、`./property-panel`、`./layer-panel`、`./status-bar`、`./shared`、`./theme.css`（主题令牌单源）、`./panel-theme.css`（旧入口，现为 `theme.css` 的兼容 shim）、`./style.css`（组件样式，需在应用入口以副作用方式引入）。

```ts
import '@hankchen/canvas-editor-vue/theme.css'
import '@hankchen/canvas-editor-vue/style.css'
import { CanvasSurface } from '@hankchen/canvas-editor-vue/canvas'
```

完整目验见 [canvas-web playground](https://github.com/HankChenCH/canvas-web)。

## 主题（日间/夜间）

编辑器外观（面板/状态栏/标尺/浮层/画笔/画布桌面等 chrome，术语见仓库 `GLOSSARY.md`）支持日间/夜间两套主题；**文档纸面不参与主题**。颜色令牌单源在 [`./theme.css`](./src/theme.css)：夜间为缺省（零配置即夜间），日间由 html 上的信号整组驱动。术语与架构决策见仓库 `GLOSSARY.md` 与 `docs/adr/0001-editor-theme-tokens-and-signal.md`。

### 接入（三步）

1. 应用入口引入 `@hankchen/canvas-editor-vue/theme.css`（替代旧 `panel-theme.css` 入口；旧路径仍是有效 shim，`@import './theme.css'`，存量代码不破坏）。
2. 不做任何事即夜间。要切日间，往 **html 元素**设信号：`<html data-cn-theme="light">`。**信号只设一处**（推荐 html；CSS 无法按 DOM 距离裁决同名冲突，多处设置属未定义行为）。
3. 裸信号即生效，无需任何包 API：手动往 html 加 `data-cn-theme="light"`、`data-theme="light"` 或 `class="light"` 任一，观感即切日间。

### VueUse 宿主（推荐配置）

```ts
import { useDark, useToggle } from '@vueuse/core'

const isDark = useDark({ attribute: 'data-cn-theme', valueDark: 'dark', valueLight: 'light', initialValue: 'dark' })
const toggleDark = useToggle(isDark)
```

或 class 模式：`useDark({ valueDark: 'dark', valueLight: 'light' })`（写 html `dark`/`light` class）。`initialValue: 'dark'` 固定缺省夜间、不跟随系统偏好；持久化由 useDark 自带。

### 包内主题状态：`useCnTheme()`

不用 VueUse 的宿主可用包内轻量 composable（`./shared` 与根出口导出）：

```ts
const { theme, set, toggle } = useCnTheme({ storageKey?: string, target?: () => HTMLElement | null })
```

模块级单例 ref（`'light' | 'dark'`）；写出即同步 `data-cn-theme` 到目标元素（默认 `document.documentElement`，夜间也显式写保持信号可见）；`storageKey` 传入才持久化；document 访问延迟到函数体内（SSR/测试安全）。不监听 `prefers-color-scheme`、无切换动画。

### 已知限制

- VueUse **纯缺省用法**（`valueLight: ''`，日间时 html 无任何 class/属性）无法驱动日间——「缺省夜间」与「缺席即日间」纯 CSS 不可两全（ADR 0001）；显式给 `valueLight`/`valueDark` 即解。
- VueUse 布尔形式 toggle 切到与系统偏好一致的一侧时会向 storage 写 `'auto'`（官方行为，无法关闭），此后刷新会跟随系统；要严格固定两态请用 `set('light' | 'dark')` 形式或包内 `useCnTheme`。
- 信号只认 html 一处；多处设置同名信号属未定义行为。

### 换肤逃生口

宿主仍可在主题消费根类（`.cn-props`、`.cn-statusbar` 等，见 theme.css 枚举）上覆盖 `--cn-*` 单令牌换肤：优先级为主题整组值之上、宿主覆盖之下。随主题变色的令牌只在 theme.css 定义，组件样式只 `var()` 消费。
