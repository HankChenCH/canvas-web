# AGENTS.md — @hankchen/canvas-next-editor-vue

Vue 3 薄绑定：composables 切片桥、画布表面组件、schema 驱动属性面板。宿主 UI 套件，源码直出（exports 指向 src），无 dist。红线（依赖方向、禁直连 canvas-next/browser-renderer）见仓库根 `AGENTS.md`。

## Layout（src 按领域分域，2026-09 起）

- `src/canvas/` — 画布表面域：CanvasSurface（双层 canvas + 事件桥，含拖文件入画布——只收 image/*、DOM Image 解码自然尺寸 1:1 落盒、多文件 +16px 级联）与其内挂 overlay（TextEditingOverlay、ContextMenu、FindBar——查找条，开合随内核 ui.find 会话态、Esc/聚焦归面板）、浮于画布的呈现件 AlignFloatBar（对齐画布浮条，无自身页面定位——挂载点归宿主）、gizmo/查找命中画笔（gizmo.ts + findHighlight.ts，宿主组合进 overlayPainter）、rAF 调度（scheduler）、DPR 桥（useDpr）、文本编辑切片（useTextEditing）、查找会话切片（useFindSession）。
- `src/property-panel/` — 属性面板域：fieldSchema（字段描述注册表 + 领域类型）、PropertyPanel/PropertyField、controls（`<component :is>` 注册表）、controlStyles（Tailwind 类名常量，包内私有）、fontPicker 注入缝；`fields/` 收字段控件与行内辅助件（注册表控件经域内 barrel 供 controls 收集；行内辅助件如 BorderWidthInput / ShorthandModeButton / ValueTypeSegmented 由消费方直引；均不进包级公共出口）。
- `src/layer-panel/` — 图层面板域：LayerPanel + useLayerPanel。
- `src/status-bar/` — 状态栏域：StatusBar（缩放 % 段自带弹层菜单，`data-zoom-*` 目验钩子沿 playground 浮条命名）+ layerPathLabel/layerGeometryLabel（读数格式化）。
- `src/shared/` — 跨域切片桥：useSelection / useViewport / useHistory / useShortcuts / useShortcutsHelp（快捷键帮助单例开合态，⌘/ 桥路由与状态栏按钮双入口共享）/ useTransientFeedback（状态栏瞬时反馈单例，包内来源直写、StatusBar 补位显示）/ uploadFileFromDom（DOM File → 上传文件描述，canvas 拖放与字体控件两域共用）/ editableTarget、
  HelpDialog（帮助面板展示件，Teleport body、注册表 bindings/platform 双注入缝）与 shortcutsHelp（分组展示名/平台键位符号纯函数）、
  面板图标统一封装 PanelIcon（lucide 图标经 icon prop 注入，统一尺寸/描边默认，
  封装不引 lucide 运行时以保 tree-shake）——唯一允许被各域引用的层。
- `src/panel-theme.css` — 面板设计令牌（子路径出口 `./panel-theme.css`）。
- `tests/` — 与 src 域镜像（`tests/canvas/`、`tests/property-panel/`…）；跨包 fixture 经 `../../..` 取 `canvas-next-editor/tests/support/fixtures`。

## Import 纪律（dependency-cruiser `editor-vue-*-isolation` 规则锁定）

- 域 → shared 单向可引；**域间横向 import 禁止**；shared 不得反向依赖任何域。
- 域内用相对路径；`fields/` 回引域根用 `../fieldSchema` 等。不建 tsconfig 别名（全仓约定无 paths）。
- 加新组件先判落位：属于既有域就进该域；被 ≥2 个域共享的切片桥进 shared；全新领域（如将来的大纲面板）开新域目录 + barrel + package.json 子路径出口 + depcruise 域隔离规则，三处同步。

## 出口

- 包根 barrel（`src/index.ts`）只做按域 `export *` + PACKAGE_NAME；域 barrel 内显式具名导出。改公共符号面时核对根 barrel 注释。
- 子路径出口：`./canvas`、`./property-panel`、`./layer-panel`、`./status-bar`、`./shared`、`./panel-theme.css`，与域目录一一对应；新增域必须同步 `package.json` exports。

## Commands

```sh
pnpm test        # vitest（jsdom 环境见 vitest.config.ts，mount 测试挂 @vitejs/plugin-vue）
pnpm typecheck   # vue-tsc --noEmit
```
