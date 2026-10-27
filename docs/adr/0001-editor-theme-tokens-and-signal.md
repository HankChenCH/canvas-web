# 编辑器主题：令牌单源 + html 级主题信号契约

canvas-editor-vue 的暗色值此前散落四处（`panel-theme.css` 令牌、StatusBar 与各画布域组件的 scoped 样式副本、Canvas2D 画笔 TS 常量、playground 壳层令牌），靠注释互相指认、人工保持同值；日间主题若照抄即全量 ×2。决定：全编辑器外观令牌收口为单一 `theme.css`（`--cn-*` 族，缺省即夜间值）；日间整组值定义在祖先「主题信号」选择器下（`[data-cn-theme="light"]`、html `light` class、`[data-theme="light"]` 三种写法等价），信号只设在 html 一处——body 级 portal 浮层靠 html 祖先链继承，组件根不再自绑主题属性。宿主切换推荐 VueUse `useDark({ attribute: 'data-cn-theme', valueDark: 'dark', valueLight: 'light' })`，包内另备轻量 `useCnTheme()` 服务不用 VueUse 的宿主。

## Considered Options

- **各组件自带主题、每处各自补一套亮色**：维持「组件独立、不依赖宿主接线」的旧哲学，但四处副本 ×2、继续人工同步，不可维护。
- **组件根自绑 data-cn-theme（包内主题单例驱动）**：宿主零接线，但组件根上的属性会压过宿主设在 html 上的信号，VueUse 兼容失败。
- **JS 侧 MutationObserver 探测宿主信号再镜像**：脆弱，且给纯 UI 包引入隐式全局行为。
- **缺省翻成日间以消化「html 无 dark class」的歧义**：违背既有夜间缺省、对现网观感零回归的约束。

## Consequences

- VueUse 纯缺省用法（`valueLight: ''`，日间时 html 无任何 class）无法驱动日间——「缺省夜间」与「缺席即日间」在纯 CSS 下不可两全。宿主一行配置即解（`valueLight: 'light'` 或上文的 attribute 模式），已写入接入文档作为已知限制。
- `panel-theme.css` 退化为兼容 shim（`@import './theme.css'`），规范入口改为 `theme.css`；旧 import 路径不破坏。
- 主题信号只设一处（推荐 html）：CSS 无法按 DOM 距离裁决同名特异性的冲突信号，多处设置属未定义行为，文档明示。
- Canvas2D 画笔（gizmo/查找/橡皮筋）不做主题感知：颜色按明暗双态可辨审计，个别需要区分的走既有 options 覆盖；JS 主题探针留到真出现「必须随主题换的画笔色」再建。
