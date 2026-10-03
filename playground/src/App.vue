<script setup lang="ts">
// 工单 14 目验：剪贴板（Ctrl/Cmd+C/V/D 与右键「创建副本」）、快捷键注册表
// （useShortcuts 统一接键盘：让路规则见内核 classifyEditorShortcut）、右键菜单
// （删除/副本/置顶/置底）、状态栏（缩放/选中路径/物化进行数；工单 01 起状态栏
// 收编全部读数：坐标尺寸/资源/保存/schema/反馈段；工单 02 拆除头部四行读数，
// 全部读数仅状态栏一处归口）。
// 工单 13 目验保留：保存/上传/字体清单。工单 11/08/05 保留：文本编辑、相机导航。
// 工单 02：头栏一行化（文档名 + 未保存点 + 画布规格徽标｜帮助 + 导出主按钮）+
// 宿主级帮助抽屉（使用说明区 = legend 原样迁移；开发者区 = 工票长文 + 目验样图
// + schema 三键，data-* 钩子原位保留）。
// editor-top-toolbar 工单 03：工具栏重组（spec 变体 A 拍板）——文件（打开/保存/
// 上传图片）｜历史（撤销/重做）｜「＋插入▾」（面板＋ ADD_LAYER_MENU 同源四项
// 统一武装画拉，直建语义退役；「模板表…」只属面板＋表单）｜「查找」（⌘F 同缝
// beginFind，FindBar 本体留在画布顶部浮层，开合随内核会话态不双开）｜「排列▾」
// （z 序四件 + 锁定/显隐；仅根图层可排列——无选中/非根全组置灰 + title 引导，
// 内核空转守卫是正确性防线；锁定/显隐动态标签随选中根层当前态；「排列」为 v2
// 对齐分布预留语义，不是对齐）｜「视图▾」（100%/适应画布/适应选区 = ⌘0/⇧1/⇧2
// 的键位镜像，不含放大/缩小步进——缩放控件唯一归状态栏；标尺 ✓ 勾选项与 ⇧R
// 双向同步，推翻 ruler-guides-snap 工单 04「标尺不设钮」旧拍板；清空参考线 =
// 内核 clearGuides()，会话级不可撤销）｜网格右端独立开关（margin-left:auto 弹性
// 空隙与头栏右对齐语言一致；推翻「网格后以视图组入列」旧拍板）。下拉底座 =
// editor-vue/shared DropdownMenu（工单 02；弹层 fixed 定位逃出工具栏内滚容器）。
// 工单 04：工具栏缩放控件整组摘除、缩放读数唯一归状态栏；ctrl/cmd+滚轮缩放不变。
// kbd-nav 工单 06：缩放浮条退役（App.vue 浮条段与 zoomBy/zoomTo100/fitToCanvas/
// fitToSelection 宿主辅助拆除），缩放入口归一状态栏缩放控件（工单 04 弹层菜单）；
// HelpDialog 挂载——⌘/ 与状态栏「快捷键」入口随组件与桥自带，宿主零键位代码。
// 工单 05：全视口暗色工作台壳——.stage 100vh 四行网格（头栏 48 / 工具栏 44 /
// 工作台 1fr / 状态栏 auto≈30），页面零滚动；去 1240px 锁宽（四行全宽、画布区
// 垂直撑满）；壳层暗色统一（#070d18 页底 + #0b1220 面板族令牌，工具栏钮 ghost
// 形态、主按钮 accent、画布桌面底暗色渐变、帮助抽屉换肤），editor-vue 面板与
// StatusBar 令牌零改动，两面板宽度 232/288 与交互不动。
// layer-align-snap 工单 03：对齐浮条宿主接线——canvas 域 AlignFloatBar 挂画布
// 容器顶部居中（原型 FIG.2 落位），宿主只做定位；逐键 data-align-* 钩子由组件
// 自带（工单 02），根钩子 data-align-float 供目验定位。
// content-completion 工单 11：样例换装证书 form-data schema（与工单 08 内核
// fixture 同源）+ demoGraph 表达式键树对齐 + 注入面板编译诊断展示（直取
// parseExpressionSchema 返回面，D12；内核 console.warn 收口不变），注入键扩为
// 注入/非法/断链/清除四键（data-schema-* 钩子原位保留 + 新增 data-schema-diagnostic）。
// ruler-guides-snap 工单 04：标尺/参考线/吸附线接线——canvas 域 Ruler 挂画布容器
// 顶+左贴边（宿主出 absolute inset:0 壳，条外缘与内容区贴边 = 手势坐标换算前提）、
// GuidesOverlay 直挂（root 自带 inset:0，与 .surface 同矩形浮于画布之上）；从标尺
// 拖出参考线的四事件 Ruler → 参考线层转发（载荷直传，工单 03 对接面）；⇧R 随内核
// shortcuts 注册表自带（useShortcuts 已接），宿主零键位代码；data-ruler-* /
// data-guide-* / data-snap-* 钩子组件自带。挂点次序：参考线层在标尺之前——拖回
// 删除的落点判定（elementFromPoint 命中 data-ruler-*）要求标尺条盖在参考线命中条
// 之上。对齐浮条顶部居中落位不动。
// canvas-web-find-replace 工单 04：查找条挂载接线——FindBar 已随 CanvasSurface
// 内挂（工单 03，宿主零业务代码），本票只接 overlay 画笔组合序：drawFindMatches
// 插在资源标识与选区 gizmo 之间（findHighlight 调用契约）；查找会话变化的脏标由
// 内核 onStoreChange overlay 分支自带，宿主无新增订阅。
// canvas-web-expression-editing 工单 04：帮助抽屉文案收口——特性清单新增「就地编辑
// 表达式」条目（标记层双击 = 编辑表达式并保持标记、pill 切写路径、删空片段或切静态
// 解标、Esc 分流、zoom 锚点折算、一步历史）；「表格模板态与表达式标记」条目的双击
// 语义同步修订（画布侧改就地编辑保持标记，面板侧字面写解标不变）。
import { computed, nextTick, onBeforeUnmount, provide, ref, shallowRef, watch } from 'vue'

import {
    Canvas2DBackend,
    Materializer,
    applyViewportTransform,
    canvasFontCssFamily,
    drawResourceMarkers,
    exportPreviewPng,
} from '@hankchen/canvas-next-browser-renderer'
import type { ResourceState } from '@hankchen/canvas-next-browser-renderer'
import {
    ARM_CREATE_LAYER_TYPES,
    EditorSession,
    isLockedPath,
    isRootLayerPath,
    parseExpressionSchema,
    rootLayerOf,
} from '@hankchen/canvas-next-editor'
import type {
    EditorShortcutAction,
    ExpressionSchemaDiagnostic,
    FontCatalogEntry,
    LayerType,
    UploadFile,
} from '@hankchen/canvas-next-editor'
import {
    ADD_LAYER_MENU,
    ARM_LAYER_CREATE_HINT,
    DropdownMenu,
    FONT_PICKER_KEY,
    HelpDialog,
    StatusBar,
    detectShortcutPlatform,
    formatLayerPath,
    shortcutActionLabel,
    uploadFileFromDom,
    useHistory,
    useSelection,
    useShortcuts,
    useTransientFeedback,
    type CanvasSurfaceReady,
    type DropdownMenuEntry,
    type FontPickerContext,
} from '@hankchen/canvas-next-editor-vue'
import {
    AlignFloatBar,
    CanvasSurface,
    createRafScheduler,
    drawCreateRubberBand,
    drawFindMatches,
    drawSelectionGizmo,
    GuidesOverlay,
    LayerPanel,
    PropertyPanel,
    Ruler,
} from '@hankchen/canvas-next-editor-vue'
import type { OverlayPainter } from '@hankchen/canvas-next-editor'
import { createMeasureTextMeasurerFactory, decodeGraph, encodeGraph } from '@hankchen/canvas-next'

import { DEMO_GRAPH_JSON } from './demoGraph'
// 桌面网格底纹（原型）：内容层 begin 后垫网格线（只画纸面外桌面），区分纸面与
// 背景；导出不经此路
import { GridBackdropBackend } from './gridBackdrop'
import { DIAGNOSTIC_DATASET_SCHEMA, INVALID_DATASET_SCHEMA, SAMPLE_DATASET_SCHEMA } from './sampleDatasetSchema'
import { buildVisualCheckGraph } from './visualCheckGraph'

// 缩放范围可配置（缺省即 5%–800%）；适应画布留 48px 呼吸边。
// 上传注入点：playground 以 data URL 兜底（文件内联进 graph，可离线演示；生产
// 宿主接自己的存储返回 URL）。字体清单：内置清单可配置（清单 ≠ 物化，加载仍走
// 渲染端物化管线），自定义字体上传后追加。
// measureText 度量注入（autowidth-content-injection 工单 04）：专用离屏 2D 上下文
// + 渲染端字体映射（canvasFontCssFamily，族名派生与 FontFace 注册、未注册回落
// sans-serif 同门）构造真实字体度量器，经 session 既有 textPolicies 缝显式注入——
// 画布盒、面板解析值、导出预览同源走真实度量（不注入恒启发式，不隐式切换）。
const measureCtx = document.createElement('canvas').getContext('2d')
const editor = new EditorSession({
    scheduleFrame: createRafScheduler(),
    fitMargin: 48,
    uploadHandler: uploadToDataUrl,
    fontCatalog: [{ label: 'Open Sans（演示字体）', ref: '/fonts/open-sans.ttf' }],
    textPolicies: measureCtx
        ? { measurerFactory: createMeasureTextMeasurerFactory(measureCtx, { fontCssFamily: canvasFontCssFamily }) }
        : undefined,
})

// 数据源 schema 声明（content-completion 工单 03/11，D2 宿主随会话注入）：playground
// 以宿主身份在会话建立即注入证书 form-data schema（与工单 08 内核 fixture 同源）。
// 声明只进编辑器会话态（store ui 分支），不进 graph、不落 localStorage、不动 wire；
// 注入四键与编译诊断面板收进帮助抽屉开发者区（工单 02/11），声明态读数归状态栏
// schema 段。

/** 注入面板编译诊断读数（工单 11，D12）：直取 parseExpressionSchema 纯函数返回面，
 *  供宿主开发期排查方言问题；内核 console.warn 单点收口不变（此处只做可见化，
 *  不重复告警）。kind：idle=未注入 / rejected=根级整份拒绝 / compiled=已编译
 *  （diagnostics 空 = 全树无诊断，非空 = 局部降级逐条） */
type SchemaParseReport = {
    kind: 'idle' | 'rejected' | 'compiled'
    text: string
    diagnostics: readonly ExpressionSchemaDiagnostic[]
}

const SCHEMA_REPORT_IDLE: SchemaParseReport = { kind: 'idle', text: '未注入声明（无候选）', diagnostics: [] }
const schemaReport = ref<SchemaParseReport>(SCHEMA_REPORT_IDLE)

/** 注入前直取纯函数诊断：合法 → 无诊断/逐条局部降级；根级拒绝 → 拒绝原因。
 *  与 editor.setDataSourceSchema 内部的 normalizeExpressionSchemaSource 同源独立
 *  调用（纯函数无副作用，双调无害） */
function readSchemaReport(raw: unknown): SchemaParseReport {
    const parsed = parseExpressionSchema(raw)
    if (!parsed.ok) {
        return { kind: 'rejected', text: `声明被拒（${parsed.reason}）→ 降级无候选：${parsed.detail}`, diagnostics: [] }
    }
    if (parsed.diagnostics.length === 0) {
        return { kind: 'compiled', text: '已编译，无诊断', diagnostics: [] }
    }
    return {
        kind: 'compiled',
        text: `已编译，${parsed.diagnostics.length} 条局部降级（故障节点为叶子，其余照常服务）：`,
        diagnostics: parsed.diagnostics,
    }
}

/** 注入动作收口：注入 + 面板诊断读数同步刷新，保证面板永远显示当前注入声明的
 *  编译结果（二者不同步 = 面板说谎）；note 非空时同步状态栏反馈段——会话建立时
 *  的初始注入不发反馈，只有目验按键动作发 */
function applyDataSourceSchema(raw: unknown, note = ''): void {
    editor.setDataSourceSchema(raw)
    schemaReport.value = raw === null ? SCHEMA_REPORT_IDLE : readSchemaReport(raw)
    if (note !== '') docNote.value = note
}

applyDataSourceSchema(SAMPLE_DATASET_SCHEMA)

/** data URL 兜底上传：本机字节 → 内联引用（物化管线可装载，无需网络） */
async function uploadToDataUrl(file: UploadFile): Promise<string> {
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < file.bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...file.bytes.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)
    const mime = file.mime || 'application/octet-stream'
    return `data:${mime};base64,${base64}`
}

// 字体清单 → FontField 控件的注入缝：entries 随 catalog 订阅联动（上传追加实时
// 进下拉），退订随组件卸载
const fontCatalogEntries = ref<readonly FontCatalogEntry[]>(editor.fontCatalog.entries)
const unsubscribeCatalog = editor.fontCatalog.subscribe((entries) => {
    fontCatalogEntries.value = entries
})
provide(FONT_PICKER_KEY, {
    entries: fontCatalogEntries,
    canUpload: editor.canUpload,
    uploadFont: (file) => editor.uploadFont(file),
} satisfies FontPickerContext)

// 隐藏文件入口的触发 refs（打开 graph JSON / 本机选图）
const openInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
function onOpenClick(): void {
    openInput.value?.click()
}
function onUploadImageClick(): void {
    imageInput.value?.click()
}

const { canUndo, canRedo } = useHistory(editor)
// 快捷键注册表的绑定桥（工单 14）：撤销/重做/复制/粘贴/副本/删除走集中注册表；
// Ctrl/Cmd+S 保存是宿主职责，仍在下方 onKeydown 自理。让路规则（文本编辑态/
// 输入框/输入法）由内核分类器裁决，textarea 与属性面板输入框原生编辑优先。
// ⇧R（标尺开关）同随注册表自带（ruler-guides-snap 工单 01 入表），宿主零键位代码。
useShortcuts(editor)

// ---- 工具栏三下拉 + 查找钮（editor-top-toolbar 工单 03）：变体 A 的指针入口 ----

/** 键位后缀按宿主平台渲染（⌘] 或 Ctrl+]）：直查注册表，文案不另抄键位；平台
 *  不会话中变更，挂载时求值一次（ContextMenu/LayerPanel 同门先例） */
const shortcutPlatform = detectShortcutPlatform()

/** 层型 → 武装快捷键动作（内核 ARM_CREATE_LAYER_TYPES 反查视图）：插入▾ 项的
 *  键位后缀直查注册表（注册表是键位唯一事实源） */
const ARM_CREATE_ACTION_BY_TYPE = Object.fromEntries(
    Object.entries(ARM_CREATE_LAYER_TYPES).map(([action, type]) => [type, action]),
) as Record<LayerType, EditorShortcutAction>

/** 插入▾（组3）：面板＋ ADD_LAYER_MENU 同源四项（文案与 title 单点维护；
 *  「模板表…」只属面板＋表单），点击 = 武装画拉 + 状态栏瞬时提示——与面板＋、
 *  T/G/Q/I 快捷键三缝同句（ARM_LAYER_CREATE_HINT）。直建语义退役（spec Q7）：
 *  删除旧四钮的 addRootLayer 直调，死区点击兜底缺省尺寸，直建价值不丢 */
const insertItems = computed<DropdownMenuEntry[]>(() =>
    ADD_LAYER_MENU.map((entry) => ({
        label: entry.label,
        title: entry.title,
        shortcut: shortcutActionLabel(ARM_CREATE_ACTION_BY_TYPE[entry.type], shortcutPlatform),
        run: () => {
            editor.armLayerCreate(entry.type)
            useTransientFeedback().show(ARM_LAYER_CREATE_HINT)
        },
    })),
)

/** 选中路径（响应式桥）：排列▾ 灰态判定与动作入参共用 */
const selection = useSelection(editor)

/** 排列▾ 灰态（spec Q4）：无选中或选中非根层 → 全组置灰 + title（内核
 *  isRootLayerPath 空转守卫是正确性防线，灰态只是引导） */
const ARRANGE_GRAY_TITLE = '仅根图层可排列'
const canArrange = computed(() => selection.value !== null && isRootLayerPath(selection.value))

/** 排列▾/视图▾ 动态读数桥：editor.store 非响应式（禁深度 reactive 红线），按
 *  分支订阅同步 shallowRef（Ruler.vue rulersVisible 同款）——动态标签（锁定↔
 *  解锁、显示↔隐藏，右键菜单显隐同款）与标尺勾选态不得滞留旧值 */
const docSnapshot = shallowRef(editor.store.doc)
const lockedPaths = shallowRef(editor.store.ui.lockedPaths)
const rulersVisible = shallowRef(editor.store.ui.rulersVisible)
const unsubscribeToolbarReads = editor.subscribe((change) => {
    if (change.scope === 'doc') {
        docSnapshot.value = editor.store.doc
        return
    }
    if (change.scope !== 'ui') return
    if (change.branch === 'lockedPaths') lockedPaths.value = editor.store.ui.lockedPaths
    if (change.branch === 'rulersVisible') rulersVisible.value = editor.store.ui.rulersVisible
})

/** 选中根层的可见/锁定态（非根/无选择按可见/未锁兜底，ContextMenu 同门） */
const selectedRootVisible = computed(() => {
    const path = selection.value
    const doc = docSnapshot.value
    if (!path || !doc || !isRootLayerPath(path)) return true
    return rootLayerOf(doc, path)?.visible ?? true
})
const selectedRootLocked = computed(() => {
    const path = selection.value
    return path !== null && isLockedPath(path, lockedPaths.value)
})

/** 排列▾（组5）：z 序四件 + 锁定/显隐，键位后缀直查注册表；动作与右键菜单同缝
 *  （显隐/锁定传当前选中路径，z 序四件内核直吃当前选中）；前移/后移、置顶/置底
 *  到边界不置灰——内核空转为权威（无历史步，右键菜单同门）。「排列」命名按
 *  spec Q5 预留 v2 对齐分布语义（帮助文案不得解释成「对齐」） */
const arrangeItems = computed<DropdownMenuEntry[]>(() => {
    const gray = !canArrange.value
    const title = gray ? ARRANGE_GRAY_TITLE : undefined
    const path = selection.value
    return [
        {
            label: '前移一层',
            shortcut: shortcutActionLabel('bringForward', shortcutPlatform),
            disabled: gray,
            title,
            run: () => editor.bringForward(),
        },
        {
            label: '后移一层',
            shortcut: shortcutActionLabel('sendBackward', shortcutPlatform),
            disabled: gray,
            title,
            run: () => editor.sendBackward(),
        },
        {
            label: '置顶',
            shortcut: shortcutActionLabel('bringToFront', shortcutPlatform),
            disabled: gray,
            title,
            run: () => editor.bringToFront(),
        },
        {
            label: '置底',
            shortcut: shortcutActionLabel('sendToBack', shortcutPlatform),
            disabled: gray,
            title,
            run: () => editor.sendToBack(),
        },
        'separator',
        {
            label: selectedRootLocked.value ? '解锁' : '锁定',
            shortcut: shortcutActionLabel('toggleLayerLock', shortcutPlatform),
            disabled: gray,
            title,
            run: () => {
                if (path) editor.toggleLayerLock(path)
            },
        },
        {
            label: selectedRootVisible.value ? '隐藏' : '显示',
            shortcut: shortcutActionLabel('toggleLayerVisibility', shortcutPlatform),
            disabled: gray,
            title,
            run: () => {
                if (path) editor.toggleLayerVisibility(path)
            },
        },
    ]
})

/** 视图▾（组6）：缩放三件 = ⌘0/⇧1/⇧2 的键位镜像（spec Q11，不含放大/缩小
 *  步进——缩放控件唯一归状态栏）；标尺 ✓ 勾选项（spec Q9 推翻旧拍板，读数随
 *  ⇧R 双向同步）；清空参考线（spec Q10：内核 clearGuides()，无确认直接清，
 *  会话级不可撤销由 title 标注） */
const viewItems = computed<DropdownMenuEntry[]>(() => [
    {
        label: '100%',
        shortcut: shortcutActionLabel('zoomReset', shortcutPlatform),
        run: () => editor.resetZoom(),
    },
    {
        label: '适应画布',
        shortcut: shortcutActionLabel('fitToSurface', shortcutPlatform),
        run: () => editor.fitToSurface(),
    },
    {
        label: '适应选区',
        shortcut: shortcutActionLabel('fitToSelection', shortcutPlatform),
        run: () => editor.fitToSelection(),
    },
    'separator',
    {
        label: rulersVisible.value ? '✓ 标尺' : '标尺',
        shortcut: shortcutActionLabel('toggleRulers', shortcutPlatform),
        title: '标尺显隐（⇧R 同效）',
        run: () => editor.toggleRulers(),
    },
    {
        label: '清空参考线',
        title: '清空全部参考线（会话级，不可撤销；重建成本低——从标尺拖出即可）',
        run: () => editor.clearGuides(),
    },
])

// 参考线层实例（ruler-guides-snap 工单 04）：承接 Ruler 拖出参考线四事件的转发
// 目标（begin/move/end/cancel defineExpose 对接面见 GuidesOverlay.vue 头注）
const guidesOverlayRef = ref<InstanceType<typeof GuidesOverlay> | null>(null)

const assetsNote = ref('资源物化中…')
/** 文档操作读数（保存/打开/导出/上传的状态与预览语义标注；状态栏反馈段显示） */
const docNote = ref('')
/** 物化在途计数（状态栏「物化中」段）：Materializer 住渲染端包，订阅后注入 StatusBar */
const pendingCount = ref(0)

// ---- 头栏（工单 02）：一行化 topbar 的徽标读数与帮助抽屉开关 ----

/** 画布规格徽标：doc 宽×高 + 横竖版派生（高>宽 竖版 / 宽>高 横版 / 相等 方版）；
 *  空文档降级为隐藏（badge 为 null，v-if 不渲染）。文档维度只随 doc 通知变化，
 *  本地订阅即可（useDoc 切片桥是 status-bar 域内部件，不在 editor-vue 出口面）。 */
const canvasSize = ref<{ width: number; height: number } | null>(null)
function syncCanvasSize(): void {
    const doc = editor.store.doc
    canvasSize.value = doc ? { width: doc.width, height: doc.height } : null
}
const unsubscribeCanvasBadge = editor.subscribe((change) => {
    if (change.scope === 'doc') syncCanvasSize()
})
syncCanvasSize()
const canvasBadge = computed(() => {
    const size = canvasSize.value
    if (!size) return null
    const orientation = size.height > size.width ? '竖版' : size.width > size.height ? '横版' : '方版'
    return `${size.width} × ${size.height} · ${orientation}`
})

/** 帮助抽屉开关：头栏「帮助」开；✕ / 点遮罩 / Esc 关 */
const helpOpen = ref(false)
const helpDrawer = ref<HTMLElement | null>(null)
watch(helpOpen, (open) => {
    if (open) nextTick(() => helpDrawer.value?.focus())
})
/** 输入法合成中的按键不触发文档级快捷键（Ctrl+S 与抽屉 Esc 同守卫） */
function isImeComposing(event: KeyboardEvent): boolean {
    return event.isComposing || event.keyCode === 229
}

/** Esc 关抽屉：capture 相先于 useShortcuts 的冒泡监听，拦下 Esc 不让编辑器同时
 *  处理（选区逐级升级）；输入法合成中不拦。常驻监听、helpOpen 门控。 */
function onDrawerKeydown(event: KeyboardEvent): void {
    if (!helpOpen.value || event.key !== 'Escape') return
    if (isImeComposing(event)) return
    event.stopPropagation()
    helpOpen.value = false
}
window.addEventListener('keydown', onDrawerKeydown, { capture: true })

let materializer: Materializer | null = null
let contentBackend: Canvas2DBackend | null = null
/** 网格底纹后端（内容层子类）：开关态由本组件持有，直改 enabled 后 invalidate */
let gridBackdrop: GridBackdropBackend | null = null
let overlayCtx: CanvasRenderingContext2D | null = null
let unsubscribeAssets: (() => void) | null = null
let unsubscribeDoc: (() => void) | null = null

/** 覆盖层画笔：资源状态标识（playground-canvas-first 工单 04）+ 查找命中轮廓
 *  （canvas-web-find-replace 工单 04 接线）+ 选区 gizmo（工单 06）+ 画拉橡皮筋
 *  （drag-create 工单 02）。与内容层同一呈现变换（场景坐标，经共享的
 *  applyViewportTransform 施加），但重绘入口独立（选择/悬停/查找/建层会话只脏
 *  覆盖层）。组合序按 findHighlight 调用契约：资源标识 → 命中高亮 → 选区 gizmo
 *  （当前命中与选区框重叠时选区框压上）→ 橡皮筋（手势进行中最顶层）。 */
const overlayPainter: OverlayPainter = (args) => {
    const ctx = overlayCtx
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    if (!args.doc) return
    applyViewportTransform(ctx, { dpr: args.dpr, zoom: args.viewport.zoom, x: args.viewport.x, y: args.viewport.y })
    drawResourceMarkers(ctx, args.doc, (materializer?.state ?? {}) as ResourceState)
    drawFindMatches(ctx, editor, args)
    drawSelectionGizmo(ctx, editor, args)
    drawCreateRubberBand(ctx, editor, args)
}

function assetsStatus(state: ResourceState, pendingCount: number): string {
    const failed = Object.values(state).filter((e) => e.status === 'failed')
    if (pendingCount > 0) return `资源物化中（在途 ${pendingCount}）…`
    if (failed.length > 0) return `部分资源物化失败（占位 + 红叉标识）：${failed.length} 项`
    return '资源就绪，已渲染'
}

// ---- 保存 / 打开（工单 13）：保存时机归宿主，core 只经 doc 订阅给变更信号 ----

/** 打开/保存的基线快照（canonical encode JSON）；文档 JSON 与它不同即「未保存」 */
const savedSnapshot = ref<string | null>(null)
const isDirty = ref(false)
const graphFileName = ref('canvas.graph.json')

function syncDirty(): void {
    const current = editor.store.doc ? JSON.stringify(encodeGraph(editor.store.doc)) : null
    isDirty.value = current !== null && current !== savedSnapshot.value
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
}

function saveGraph(): void {
    const doc = editor.store.doc
    if (!doc) return
    // 保存产物 = canonical graph JSON（文件美化缩进便于人读；基线比较用紧凑串）
    const json = JSON.stringify(encodeGraph(doc), null, 2)
    downloadBlob(new Blob([json], { type: 'application/json' }), graphFileName.value)
    markCleanBaseline(doc, graphFileName.value)
    docNote.value = `已保存 graph JSON（${graphFileName.value}）· 再次打开无损复原`
}

/** 打开/载入后的 clean 基线：canonical encode 快照（刚打开不算未保存）+ 文件名 + 标记复位 */
function markCleanBaseline(doc: ReturnType<typeof decodeGraph>, name: string): void {
    savedSnapshot.value = JSON.stringify(encodeGraph(doc))
    graphFileName.value = name
    syncDirty()
}

async function onOpenGraphFile(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement
    const file = inputEl.files?.[0]
    inputEl.value = ''
    if (!file) return
    try {
        const doc = decodeGraph(JSON.parse(await file.text()))
        editor.openDocument(doc)
        // 打开即 clean 基线：与保存同源（canonical encode）
        markCleanBaseline(doc, file.name)
        materializer?.materialize(doc)
        editor.fitToSurface()
        docNote.value = `已打开 ${file.name}（graph JSON 解码，未保存标记复位）`
    } catch (error) {
        docNote.value = `打开失败：${error instanceof Error ? error.message : String(error)}`
    }
}

/** 关闭前提醒：有未保存变更时弹浏览器通用确认（文案由浏览器定） */
function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!isDirty.value) return
    event.preventDefault()
    event.returnValue = ''
}
window.addEventListener('beforeunload', onBeforeUnload)

// ---- 目验样图（工单 15）：php-canvas-image-renderer visual-check 同场景一键载入 ----

/** 一键打开目验样图：中文禁则断行/表格/QR/priority 叠放，人工核对预览观感 */
function loadVisualCheckGraph(): void {
    const doc = buildVisualCheckGraph()
    editor.openDocument(doc)
    markCleanBaseline(doc, 'visual-check.graph.json')
    materializer?.materialize(doc)
    editor.fitToSurface()
    docNote.value = '已载入目验样图（php visual-check 同场景：中文禁则/表格/QR/priority 叠放）'
}

// ---- 数据源 schema 注入入口（工单 03/11 目验）：宿主随会话注入三态 + 编译诊断面板 ----

/** 注入样例声明（证书 form-data，工单 11）：载荷形态（D1），顶层键 = 根上下文候选；
 *  全树 deref 零诊断 → 面板「已编译，无诊断」（读数由 applyDataSourceSchema 直取） */
function injectSampleSchema(): void {
    applyDataSourceSchema(SAMPLE_DATASET_SCHEMA, '已注入证书 form-data schema（根级 13 键 = 根上下文候选；编译读数见注入面板）')
}

/** 注入非法声明（根级保留键 row）：整份拒绝降级无候选 + console 警告，不弹错不抛错 */
function injectInvalidSchema(): void {
    applyDataSourceSchema(INVALID_DATASET_SCHEMA, '已注入非法声明（根级保留键 row）→ 声明被拒降级无候选；警告走 console.warn，不弹错')
}

/** 注入断链/环诊断样例（工单 11，D12）：$ref 四类局部故障节点降级为叶子，
 *  面板逐条显示诊断，健康分支照常出候选；编辑器只降级不弹错 */
function injectDiagnosticSchema(): void {
    applyDataSourceSchema(DIAGNOSTIC_DATASET_SCHEMA, '已注入断链/环诊断样例（局部降级逐条见注入面板；健康分支照常出候选，console.warn 汇总一次）')
}

/** 清除声明：未注入 = 无候选（清除不告警） */
function clearDataSourceSchema(): void {
    applyDataSourceSchema(null, '已清除数据源 schema 声明（未注入 = 无候选）')
}

// ---- 导出（工单 13，ADR 0004）：浏览器 PNG 是预览图，非终图 ----

const exporting = ref(false)

async function exportPreview(): Promise<void> {
    const doc = editor.store.doc
    // 导出消费预览视图（决策 2026-09）：模板态表格以一行预览行出图，与画布所见一致
    const view = editor.previewCanvas
    if (!doc || !view || !contentBackend || !materializer || exporting.value) return
    exporting.value = true
    docNote.value = '导出预览：等待全部资源物化…'
    try {
        materializer.materialize(doc) // 兜底补调度（面板改 URL 后的增量引用）
        const state = await materializer.whenSettled()
        const failed = Object.values(state).filter((e) => e.status === 'failed').length
        // 文本布局策略与编辑会话同一注入值：导出与画布的断行/盒高不分叉
        const result = await exportPreviewPng(view, contentBackend, { textPolicies: editor.textPolicies })
        const base = graphFileName.value.replace(/\.json$/i, '')
        downloadBlob(result.blob, `${base}-preview.png`)
        docNote.value =
            failed > 0
                ? `已导出预览 PNG（预览图，非终图；${failed} 项资源失败以占位出图）· ${result.width}×${result.height}`
                : `已导出预览 PNG（预览图，非终图）· ${result.width}×${result.height}`
    } catch (error) {
        docNote.value = `导出失败：${error instanceof Error ? error.message : String(error)}`
    } finally {
        exporting.value = false
    }
}

// ---- 上传（工单 13）：本机选图 → data URL 内联 → 新建图片图层 ----

async function onImageFile(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement
    const file = inputEl.files?.[0]
    inputEl.value = ''
    if (!file) return
    try {
        const path = await editor.uploadImageAsLayer(await uploadFileFromDom(file))
        docNote.value = path
            ? `已上传并新建图片图层：${describePath(path)} · ${file.name}（data URL 兜底，内联进保存产物）`
            : '上传完成但文档未打开（先打开一份 graph）'
    } catch (error) {
        docNote.value = `上传失败：${error instanceof Error ? error.message : String(error)}`
    }
}

/** 路径读数直接用绑定层的 formatLayerPath（与状态栏同一格式） */
const describePath = formatLayerPath

function onReady({ contentCanvas, overlayCanvas }: CanvasSurfaceReady) {
    const contentCtx = contentCanvas.getContext('2d')
    overlayCtx = overlayCanvas.getContext('2d')
    if (!contentCtx || !overlayCtx) return

    const backend = new GridBackdropBackend(contentCtx)
    gridBackdrop = backend
    gridBackdrop.enabled = gridEnabled.value
    contentBackend = backend
    // 跨域资源可经 new Materializer(backend, { imageProxy }) 注入代理改写；
    // 本页资源全部同源，无需代理。
    materializer = new Materializer(backend)

    editor.attachContentBackend(backend)
    editor.setOverlayPainter(overlayPainter)

    unsubscribeAssets = materializer.subscribe(() => {
        assetsNote.value = assetsStatus(materializer!.state, materializer!.pendingCount)
        pendingCount.value = materializer!.pendingCount
        // 双层都脏：内容层补绘新就绪资源，覆盖层的占位/失败标识随之消失或变色——
        // 标识画在覆盖层，只脏内容层会留灰叉残影（工单 15 修正）
        editor.invalidate('both')
    })

    // 文档变更 = 内核对宿主暴露的「文档已变更」信号：驱动物化补调度 + 未保存标记。
    // 编辑动作、撤销/重做、打开文档都以 doc 通知收口，这里统一消费。
    unsubscribeDoc = editor.subscribe((change) => {
        if (change.scope !== 'doc') return
        const doc = editor.store.doc
        if (doc) materializer?.materialize(doc)
        syncDirty()
    })

    const doc = decodeGraph(JSON.parse(DEMO_GRAPH_JSON))
    editor.openDocument(doc)
    markCleanBaseline(doc, graphFileName.value)
    materializer.materialize(doc)
    editor.fitToSurface() // 初始进入：整页 fit-min 语义
}

/** 键盘：仅 Ctrl/Cmd+S（保存是宿主职责，不入内核注册表）。文本编辑中键盘路由
 *  进 textarea：Ctrl+Z 撤「输入」而非文档（useShortcuts 的让路规则同源裁决），
 *  保存同理不抢。其余快捷键（撤销/重做/复制/粘贴/副本/删除）已由 useShortcuts
 *  统一接注册表处理。 */
function onKeydown(event: KeyboardEvent): void {
    if (editor.store.ui.editing !== null) return
    const mod = event.ctrlKey || event.metaKey
    if (mod && !event.shiftKey && event.key.toLowerCase() === 's') {
        if (isImeComposing(event)) return
        event.preventDefault()
        saveGraph()
    }
}
window.addEventListener('keydown', onKeydown)

// ---- 桌面网格（原型）：区分画布与背景的底纹开关 ----

/** 网格显隐（原型会话态：不入 store、不落盘）；默认开——打开即见纸面/桌面之分 */
const gridEnabled = ref(true)

function toggleGrid(): void {
    gridEnabled.value = !gridEnabled.value
    if (gridBackdrop) gridBackdrop.enabled = gridEnabled.value
    // 网格垫在内容层 begin 之后，重绘档位 content 足够（覆盖层 gizmo 不动）
    editor.invalidate('content')
}

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown)
    window.removeEventListener('keydown', onDrawerKeydown, { capture: true })
    window.removeEventListener('beforeunload', onBeforeUnload)
    unsubscribeAssets?.()
    unsubscribeDoc?.()
    unsubscribeCanvasBadge()
    unsubscribeToolbarReads()
    unsubscribeCatalog()
    editor.dispose()
})
</script>

<template>
    <main class="stage">
        <!-- 头栏一行化（playground-canvas-first 工单 02，spec 决策 1）：48px 单行。
             左格 = 文档名 + 未保存点（●/○）+ 画布规格徽标（宽×高 · 横竖版派生，
             空文档隐藏；「模板」态标记不做——模板语义内核能力未立项）；右格 =
             「帮助」ghost 钮（开帮助抽屉）+「导出预览 PNG」主按钮（导出中禁用态
             与预览图/非终图语义保留）。头部旧四行读数已拆：缩放/选中/坐标/schema
             由 StatusBar 组件内部直读，资源/保存/反馈经下方 prop 注入。 -->
        <header class="topbar" aria-label="文档头栏">
            <div class="topbar-doc">
                <span
                    class="dirty-dot"
                    :class="{ 'is-dirty': isDirty }"
                    data-dirty-mark
                    :title="isDirty ? '未保存（文档与最近一次保存/打开基线不一致）' : '已保存'"
                >{{ isDirty ? '●' : '○' }}</span>
                <span class="doc-name" data-doc-name>{{ graphFileName }}</span>
                <span v-if="canvasBadge" class="canvas-badge" data-canvas-badge>{{ canvasBadge }}</span>
            </div>
            <div class="topbar-actions">
                <button type="button" class="ghost" data-help title="打开帮助抽屉（使用说明 + 开发者目验区）" @click="helpOpen = true">？ 帮助</button>
                <!-- editor.store.doc 是非响应式读数，按钮可用态不做文档门（处理器自守卫），
                     导出中状态走响应式 exporting -->
                <button type="button" class="primary" data-export title="导出浏览器预览 PNG（预览图，非终图；先等待全量物化）" :disabled="exporting" @click="exportPreview">
                    {{ exporting ? '导出中…' : '导出预览 PNG' }}
                </button>
            </div>
        </header>

        <!-- 工具栏重组（editor-top-toolbar 工单 03，spec 变体 A）：44px 单行六组。
             分组与归口拍板见文件头「工单 03」注释块（单点维护，防注释与实现漂移）：
             文件｜历史｜＋插入▾｜查找｜排列▾｜视图▾｜右端网格开关。三下拉底座 =
             editor-vue/shared DropdownMenu（工单 02），触发钮 ghost 形态自带；插入
             组亮色（.tb-insert 经 :deep 着色）引导高频动作。查找钮 = beginFind()
             与 ⌘F 同缝。网格钮 margin-left:auto 弹性空隙推右端。隐藏文件入口
             input 收尾（display:none 不占弹性位）。 -->
        <section class="toolbar" aria-label="编辑器工具栏">
            <!-- 文件组：打开 / 保存 / 上传图片（动作与禁用态维持现状） -->
            <button type="button" data-open title="打开 graph JSON（解码回编辑器）" @click="onOpenClick">打开</button>
            <button type="button" data-save title="保存 graph JSON（Ctrl/Cmd+S）" @click="saveGraph">保存</button>
            <button type="button" data-upload-image title="本机选图 → 上传（data URL 兜底）→ 新建图片图层（宿主未注入上传实现时禁用）" :disabled="!editor.canUpload" @click="onUploadImageClick">上传图片</button>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <!-- 历史组：撤销 / 重做 -->
            <button
                type="button"
                data-undo
                title="撤销（Ctrl/Cmd+Z）"
                :disabled="!canUndo"
                @click="editor.undo()"
            >
                撤销
            </button>
            <button
                type="button"
                data-redo
                title="重做（Ctrl/Cmd+Shift+Z 或 Ctrl+Y）"
                :disabled="!canRedo"
                @click="editor.redo()"
            >
                重做
            </button>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <!-- 插入组：面板＋同源四项统一武装画拉（直建退役，spec Q7/Q8）；＋图片
                 建空层，本机选图上传建带像素层走「上传图片」 -->
            <DropdownMenu
                class="tb-insert"
                data-insert-menu
                label="＋插入"
                :items="insertItems"
                title="插入图层（四类层型统一画拉：点击后在画布拖拽定落位与尺寸，Esc 取消）"
            />
            <span class="toolbar-divider" aria-hidden="true"></span>
            <!-- 查找：⌘F 同缝（FindBar 开合随内核会话态，互斥不双开；查找条本体
                 在画布顶部浮层，canvas-web-find-replace 工单 03 内挂） -->
            <button type="button" data-find title="查找替换（Ctrl/Cmd+F 同效；查找条开在画布顶部）" @click="editor.beginFind()">查找</button>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <!-- 排列组：z 序四件 + 锁定/显隐（仅根图层可排列，灰态 + title 引导） -->
            <DropdownMenu
                class="tb-arrange"
                data-arrange-menu
                label="排列"
                :items="arrangeItems"
                title="排列：z 序与锁定/显隐"
            />
            <span class="toolbar-divider" aria-hidden="true"></span>
            <!-- 视图组：缩放键位镜像 + 标尺开关 + 清空参考线（spec Q9/Q10/Q11） -->
            <DropdownMenu
                class="tb-view"
                data-view-menu
                label="视图"
                :items="viewItems"
                title="视图：缩放键位镜像 / 标尺 / 参考线"
            />
            <span class="toolbar-divider" aria-hidden="true"></span>
            <!-- 右端开关：桌面网格（原型）。网格垫在内容层 begin 后、只画纸面外
                 桌面（evenodd 挖掉纸面矩形）——桌面有纹理、纸面保持平滑，边界恒
                 清晰；导出走 fork 后端不带网格。独立开关不入视图下拉（spec Q1）。 -->
            <button
                type="button"
                class="tb-grid"
                :class="{ 'tb-on': gridEnabled }"
                data-grid-toggle
                title="桌面网格线（区分画布与背景；只影响编辑器预览，不进导出 PNG）"
                @click="toggleGrid"
            >
                网格
            </button>
            <!-- 隐藏文件入口：打开 graph JSON / 本机选图 -->
            <input ref="openInput" type="file" accept=".json,application/json" class="hidden" @change="onOpenGraphFile" />
            <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="onImageFile" />
        </section>

        <section class="workbench" aria-label="画布与面板">
            <LayerPanel :editor="editor" />
            <!-- canvas-area：画布覆盖物（标尺/参考线/对齐浮条）的宿主级定位上下文。
                 覆盖物是 CanvasSurface 的兄弟而非子元素——画布事件桥全部挂在
                 .cn-surface 上，覆盖物点击不会透进画布（不触发点选/平移）。
                 缩放浮条 kbd-nav 工单 06 起退役，缩放入口唯一归状态栏缩放控件。 -->
            <div class="canvas-area">
                <CanvasSurface class="surface" :editor="editor" @ready="onReady" />
                <!-- 参考线/吸附线层（ruler-guides-snap 工单 04，spec 决策 4/5）：root
                     自带 absolute inset:0 + pointer-events:none（只有参考线命中条收
                     事件），与 .surface 同矩形直挂、浮于画布之上，线体与内容层同一
                     呈现视口换算（挂载契约见组件头注）。data-guide-* / data-snap-*
                     钩子、拖出预览/落线/拖回删除全在组件内，宿主只出挂点。挂点次序
                     在标尺之前：拖回删除的落点判定（elementFromPoint 命中 data-ruler-*）
                     要求标尺条盖在参考线命中条之上，标尺带内拖回才删得掉。 -->
                <GuidesOverlay ref="guidesOverlayRef" :editor="editor" />
                <!-- 标尺（ruler-guides-snap 工单 04，spec 决策 3/5）：画布容器顶+左
                     贴边宿主挂载——壳 pointer-events:none 不拦画布事件（条自收），
                     条外缘与内容区贴边对齐（手势坐标换算前提，挂载契约见 Ruler.vue
                     头注）；⇧R 开关随内核注册表自带，宿主零键位代码。从标尺拖出
                     参考线的四事件转发到参考线层（载荷直传，工单 03 对接面）；内联
                     箭头保证每次触发都取当前 ref（成员表达式写法会把首渲染时的
                     undefined 钉死在 prop 上）。data-ruler-* 钩子组件自带。 -->
                <div class="ruler-shell">
                    <Ruler
                        :editor="editor"
                        @guide-drag-start="(g) => guidesOverlayRef?.beginGuideDrag(g)"
                        @guide-drag-move="(g) => guidesOverlayRef?.moveGuideDrag(g)"
                        @guide-drag-end="(g) => guidesOverlayRef?.endGuideDrag(g)"
                        @guide-drag-cancel="() => guidesOverlayRef?.cancelGuideDrag()"
                    />
                </div>
                <!-- 对齐浮条（layer-align-snap 工单 03，spec 决策 3）：画布容器顶部
                     居中宿主级挂载（原型 FIG.2 .float.align 落位），浮于 CanvasSurface
                     之上——画布事件桥全在 .cn-surface 上，浮条点击不透进画布。
                     组件自身零页面定位（工单 02），宿主只出 .align-float 定位壳；
                     暗色令牌组件自带（#0b1220 族与壳层面板同值），选中态/禁用态/
                     逐键 data-align-* 钩子全在组件内。 -->
                <AlignFloatBar class="align-float" :editor="editor" />
            </div>
            <PropertyPanel :editor="editor" />
        </section>

        <!-- 状态栏收编全部读数（playground-canvas-first 工单 01，工单 02 起头部读数
             已拆、此处是唯一读数归口）：组件内直读的缩放/选中路径/坐标尺寸/schema
             声明态之外，资源/保存/反馈三段由宿主注入（物化状态订阅 assetsNote、
             dirty 基线 isDirty、动作读数 docNote）。 -->
        <StatusBar
            class="statusbar"
            :editor="editor"
            :pending-count="pendingCount"
            :resource-note="assetsNote"
            :save-state="isDirty ? 'dirty' : 'clean'"
            :feedback="docNote"
        />

        <!-- 快捷键帮助面板（kbd-nav 工单 06 挂载，工单 04 组件）：Teleport body
             自带令牌；开合态是 useShortcutsHelp 单例——⌘/ 入口随 useShortcuts 桥、
             状态栏「快捷键」段按钮随 StatusBar，双入口共享同一 open 态，宿主
             零键位代码、全壳挂载一次。 -->
        <HelpDialog />

        <!-- 帮助抽屉（playground-canvas-first 工单 02，spec 决策 2）：头栏「帮助」开
             的宿主级浮层，Teleport 到 body（fixed 定位不占文档流，不破工单 05 的
             全视口零滚动）。两个分区：
             使用说明区 = 原 legend 全量条目原样迁移（文案不改写，spec 范围外）；
             开发者区 = 原 header 工票长文原样 + 目验样图 + schema 注入/非法/清除三键
             （行为与 data-visual-check / data-schema-* 钩子不变，仅落位迁移）。 -->
        <Teleport to="body">
            <div v-if="helpOpen" class="help-overlay" @click.self="helpOpen = false">
                <aside
                    ref="helpDrawer"
                    class="help-drawer"
                    role="dialog"
                    aria-modal="true"
                    aria-label="帮助"
                    data-help-drawer
                    tabindex="-1"
                >
                    <div class="help-head">
                        <h2>帮助</h2>
                        <button type="button" class="help-close" data-help-close title="关闭帮助（Esc）" @click="helpOpen = false">✕</button>
                    </div>
                    <div class="help-body">
                        <section class="help-section" aria-label="使用说明">
                            <h3>使用说明</h3>
                            <ul>
                                <li><b>剪贴板（工单 14）</b>：选中图层后 <b>Ctrl/Cmd+C</b> 复制、<b>Ctrl/Cmd+V</b> 粘贴、<b>Ctrl/Cmd+D</b> 创建副本（右键菜单「创建副本」同款）；复制的是<b>整棵子树深拷贝</b>（表格连行/格/内容一起复制，复制后改原件不影响粘贴产物）；粘贴<b>置顶</b>（priority = min−1）且位置偏移 +20 不与原件重叠，连续粘贴偏移递增（+20、+40…）互不压叠；一次粘贴/副本 = 一步历史，Ctrl/Cmd+Z 可撤销；副本不覆盖剪贴板（复制 A → 副本 B → 粘贴仍出 A）；行/格不可复制（容器内结构），格内容可复制出表</li>
                                <li><b>右键菜单（工单 14）</b>：画布上<b>右键点图层</b> = 选中并弹出最小菜单（创建副本/置顶/置底/删除）——按视口坐标定位（pan/zoom 不跟随、画布边缘自动钳位）；可用态随选择裁剪：置顶/置底只对根层生效（表格行/格是数组序语义），菜单上右键/点菜单外/Esc/执行动作即关；textarea 内右键仍是浏览器原生菜单</li>
                                <li><b>快捷键面板（kbd-nav 工单 04/06）</b>：<b>⌘/（Ctrl+/）或状态栏「快捷键」按钮</b>打开快捷键面板——注册表驱动列出全部键位（撤销/重做/删除/剪贴板/样式粘贴/z 序四件套/方向键微调/循环选层/<b>画拉建层 T·G·Q·I</b>/缩放/锁定与显隐/⇧R 标尺，新动作自动入面板）与内置交互（滚轮缩放/空格平移/<b>画拉建层</b>/双击编辑/Esc/方向键微调/Tab 循环）；<b>文本编辑态与输入框焦点自动让路</b>——编辑文本时 Delete/Backspace 只改文字不删图层、Ctrl/Cmd+Z 撤「输入」、属性面板输入框内原生编辑优先，<b>编辑文本时 T 打字不武装</b>；输入法候选窗里的按键不误触发（isComposing/229 守卫）</li>
                                <li><b>工具栏分组（editor-top-toolbar 工单 03）</b>：六组变体 A——文件（打开/保存/上传图片）｜撤销/重做｜<b>「＋插入▾」</b>（文本层/图片层/二维码层/表格四项统一<b>武装画拉</b>，与面板＋、T/G/Q/I 三缝同句；点击菜单即收 + 状态栏画拉提示，画布拖拽定落位与尺寸，死区点击落缺省尺寸，Esc 取消零副作用）｜<b>「查找」</b>（= Ctrl/Cmd+F 同缝；查找条开在画布顶部，Esc 关闭，与快捷键互斥不双开）｜<b>「排列▾」</b>（前移一层/后移一层/置顶/置底 + 锁定/解锁 + 显示/隐藏，键位后缀随平台——<b>仅根图层可排列</b>：无选中或选中行/格时全组置灰并提示原因；锁定/显隐标签随选中根层当前态翻转；z 序动作可撤销；「排列」管 z 序与锁定显隐，<b>不是对齐</b>——对齐分布属后续版本）｜<b>「视图▾」</b>（100%/适应画布/适应选区 = ⌘0/⇧1/⇧2 三个键位的可视入口，缩放控件仍唯一归状态栏；「✓ 标尺」勾选项与 ⇧R 双向同步；「清空参考线」一键清全部——会话级不可撤销，重拖即重建）｜右端<b>「网格」</b>独立开关（不进视图菜单）</li>
                                <li><b>状态栏（工单 14）</b>：画布下方的暗色读数条 = <b>缩放百分比</b>（随 ctrl/cmd+滚轮实时更新；<b>点击弹缩放菜单</b>——100%/适应画布/适应选区/放大/缩小，kbd-nav 工单 06 起缩放浮条退役、全壳缩放入口唯一归此）· <b>选中图层路径</b>（图层 N · 行 N · 格 N · 格内容，未选中回落文案）· <b>物化进行数</b>（在途资源装载 &gt; 0 时显示「物化中 N」，归零隐藏）</li>
                                <li><b>保存 / 打开（工单 13）</b>：<b>保存</b>（Ctrl/Cmd+S 或顶栏按钮）= 导出 canonical graph JSON 文件；<b>打开</b> = 解码回编辑器，再次打开无损复原（编辑→保存→打开→再保存字节级恒等）；保存时机归宿主，内核只经 store 订阅暴露「文档已变更」信号——顶部 <b>● 未保存</b> 标记随文档变更点亮、保存/打开后复位（撤销回已保存状态同样复位）；关闭页面前有未保存变更会弹确认</li>
                                <li><b>导出 PNG（预览图，非终图）</b>：顶栏「导出 PNG」先<b>等待全部资源物化</b>（慢资源在途时按钮显示「导出中…」、读数提示进行中），再全幅渲染下载；出图写入 PNG 元数据标注（tEXt: CanvasNext = preview render, not the final image）+ 文件名 <code>-preview.png</code> 后缀——<b>终图由服务端渲染端依据 graph JSON 权威产出</b>（ADR 0004），物化失败的资源以占位出图并在读数中注明</li>
                                <li><b>上传（本机资源 → 可物化引用）</b>：顶栏「上传图片」选本机图片 → 内核 uploadHandler 注入点转成引用 → 自动新建图片图层并选中（上传+建层 = 一步历史可撤销）；playground 以 <b>data URL 兜底</b>实现（内联进保存产物，可离线演示；生产宿主接自己的存储返回 URL）；<b>core 不内置任何上传实现</b>——未注入时上传入口禁用、动作抛明确错误（降级提示）</li>
                                <li><b>字体清单</b>：选中文本层 → 属性面板「字体」下拉 = 内置默认字体 + 清单条目（本页内置 Open Sans 演示项，URL 列表由宿主配置）；「上传」选本机字体文件（ttf/otf/woff）→ 加入清单（自定义条目，会话内可选）并落到当前文本层；清单 ≠ 物化，字体加载仍走渲染端物化管线；清单外引用原样保留在下拉（不静默改写）</li>
                                <li><b>文本编辑</b>：<b>双击文本层</b>就地编辑（textarea overlay 精确对位图层盒，CSS transform 缩放——缩放中字号视觉恒定、光标不丢）；中文输入法原生可用（候选窗里的 Esc/Enter 只操作候选不误提交）；<b>Esc / Ctrl+Enter / 点画布其他处 / 失焦</b>退出并一次性入一步历史（进入编辑不进历史）；清空文本提交 = 删除该图层，可撤销；编辑中该层文字由 textarea 呈现（内容层跳绘防重影），退出后恢复预览断行（断行允许与编辑态不同，决策 A）</li>
                                <li><b>点属性面板不误提交</b>：编辑中点面板/工具栏（画布外指针交互）的失焦被豁免，编辑会话保持——调完字号点回文本层继续写，文本仍是一步历史；编辑期间 Ctrl/Cmd+Z 撤「输入」而非文档（快捷键路由进 textarea）</li>
                                <li><b>图层面板</b>：左侧树形大纲<b>顶部 = 视觉最上层</b>（图层数组尾，priority 越大越垫底不反直觉）；表格展开三层嵌套（表 → 行 → 格/格内容）；点选行 = 画布选中、行悬停 = 画布高亮（双向联动，画布点选后行也高亮）</li>
                                <li><b>锁定图层（canvas-web-layer-lock 工单 02，会话级）</b>：根层行 hover 显<b>开锁钮</b>（锁定态闭锁常显，⇧⌘L 同效）——锁定层<b>整棵子树退出画布命中面</b>：点选/拖动/hover 高亮/右键都够不到（点到会穿透选中下方层），Delete/⌫ 与方向键误操作在内核空转；面板<b>删除按钮与右键菜单删除项变灰</b>；gizmo 对锁定选中层<b>只画选中框不画柄</b>（可定位、不可变换）；<b>锁定 ≠ 隐藏</b>——渲染/导出照常包含锁定层（锁定行不降不透明度），两态独立可叠加；属性面板全部字段、改名、显隐、z 序等刻意通道不受限；⌘D 副本无锁；解锁走面板钮或 ⇧⌘L（画布右键不做穿透）；锁定是会话态——不进历史、保存不带、换文档重置</li>
                                <li><b>拖动重排</b>：根层拖行上半/下半落位，画布叠放<b>即时变化</b>，priority 走中点插值（保存再打开顺序不变）；表格行拖动直接改数组序（行 0 恒在视觉顶部，行 priority 不参与），格拖动同款数组序语义；两套语义分立</li>
                                <li><b>画拉建层（canvas-web-drag-create 工单 03）</b>：面板「＋」菜单点层型或按 <b>T/G/Q/I</b>（文本/表格/二维码/图片）<b>武装</b>——状态栏瞬时提示「画拉或点击落层，Esc 取消」、画布转十字光标；<b>画布拖拽</b>出橡皮筋一次定落位与尺寸（移动缘贴邻层/画布中轴自动吸附、玫红吸附线回显，W×H 尺寸气泡实时跟随；二维码恒方形——高随宽从动；缩放状态下死区手感恒定）；<b>抬手落库</b>置顶并自动选中（文本层画完直接进入编辑可打字）；位移小于死区 = <b>点击兜底</b>（缺省尺寸、左上角对准点击点）；<b>Esc 解除零副作用</b>（不动文档不进历史）；一次手势 = 一步历史（Ctrl/Cmd+Z 整体回退落位+尺寸）；拖拽中改主意 = Esc 解除重新武装（无粘性工具态）；工具栏「＋插入▾」与面板＋同缝武装（见「增删」）</li>
                                <li><b>增删</b>：面板头「＋」菜单四类图层 = <b>武装画拉</b>（见上「画拉建层」——点菜单不再立即落层；<b>模板表仍表单直建</b>：rowsPath 必填校验就地拦）；工具栏<b>「＋插入▾」</b>四项（文本层/图片层/二维码层/表格）与面板＋<b>同缝武装画拉</b>（editor-top-toolbar 工单 03 起直建语义退役——画拉死区点击兜底缺省尺寸，「落原点直建」价值不丢；「模板表…」只属面板＋）；行尾 ✕ 删除（根层含整棵子树，行/格/格内容分别 splice/置空）；重排与删除均为一步历史，Ctrl/Cmd+Z 可撤销</li>
                                <li><b>表格编辑</b>：表节点悬停 <b>+行</b>（缺省行+格+文本，行宽=表宽）、行节点悬停 <b>+格</b>（缺省格+文本，行高取最高格）；<b>行可跨表拖动、格可跨行拖动</b>（重建路径与 graph 解码同一套 add 同步语义——跨表行宽重同步、跨行行高取最高格）；选中格后在属性面板开「高自适应」= 按<b>行数×行高+padding</b> 采纳内容动态高（autowrap 文本）；双击格内文本直接编辑（复用文本编辑 overlay）；建表→加行→改单元格文本→移动行，全程一步一撤销</li>
                                <li><b>属性面板</b>：点选图层后右侧按字段注册表自动生成表单——数值（X/Y/宽高/字号）逐键实时生效、change/blur 收口为一步历史；改背景色（取色器拖动实时）、文本内容（逐键实时，输入法合成中不误提交）、九宫锚点（点击即一步历史）；<b>内边距/边框 = CSS 风格简写控件（工单 04）</b>：方钮循环 1→2→4 值模式（单框/上下｜左右/四框），初始模式随数据推导、数据一变即重推导；展开不改数据、收缩立即取代表值（上/左）规整入一步历史（边框上为 null 收缩到 1 = 全 null 无边框）；边框宽+色共享模式，宽度 0 = 关、无边框空显示；未选中时显示画布宽/高；行宽/格内容宽高等被解码强同步的字段不出现（权威字段过滤）</li>
                                <li><b>撤销/重做</b>：顶栏按钮随历史栈自动可用/禁用；快捷键 <b>Ctrl/Cmd+Z</b> 撤销、<b>Ctrl/Cmd+Shift+Z</b>（或 Ctrl+Y）重做；上限 100 步、不跨会话，撤销后的新变更弃用重做分支（对齐 Figma）；面板连续输入合并为一步，blur 收口</li>
                                <li><b>点选</b>：左键点击图层（视觉最上层优先，负溢出画布外也可命中）；点表格选中格，<b>Esc 逐级升级 格→行→表</b>，再按清空；<b>点空白（含全幅底图）取消选中，底图经面板操作</b></li>
                                <li><b>拖动</b>：左键按住拖动，位置实时跟随（九锚点一视同仁，只改 x/y 增量）；<b>一次拖动 = 一步历史</b>（mergeKey 事务合并，撤销一次回到拖动前）；<b>左键拖空白（含全幅底图）= 平移画布</b></li>
                                <li><b>hover</b>：指针扫过的图层有淡蓝高亮，选中层蓝框常显（都画在 gizmo 覆盖层，不触发内容层重绘；<b>锁定层无高亮</b>——已退出命中面，gizmo 对其残留态同样过滤）</li>
                                <li><b>适应选区</b>：视口适配选中图层盒（表格可适配到行/格）；无选中时同「适应画布」</li>
                                <li>平移：空格（或中键）拖拽、<b>左键拖空白（含全幅底图）= 平移画布</b>、plain 滚轮上下左右、<b>shift + 滚轮横向</b>；缩放 <b>ctrl/cmd + 滚轮</b>以指针为中心，范围 5%–800%</li>
                                <li>顶部读数显示选中路径与 x/y/锚点（拖动时数值联动，与属性面板读同一文档数据）</li>
                                <li>工单 02–04 目验样例保留：priority 叠放 / cover / 中文禁则断行 / 表格 / 失败资源（右上红框）/ QR 固定选项（右下，贴角负边距）</li>
                                <li><b>目验样图（工单 15）</b>：工具栏「目验样图」一键载入 <b>php-canvas-image-renderer visual-check 同场景</b>（400×400）——头图色块 + 居中标题、长中文段落（<b>禁则</b>：行首不出现句号/逗号等收尾标点、英文词边界断行）、三行两列<b>表格</b>（表头底色 + 全边框）、<b>QR</b>（纠错 High/无静区/黑白）、双色图片条与页脚；<b>priority 叠放</b>（白底 11 → 头图 10 → 标题 5 → 内容层 4）。人工核对预览观感：预览断行允许与终图不同（决策 A），位置与盒尺寸应一致</li>
                                <li><b>就地编辑表达式（canvas-web-expression-editing 工单 03/04）</b>：<b>双击标记文本层 = 编辑表达式源文并保持标记</b>（旧语义「双击编辑标记文本即解除标记」自本特性起废止；面板侧字面写解标不变）——编辑会话期图层框上边框居中出<b>内容类型 pill（静态｜表达式）</b>，激活项随进入时标记态锚定、即本次提交去向（编辑中面板显示提交前旧状态）；点 pill 切换<b>只改会话标志</b>（零文档变更、零历史步）。提交矩阵：表达式会话含 ≥1 合法闭合片段 <code v-pre>{{…}}</code> → <b>保持标记</b>、text 自动重镜像（画布/图层面板前缀/属性面板即时同步）；<b>删空片段</b>（串中无合法片段）或 pill 切「静态」提交 → <b>解标回字面</b>（<code v-pre>{{…}}</code> 按字面保留）；空串提交删层。表达式会话下键入 <code v-pre>{{</code> 自动补 <code v-pre>}}</code>（空片段退格删对）、补全浮层与属性面板同源（候选来自数据源 schema，模板格内容 row. 上下文自动正确），↑↓/Enter/Tab/点选接受，静态会话零补全零配对；浮层开着 Esc 只关浮层、关着 Esc 才提交退出；zoom 0.5/2 下浮层锚点按缩放折算恒贴光标；一次编辑会话 = 一步历史（Ctrl/Cmd+Z 整体回退文本 + 标记态）。仅 TextLayer（根层文本 + 表格格内容文本）；Image/QR 表达式仍走属性面板</li>
                                <li><b>表格模板态与表达式标记（TableLayer V2，工票 03）</b>：中列 V2 目验区自上而下——<b>标记图片</b>（src 为表达式镜像字面 <span v-pre>{{org.logo}}</span>，按字面引用装载失败 → 占位 + 红叉，不崩渲染）、<b>标记二维码</b>（内容为字面 <span v-pre>{{certNo}}</span>，按字面出码）、<b>标记文本</b>（显示镜像字面 <span v-pre>证书 {{certName}} · 编号 {{certNo}}</span>，编辑器不求值——终图由服务端展开求值）、<b>模板态表格</b>（<b>空壳渲染</b>：表壳 bg/border 照画、行区零高——rows 为空、模板行不实例化）；模板子树不进大纲/不可选中/不参与物化，<b>面板编辑标记文本即解除标记回字面</b>（字面写解标双路径不变，保存后需重打标，spec §3.7）；画布双击自 canvas-web-expression-editing 起改为<b>就地编辑表达式并保持标记</b>（见上「就地编辑表达式」条）</li>
                                <li><b>数据源 schema 注入缝（content-completion 工单 03/11）</b>：<b>宿主随会话注入</b>（D2）——本页建立会话即注入<b>证书 form-data schema</b>（draft-07：$ref/definitions、嵌套对象树、数组、<b>additionalProperties: true</b> 开放映射；根级 13 键 = 根上下文候选，D1 声明即 <code>compile(canvas, dataset)</code> 的 data 载荷形状；表达式键树与演示 graph 对齐，见工票 03 条目）。开发者区注入键可重演：<b>注入 schema</b>（证书样例：机构/学员/培训/章节树/课件嵌套分支全可达；<code>fields</code> 开放映射无键候选但浮层出占位提示，<code>originCertificates</code> 徽标 array 无具名子候选；已编译无诊断）、<b>注入非法 schema</b>（根级保留键 <code>row</code> → 声明被拒：<b>整份拒绝降级无候选 + console.warn，不弹错不抛错</b>，前移填充期 reserved_root_key 硬错误）、<b>注入断链样例</b>（$ref 断链/外部指针/环引用/目标形态不符 → 故障节点<b>局部降级为叶子</b>，健康分支照常出候选）、<b>清除声明</b>（未注入 = 无候选，清除不告警）；<b>编译诊断面板</b>（工单 11，D12）直取 parseExpressionSchema 纯函数返回面——合法注入显示「已编译，无诊断」，局部降级逐条列出 path/诊断码/明细，供开发期排查方言问题（内核 console.warn 单点收口不变，编辑器始终降级不弹错）；声明只进编辑器会话态（store ui 分支）——<b>不进 graph、不落 localStorage、不动 wire</b>，换文档不重置；页头读数显示声明态（已注入键数 / 无候选）</li>
                                <li><b>表达式路径补全三字段接线（content-completion 工单 05）</b>：<b>仅表达式态生效</b>（ValueTypeSegmented 表达式段点亮）——选中标记文本/图片/二维码层，在 内容/资源地址 输入框键入 <code v-pre>{{</code> 自动弹出候选浮层（portal 到 body，不破 288px 面板）；<b>上下文感知</b>：根层 = 根候选集（载荷顶层键 + <code>$root</code>），模板表格<b>格内容层</b> = 行候选集（+ <code>row.*</code> / <code>$index</code>，<code>row.</code> 下钻 items 键树）；片段内 <code>.</code> 刷新候选、↑↓ 移动、Enter/Tab 接受（补全剩余路径段）、鼠标点选同效；接受 = 文本替换走既有 input/change 提交——<b>表达式 + 镜像同改、一步历史</b>，Ctrl/Cmd+Z 撤销一步恢复镜像；Esc/失焦/点外/<code v-pre>}}</code> 关闭；静态态与未注入声明零补全；中文输入法合成期按键不误触发（IME 守卫）；全角 <code>｛｛</code> 不触发属已知限制（Ctrl/Cmd+Space 手动触发兜底）</li>
                                <li><b>标尺 / 参考线 / 吸附线（ruler-guides-snap 工单 04）</b>：画布顶+左常显<b>标尺</b>（px 刻度、0 点=画布左上、随平移缩放联动；<b>⇧R 或工具栏「视图▾ → 标尺」</b>开关收起/展开，两入口双向同步）；<b>从标尺拖出参考线</b>（顶条出垂直线、左条出水平线，拖出途中自动吸附近旁图层缘/中心与画布中轴，抬手落线）；参考线横跨整个可视窗口（自标尺起线；天青实线、驻留）<b>拖回标尺即删除</b>（悬到标尺转红色预告）；<b>拖动图层</b>靠近其他图层的缘/中心、画布水平/垂直中轴时自动吸附，命中轴显示玫红虚线<b>吸附线</b>（瞬时回显、松手即消失；一次拖动至多吸一横一纵，隐藏层不供轴）；参考线与吸附线是<b>会话级</b>能力——不进历史（撤销/重做不回退）、不写文档（保存产物零改动），换文档即清空</li>
                                <li><b>桌面网格（原型）</b>：工具栏「网格」开关画布背景网格线——<b>只画纸面之外的桌面</b>（垫在图层之下、evenodd 挖掉纸面矩形），桌面有纹理、纸面保持平滑，「画布 vs 背景」之辨不随模板底图有无而失效；随平移缩放联动（线宽恒 1 物理像素、步长随缩放自适应倍增）；开关是<b>编辑器会话态</b>（不进 graph、不进导出——导出 PNG 经 fork 后端恒无网格）</li>
                            </ul>
                        </section>
                        <section class="help-section" aria-label="开发者">
                            <h3>开发者</h3>
                            <p class="help-ticket">工票 03：TableLayer V2 目验样例——模板态表格空壳渲染、表达式标记镜像字面与按字面物化降级（中列）。工单 15：加固与契约——contextlost 可恢复重绘、DPR 变更即时适配、布局快照 fixture 三端契约钉死（v1 + 预期差异白名单 + 同步校验）、点位取样补全（priority 叠加/QR 角点）；工具栏「目验样图」一键载入 php visual-check 同场景。工单 03（content-completion）：数据源 schema 注入缝——工具栏三键目验 注入/非法降级/清除，声明只进会话态。工单 11（content-completion）：样例换装证书 form-data schema（与工单 08 内核 fixture 同源，draft-07 全侧面）+ demoGraph 表达式键树对齐 + 注入面板编译诊断展示（parseExpressionSchema 直取，D12）。工单 14/13 与更早目验保留。ruler-guides-snap 工单 04：标尺/参考线接线目验——⇧R 随内核注册表（宿主零键位）、data-ruler-*/data-guide-*/data-snap-* 钩子自动化锚点，动线走查 列对位吸附/参考线拖出拖回/undo 隔离/保存零改动</p>
                            <div class="help-dev-actions">
                                <button
                                    type="button"
                                    data-visual-check
                                    title="载入目验样图（php visual-check 同场景：中文禁则断行/表格/QR/priority 叠放）"
                                    @click="loadVisualCheckGraph"
                                >
                                    目验样图
                                </button>
                                <button
                                    type="button"
                                    data-schema-sample
                                    title="注入证书 form-data schema（draft-07：$ref/嵌套对象树/数组/开放映射，根级 13 键；与工单 08 内核 fixture 同源）"
                                    @click="injectSampleSchema"
                                >
                                    注入 schema
                                </button>
                                <button
                                    type="button"
                                    data-schema-invalid
                                    title="注入非法声明（根级保留键 row）→ 整份拒绝降级无候选 + console 警告，不弹错"
                                    @click="injectInvalidSchema"
                                >
                                    注入非法 schema
                                </button>
                                <button
                                    type="button"
                                    data-schema-diagnostic
                                    title="注入断链/环诊断样例（$ref 断链/外部指针/环引用/目标形态不符 → 局部降级为叶子，面板逐条显示编译诊断，工单 11）"
                                    @click="injectDiagnosticSchema"
                                >
                                    注入断链样例
                                </button>
                                <button
                                    type="button"
                                    data-schema-clear
                                    title="清除数据源 schema 声明（未注入 = 无候选，清除不告警）"
                                    @click="clearDataSourceSchema"
                                >
                                    清除声明
                                </button>
                            </div>
                            <!-- 编译诊断面板（工单 11，D12）：直取 parseExpressionSchema 纯函数
                                 返回面——合法注入「已编译，无诊断」，局部降级逐条列出
                                 path/code/detail 供开发期排查方言问题；内核 console.warn 收口不变 -->
                            <div class="help-schema-report" data-schema-report :data-schema-report-kind="schemaReport.kind">
                                <p data-schema-report-summary>{{ schemaReport.text }}</p>
                                <ul v-if="schemaReport.diagnostics.length > 0">
                                    <li
                                        v-for="(diagnostic, index) in schemaReport.diagnostics"
                                        :key="index"
                                        data-schema-diagnostic-item
                                    >
                                        <code>{{ diagnostic.path }}</code> · {{ diagnostic.code }} —— {{ diagnostic.detail }}
                                    </li>
                                </ul>
                            </div>
                        </section>
                    </div>
                </aside>
            </div>
        </Teleport>
    </main>
</template>

<style scoped>
/* 全视口暗色工作台壳（工单 05，spec 决策 6）：100vh 四行网格——头栏 48 / 工具栏
   44 / 工作台 1fr / 状态栏 auto（组件自然高 ≈30），页面零滚动。小视口降级：工作台
   行压缩（minmax(0,1fr)）+ 面板自内滚 + 工具栏横向内滚，不回退成页滚。壳层暗色
   令牌 = 原型 #070d18/#0b1220 族（与状态栏 --cn-bg 同源）；editor-vue 面板/状态栏
   令牌零改动。对齐浮条随 .stage 级联取令牌；帮助抽屉 Teleport 出 body，自带一份
   同值令牌块（工单 04 内联字面量在此吸收）。 */
.stage {
    --shell-bg: #070d18;
    --shell-panel: #0b1220;
    --shell-panel-92: rgb(11 18 32 / 0.92);
    --shell-line: #1e2a40;
    --shell-line-strong: #2a3a58;
    --shell-hover: #16223a;
    --shell-fg: #e6edf7;
    --shell-fg-2: #c3cddd;
    --shell-fg-3: #aab6c8;
    --shell-muted: #7c8ca5;
    --shell-accent: #38bdf8;
    --shell-on-accent: #06202b;
    --shell-insert: #7dd3fc;
    --shell-font-mono: 'SF Mono', Menlo, Consolas, monospace;
    --shell-desktop: radial-gradient(1100px 600px at 50% 40%, #101b30 0%, #0a1120 70%);

    display: grid;
    grid-template-rows: 48px 44px minmax(0, 1fr) auto;
    height: 100vh;
    margin: 0;
    overflow: hidden;
    background: var(--shell-bg);
    font-family: system-ui, sans-serif;
    color: var(--shell-fg);
}

/* 头栏（工单 02 一行化 + 工单 05 暗色壳）：48px 全宽边条，面板底 + 下缘分隔线
   （去 1240px 锁宽与圆角卡片形态） */
.topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    height: 48px;
    padding: 0 16px;
    background: var(--shell-panel);
    border-bottom: 1px solid var(--shell-line);
}

.topbar-doc {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
}

/* 未保存点：● 未保存 / ○ 已保存（与状态栏保存态段同语义，topbar 只出点） */
.dirty-dot {
    flex: none;
    font-size: 13px;
    line-height: 1;
    color: var(--shell-muted);
}

.dirty-dot.is-dirty {
    color: #f59e0b;
}

.doc-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 600;
    color: var(--shell-fg);
}

/* 画布规格徽标：宽 × 高 · 竖版/横版（doc.canvas 派生，空文档隐藏） */
.canvas-badge {
    flex: none;
    padding: 2px 8px;
    border: 1px solid var(--shell-line);
    border-radius: 6px;
    font-family: var(--shell-font-mono);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: var(--shell-muted);
}

.topbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
}

.topbar .ghost {
    padding: 5px 12px;
    border: 1px solid var(--shell-line);
    border-radius: 8px;
    background: transparent;
    font-size: 13px;
    color: var(--shell-fg-3);
    cursor: pointer;
}

.topbar .ghost:hover {
    border-color: var(--shell-line-strong);
    color: var(--shell-fg);
}

/* 导出主按钮：一天工作的收束动作最显眼（spec 用户故事 4）；导出中禁用 */
.topbar .primary {
    padding: 6px 14px;
    border: none;
    border-radius: 8px;
    background: var(--shell-accent);
    font-size: 13px;
    font-weight: 600;
    color: var(--shell-on-accent);
    cursor: pointer;
}

.topbar .primary:hover {
    filter: brightness(1.12);
}

.topbar .primary:disabled {
    background: color-mix(in srgb, var(--shell-accent) 30%, transparent);
    color: color-mix(in srgb, var(--shell-on-accent) 70%, transparent);
    cursor: not-allowed;
}

.hidden {
    display: none;
}

/* 工具栏（工单 03 分组 + 工单 05 暗色壳）：44px 全宽边条，ghost 钮（无边框透明底
   + hover 面板亮色）；小视口横向内滚降级（页面零滚动不破）——内滚条不占行高
   （经典滚动条平台会裁切按钮），滚动能力保留（滚轮/触控板横扫） */
.toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 0 16px;
    overflow-x: auto;
    overflow-y: hidden;
    background: var(--shell-panel);
    border-bottom: 1px solid var(--shell-line);
    scrollbar-width: none;
}

.toolbar::-webkit-scrollbar {
    display: none;
}

.toolbar button {
    flex: none;
    padding: 5px 9px;
    border: none;
    border-radius: 6px;
    background: transparent;
    font-size: 13px;
    white-space: nowrap;
    color: var(--shell-fg-2);
    cursor: pointer;
}

.toolbar button:hover:not(:disabled) {
    background: var(--shell-hover);
}

.toolbar button:disabled {
    opacity: 0.55;
    color: var(--shell-muted);
    cursor: not-allowed;
}

/* 插入组（工单 03 前置直达的视觉遗留）：亮色引导最高频动作——底座触发钮经
   :deep 着色（ghost 形态与悬停反馈仍归组件自带令牌） */
.toolbar :deep(.tb-insert .cn-dropdown__trigger) {
    color: var(--shell-insert);
}

/* 视图开关点亮态（网格原型）：与插入组同族亮色，灭时回落 ghost */
.toolbar button.tb-on {
    color: var(--shell-insert);
}

/* 网格钮推右端（工单 03 变体 A）：margin-left:auto 弹性空隙，与头栏右对齐
   语言一致（分隔线之后整段空隙归弹性区） */
.toolbar button.tb-grid {
    margin-left: auto;
}

.toolbar-divider {
    flex: none;
    width: 1px;
    height: 18px;
    margin: 0 2px;
    background: var(--shell-line);
}

/* 工作台（工单 05）：1fr 行垂直撑满 + 去 1240px 锁宽全宽；水平 10px 呼吸沿原型。
   垂直零留白是验收基线的算术前提——1440×900 下画布区 = 900−48−44−30 = 778px，
   995×1464 fit（留 48 呼吸边）预览高 ≈682px（较 484px +41%）。min-height 0 允许
   小视口压缩：面板自内滚（组件自带 overflow-y-auto），画布缩小，页面不滚。 */
.workbench {
    display: flex;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    padding: 0 10px;
}

/* 状态栏（工单 01 读数归口 + 工单 05 壳层）：全宽底边条（去 1240px 锁宽与浮动
   圆角），宿主只做几何——组件自带暗色令牌零改动 */
.statusbar {
    width: 100%;
    border-radius: 0;
    border-top: 1px solid var(--shell-line);
}

/* 画布容器 = 覆盖物（标尺/参考线/对齐浮条）的定位上下文；flex:1 从 .surface
   移到本层，surface 以 100% 填满（缩放浮条 kbd-nav 工单 06 起退役，见模板注释） */
.canvas-area {
    position: relative;
    flex: 1;
    min-width: 0;
}

.workbench .surface {
    border: 1px solid var(--shell-line);
    border-radius: 12px;
    background: var(--shell-desktop); /* 画布外的「桌面」暗底：平移出界可辨、纸面突出 */
    overflow: hidden;
}

.surface {
    width: 100%;
    height: 100%;
    border-radius: 11px;
}

/* 标尺壳（ruler-guides-snap 工单 04）：画布容器顶+左贴边挂载——根铺满壳（组件
   width/height 100%），条外缘 = 内容区缘（手势坐标换算前提）。壳 pointer-events:
   none 是不拦画布事件的关键（标尺条在组件内自开 auto）；圆角与 .workbench
   .surface 的 border-box 圆角（12px，覆盖裸 .surface 的 11px）同族，条与角块
   沿圆角收边。无 z-index：流内次序即 surface 之上、浮条（z10）之下，与模板
   挂点次序一致。 */
.ruler-shell {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 12px;
    pointer-events: none;
}

/* 对齐浮条（layer-align-snap 工单 03）：宿主只出定位——画布容器顶部居中
   （原型 FIG.2 .float.align 同款 top 14 + translateX 居中）；浮于画布之上
   z-index 10。暗色观感是组件自带令牌，宿主不再着色。 */
.align-float {
    position: absolute;
    top: 14px;
    left: 50%;
    z-index: 10;
    transform: translateX(-50%);
}

/* 帮助抽屉（工单 02）：宿主级浮层，右缘滑出面板 + 半透明遮罩；Teleport 到 body，
   fixed 定位不占文档流。工单 05 暗色统一落定：面板族令牌自带一份（Teleport 出
   .stage 不级联，同值块见 .stage 注释）。 */
.help-overlay {
    --shell-panel: #0b1220;
    --shell-line: #1e2a40;
    --shell-line-strong: #2a3a58;
    --shell-fg: #e6edf7;
    --shell-fg-2: #c3cddd;
    --shell-fg-3: #aab6c8;
    --shell-muted: #7c8ca5;

    position: fixed;
    inset: 0;
    z-index: 60;
    display: flex;
    justify-content: flex-end;
    background: rgb(2 6 23 / 0.6);
}

.help-drawer {
    display: flex;
    flex-direction: column;
    width: min(560px, 92vw);
    height: 100%;
    background: var(--shell-panel);
    border-left: 1px solid var(--shell-line);
    box-shadow: -12px 0 32px rgb(0 0 0 / 0.5);
    outline: none;
}

.help-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    padding: 10px 16px;
    border-bottom: 1px solid var(--shell-line);
}

.help-head h2 {
    margin: 0;
    font-size: 15px;
    color: var(--shell-fg);
}

.help-close {
    padding: 4px 10px;
    border: 1px solid var(--shell-line);
    border-radius: 8px;
    background: transparent;
    font-size: 13px;
    color: var(--shell-fg-3);
    cursor: pointer;
}

.help-close:hover {
    border-color: var(--shell-line-strong);
    color: var(--shell-fg);
}

.help-body {
    display: flex;
    flex-direction: column;
    gap: 22px;
    flex: 1;
    overflow-y: auto;
    padding: 14px 16px 28px;
}

.help-section h3 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--shell-muted);
}

.help-section ul {
    margin: 0;
    padding: 0 0 0 18px;
    font-size: 12px;
    line-height: 1.9;
    color: var(--shell-fg-3);
}

.help-section b {
    color: var(--shell-fg-2);
}

.help-ticket {
    margin: 0 0 10px;
    font-size: 12px;
    line-height: 1.8;
    color: var(--shell-fg-3);
}

.help-dev-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.help-dev-actions button {
    padding: 4px 10px;
    border: 1px solid var(--shell-line);
    border-radius: 8px;
    background: transparent;
    font-size: 13px;
    color: var(--shell-fg-3);
    cursor: pointer;
}

.help-dev-actions button:hover {
    border-color: var(--shell-line-strong);
    color: var(--shell-fg);
}

/* 编译诊断面板（工单 11）：注入动作的开发期读数——摘要一行 + 诊断逐条（path 等宽
   字体）；合法注入只显示「已编译，无诊断」一行，清除后回落「未注入」占位 */
.help-schema-report {
    margin-top: 10px;
}

.help-schema-report p {
    margin: 0;
    font-size: 12px;
    line-height: 1.8;
    color: var(--shell-fg-2);
}

.help-schema-report ul {
    margin: 2px 0 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.help-schema-report li {
    font-family: var(--shell-font-mono);
    font-size: 12px;
    line-height: 1.6;
    color: var(--shell-fg-3);
    overflow-wrap: anywhere;
}

.help-schema-report code {
    color: var(--shell-fg-2);
}
</style>
