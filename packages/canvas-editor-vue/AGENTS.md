# AGENTS.md — @hankchen/canvas-editor-vue

Vue 3 薄绑定：composables 切片桥、画布表面组件、schema 驱动属性面板。宿主 UI 套件，源码直出（exports 指向 src），无 dist。红线（依赖方向、禁直连 canvas/browser-renderer）见仓库根 `AGENTS.md`。

## Layout（src 按领域分域，2026-09 起）

- `src/canvas/` — 画布表面域：CanvasSurface（双层 canvas + 事件桥，含拖文件入画布——只收 image/*、DOM Image 解码自然尺寸 1:1 落盒、多文件 +16px 级联）与其内挂 overlay（TextEditingOverlay、ContextMenu、FindBar——查找条，开合随内核 ui.find 会话态、Esc/聚焦归面板）、浮于画布的呈现件 AlignFloatBar（对齐画布浮条，无自身页面定位——挂载点归宿主）、gizmo/查找命中画笔（gizmo.ts + findHighlight.ts，宿主组合进 overlayPainter）、rAF 调度（scheduler）、DPR 桥（useDpr）、文本编辑切片（useTextEditing）、查找会话切片（useFindSession）。
- `src/property-panel/` — 属性面板域：fieldSchema（字段描述注册表 + 领域类型）、PropertyPanel/PropertyField、controls（`<component :is>` 注册表）、controlStyles（Tailwind 类名常量，包内私有）、fontPicker 注入缝与 imageUpload 注入缝（imageSrc 图片资源地址控件的会话能力缝——canUpload/uploadImage 由 PropertyPanel 以持有的 EditorSession provide，宿主零接线；上传实现仍归宿主注入的 uploadHandler）；`fields/` 收字段控件与行内辅助件（注册表控件经域内 barrel 供 controls 收集；行内辅助件如 BorderWidthInput / ShorthandModeButton / ValueTypeSegmented 由消费方直引；均不进包级公共出口）。表达式补全五件（completion/completionAnchor/useExpressionCompletion/ExpressionCompletionPopup/expressionContext）已于 2026-10 迁 shared 域——PropertyField 经 shared 引用补全浮层与候选源（画布文本编辑同源共用）。
- `src/layer-panel/` — 图层面板域：LayerPanel + useLayerPanel + addMenu（新增菜单数据面，工具栏「＋插入▾」同源）。新增菜单（工单 05 起）走 shared 下拉底座——#trigger 自绘＋方钮、#body 受控插槽承载模板表 rowsPath 表单（模板表项 keepsOpen 交换），closed 事件随收重置表单态；表单输入接 usePathCompletion 补全（rows-path-completion 工单 04：恒根起点源 + 候选态 Enter 归浮层接受、提交管线不动）。
- `src/status-bar/` — 状态栏域：StatusBar（缩放 % 段弹层菜单工单 05 起走 shared 下拉底座——#trigger 自绘 % 读数触发钮 + direction="up" 向上弹层，item dataAttrs 透传 `data-zoom-*` 目验钩子沿 playground 浮条命名）+ layerPathLabel/layerGeometryLabel（读数格式化）。
- `src/shared/` — 跨域切片桥：useSelection / useViewport / useHistory / useShortcuts / useShortcutsHelp（快捷键帮助单例开合态，⌘/ 桥路由与状态栏按钮双入口共享）/ useTransientFeedback（状态栏瞬时反馈单例，包内来源直写、StatusBar 补位显示）/ uploadFileFromDom（DOM File → 上传文件描述，canvas 拖放、字体控件与图片资源控件三域共用）/ editableTarget、
  表达式补全五件（completion 数据契约与接受手术 / completionAnchor 光标锚点测量 / useExpressionCompletion 浮层控件 / ExpressionCompletionPopup 呈现件 / expressionContext 上下文判定与候选源适配——属性面板与画布文本编辑两域共用，画布接线归表达式就地编辑 spec）与裸路径补全控件 usePathCompletion（rows-path-completion 工单 02：rowsPath 字段两入口的裸路径浮层控件——复用同门 Popup/Anchor/applyCompletion，源入参取光标前输入串、输入即弹/`.` 刷新/Ctrl+Space 强制、接受不自动补 `.`，不动 useExpressionCompletion）、rowsPath 候选源组装 rowsPathCompletionSource（工单 03/04：枚举器包注入缝 + 「行数组」文案置入的公共合流点——属性面板与建表表单两入口共用）与 schema 声明切片桥 useDataSourceSchema（工单 04 自 status-bar 收口——状态栏读数段与建表表单两域共用）、
  HelpDialog（帮助面板展示件，Teleport body、注册表 bindings/platform 双注入缝）与 shortcutsHelp（分组展示名/平台键位符号纯函数）、
  下拉菜单底座 DropdownMenu + useDropdownMenu（editor-top-toolbar 工单 02/04：触发钮 + 弹层一体呈现件——点击开合/点外收/Esc 收在 composable、a11y 对齐状态栏缩放菜单先例、菜单项 { label, title?, disabled?, shortcut?, keepsOpen?, dataAttrs?, run } + 'separator' 分段、分发即收；键盘导航（工单 04）= 开时焦点入菜单/↑↓ 循环跳置灰/Home+End/Enter+Space 显式激活防双跑/Esc 收起回焦触发钮 + Tab 关闭续走原生 Tab 序（焦点先回触发钮幸免卸载坠 body，触发钮非终态）（落点计算 nextEnabledItemIndex 纯函数在 composable 模块，焦点编排在组件，菜单根 @keydown.stop 模态化）；工单 05 起五处菜单全归底座——工具栏三下拉内建触发钮直用，状态栏缩放菜单/面板＋经 #trigger/#body 受控插槽消费（自绘触发钮 a11y 两属性由消费方写、direction="up" 向上弹层、keepsOpen 项分发留场（模板表表单交换特例）、dataAttrs 透传 data-* 目验钩子、body 插槽内可编辑目标方向键不劫持、closed 事件随收清理））、
  面板图标统一封装 PanelIcon（lucide 图标经 icon prop 注入，统一尺寸/描边默认，
  封装不引 lucide 运行时以保 tree-shake）——唯一允许被各域引用的层。
- `src/panel-theme.css` — 面板设计令牌（子路径出口 `./panel-theme.css`）。
- `tests/` — 与 src 域镜像（`tests/canvas/`、`tests/property-panel/`…）；跨包 fixture 经 `../../..` 取 `canvas-editor/tests/support/fixtures`。

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
