# AGENTS.md — @hankchen/canvas-editor-vue

Vue 3 薄绑定：composables 切片桥、画布表面组件、schema 驱动属性面板。宿主 UI 套件，源码直出（exports 指向 src），无 dist。红线（依赖方向、禁直连 canvas/browser-renderer）见仓库根 `AGENTS.md`。

## Layout（src 按领域分域，2026-09 起）

- `src/canvas/` — 画布表面域：CanvasSurface（双层 canvas + 事件桥，含拖文件入画布——只收 image/*、DOM Image 解码自然尺寸 1:1 落盒、多文件 +16px 级联）与其内挂 overlay（TextEditingOverlay、ContextMenu——右键菜单，「转为模板表」入口以数据源声明为门且轻表单换装 rowsPath mode 级联点选器（rows-path-picker 工单 04：恒根起点、确认禁用至选中数组、确认 → convertTableToTemplate 照旧）、FindBar——查找条，开合随内核 ui.find 会话态、Esc/聚焦归面板）、浮于画布的呈现件 AlignFloatBar（对齐画布浮条，无自身页面定位——挂载点归宿主）、gizmo/查找命中画笔（gizmo.ts + findHighlight.ts，宿主组合进 overlayPainter）、rAF 调度（scheduler）、DPR 桥（useDpr）、文本编辑切片（useTextEditing）、查找会话切片（useFindSession）。
- `src/property-panel/` — 属性面板域：fieldSchema（字段描述注册表 + 领域类型）、PropertyPanel/PropertyField、controls（`<component :is>` 注册表）、controlStyles（Tailwind 类名常量，包内私有）、imageUpload 注入缝（imageSrc 图片资源地址控件的会话能力缝——canUpload/uploadImage 由 PropertyPanel 以持有的 EditorSession provide，宿主零接线；上传实现仍归宿主注入的 uploadHandler）；`fields/` 收字段控件与行内辅助件（注册表控件经域内 barrel 供 controls 收集；行内辅助件如 BorderWidthInput / ShorthandModeButton / ValueTypeSegmented 由消费方直引；均不进包级公共出口）。资源内容字段作者面（resource-expression-single-ref 工单 05，ADR 0020）：`ResourceValueField`（resourceValue 控件，QR 内容字段换装——`{{}}` 拆装壳 + 级联路径选择器，纯菜单点选不设手输缝；存量违例原文只读回显）与 imageSrc 控件表达式态换装共用（静态态缩略图/上传/路径行不动）；表达式补全浮层面经换装只剩文本层 textarea（PropertyField 接线门收敛）。表达式补全五件（completion/completionAnchor/useExpressionCompletion/ExpressionCompletionPopup/expressionContext）已于 2026-10 迁 shared 域——PropertyField 经 shared 引用补全浮层与候选源（画布文本编辑同源共用）；字体清单注入缝 fontPicker 同日迁 shared（edit-overlay-toolbar 工单 04，编辑浮层工具条字体段同源消费，域 barrel 具名转发保持出口面不变）。
- `src/layer-panel/` — 图层面板域：LayerPanel + useLayerPanel + addMenu（新增菜单数据面，工具栏「＋插入▾」同源）。新增菜单（工单 05 起）走 shared 下拉底座——#trigger 自绘＋方钮、#body 受控插槽承载模板表 rowsPath 表单（模板表项 keepsOpen 交换），closed 事件随收重置表单态；表单换装 rowsPath mode 级联点选器（rows-path-picker 工单 04：恒根起点剪枝候选、确认禁用至选中数组——「表单先行、确认即武装」流程面不变），模板表项以数据源声明为门（未绑 schema 整项置灰 + title「先绑定数据源」，判定读 useDataSourceSchema）。
- `src/status-bar/` — 状态栏域：StatusBar（缩放 % 段弹层菜单工单 05 起走 shared 下拉底座——#trigger 自绘 % 读数触发钮 + direction="up" 向上弹层，item dataAttrs 透传 `data-zoom-*` 目验钩子沿 playground 浮条命名）+ layerPathLabel/layerGeometryLabel（读数格式化）。
- `src/shared/` — 跨域切片桥：useSelection / useViewport / useHistory / useShortcuts / useShortcutsHelp（快捷键帮助单例开合态，⌘/ 桥路由与状态栏按钮双入口共享）/ useTransientFeedback（状态栏瞬时反馈单例，包内来源直写、StatusBar 补位显示）/ uploadFileFromDom（DOM File → 上传文件描述，canvas 拖放、字体控件与图片资源控件三域共用）/ editableTarget、
  表达式补全五件（completion 数据契约与接受手术 / completionAnchor 光标锚点测量 / useExpressionCompletion 浮层控件 / ExpressionCompletionPopup 呈现件 / expressionContext 上下文判定与候选源适配——属性面板与画布文本编辑两域共用，画布接线归表达式就地编辑 spec；rows-path-completion 的裸路径补全控件 usePathCompletion 与 rowsPathCompletionSource 手输源随 rowsPath 作者面纯点选化零消费方，已于 rows-path-picker 工单 05 整体退役——useExpressionCompletion 与表达式补全面零改动）、rowsPath 点选器候选源组装 rowsPathPickerSource（rows-path-picker 工单 02，模块文件 rowsPathPickerSource.ts：剪枝枚举件包 CompletionSource 注入缝 + 「行数组」徽标常量 ROWS_PATH_ARRAY_BADGE + 漂移判定纯函数 rowsPathValueDrifts——属性面板/建表表单/右键轻表单三入口共用）与 schema 声明切片桥 useDataSourceSchema（工单 04 自 status-bar 收口——状态栏读数段与建表表单两域共用）与表达式语法诊断 useExpressionDiagnostics（expression-syntax-diagnostics 工单 02：kind → 中文文案映射 + 非受控宿主监听同步 composable——属性面板与画布文本编辑两域共用）、
  资源表达式级联路径选择器 ExpressionPathPicker + 候选模型纯函数 pathPickerModel + `{{}}` 拆装纯函数 resourceTemplate（resource-expression-single-ref 工单 05，ADR 0020：资源内容字段的作者面 = 纯菜单点选不设手输缝——v-model 直绑裸点路径、外壳拆装归字段控件壳；逐层 `source(已积累路径)` 取候选按 kind==='path' 过滤函数桶、object 下钻叶子提交；source null 未绑声明整体只读回显）与弹层视口定位纯函数 popupPosition（工单 05/06 伴生修复：下方放不下向上翻转、翻转仍不足钳制视口内 + 横向右缘收口——表达式浮层/裸路径浮层/选择器菜单三处同函数消费）、
  HelpDialog（帮助面板展示件，Teleport body、注册表 bindings/platform 双注入缝）与 shortcutsHelp（分组展示名/平台键位符号纯函数）、
  下拉菜单底座 DropdownMenu + useDropdownMenu（editor-top-toolbar 工单 02/04：触发钮 + 弹层一体呈现件——点击开合/点外收/Esc 收在 composable、a11y 对齐状态栏缩放菜单先例、菜单项 { label, title?, disabled?, shortcut?, keepsOpen?, dataAttrs?, icon?, checked?, run } + 'separator' 分段（edit-toolbar-declutter 工票 02 起 icon/checked 可选：icon 为 Lucide 组件引用经 PanelIcon 渲染 label 前同一左组、checked 字段在场即 role=menuitemradio + aria-checked + true 项右侧 ✓——不带新字段渲染零变化）、分发即收；键盘导航（工单 04）= 开时焦点入菜单/↑↓ 循环跳置灰/Home+End/Enter+Space 显式激活防双跑/Esc 收起回焦触发钮 + Tab 关闭续走原生 Tab 序（焦点先回触发钮幸免卸载坠 body，触发钮非终态）（落点计算 nextEnabledItemIndex 纯函数在 composable 模块，焦点编排在组件，菜单根 @keydown.stop 模态化）；工单 05 起五处菜单全归底座——工具栏三下拉内建触发钮直用，状态栏缩放菜单/面板＋经 #trigger/#body 受控插槽消费（自绘触发钮 a11y 两属性由消费方写、direction="up" 向上弹层、keepsOpen 项分发留场（模板表表单交换特例）、dataAttrs 透传 data-* 目验钩子、body 插槽内可编辑目标方向键不劫持、closed 事件随收清理））、
  字体清单注入缝 fontPicker（FONT_PICKER_KEY/injectFontPicker，edit-overlay-toolbar 工单 04 自属性面板域迁入——面板字体控件与编辑浮层工具条字体段两域共用，宿主 provide 一次控件树任意深度可取）、
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
