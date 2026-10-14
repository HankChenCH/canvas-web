/**
 * useTextEditing：文本编辑会话的响应式桥（工单 11；内容类型 pill/补全消费面
 * canvas-web-expression-editing 工单 03）。
 *
 * - 会话状态：ui.editing（会话对象身份，pill 切换原位换新即驱动 layout 重算）
 *   的 shallowRef 桥 + 内核 textEditLayout 布局查询（与绘制/命中同一套布局策略，
 *   overlay 与内容层几何不漂移）；反应锚「会话对象 + doc 通知」双触发（工单 01，
 *   ADR 0019 布局现算）——会话期面板/工具条的样式与几何权威写实时反映到编辑框，
 *   键入零文档变更则布局与纵向锚点零变化；
 * - 呈现换算：textarea 以「场景字号/盒尺寸占位 + CSS transform scale(zoom)」定位
 *   ——字号视觉恒定（excalidraw textWysiwyg 同款，impl 研究 §2.4），缩放中元素
 *   不重建、光标不丢；对位用与内容层同一呈现视口（snapViewportToPhysicalPixels，
 *   相机/物理像素对齐）；纵向按 CSS 行盒模型折算内核的首行绘制锚点（锚点语义随
 *   verticalAlign = 字形盒顶/心/底，与渲染端基线消化同源），enter/exit 不跳变；
 * - 工具条换算（edit-overlay-toolbar 工单 03，ADR 0019）：编辑浮层工具条屏幕
 *   恒定尺寸——屏幕坐标定位、无 scale 变换，锚点取图层框上缘中点的屏幕折算点
 *   （与 textarea 的场景像素换算系分叉，浮层定位两套并存），任何 zoom 下可读可点；
 *   上缘放不下整条翻框下缘、水平钳制画布视口（视口尺寸 = 内核 surfaceSize 权威
 *   值 + 宿主 RO 跟随；工具条尺寸经 offsetWidth/Height 实测 + RO 跟随）；诊断条
 *   等标签类浮示挂工具条左端外侧（背离图层盒一侧，翻转随动）；
 * - 提交漏斗：四条退出路径（Esc / Ctrl+Enter / blur / 点画布他处）全部收拢到
 *   commitNow → 内核 commitTextEdit（先清会话保证幂等，一次退出恰一步历史）；
 * - IME 守卫全分支：键盘分支由绑定层按 isComposing/keyCode 229 拦截；blur 与
 *   画布点按等非键盘分支若在合成中触发，提交意图暂存到 compositionend 再落
 *   （候选窗里的 Esc 只取消候选——无暂存意图的 compositionend 不提交）；
 * - blur 走延迟提交：外部指针交互（属性面板/工具栏）引发的 blur 被豁免（excalidraw
 *   temporarilyDisableSubmit 同款语义——点面板调样式不误提交），焦点落回 textarea
 *   则取消（窗口捕获阶段 pointerdown 标记豁免、pointerup 恢复）；
 * - 豁免集（工单 03）：ownsEventTarget 收 textarea + 整条工具条两目标——表面
 *   组件 pointerdown 对两者的指针不提交不点选不拖动；setExpressionMode 仅翻
 *   会话标志（零文档变更零历史步）。
 */
import { computed, onMounted, onScopeDispose, shallowRef, watch, type CSSProperties, type ComputedRef } from 'vue'

import {
    canvasFontCssFamily,
    snapViewportToPhysicalPixels,
    type EditorSession,
    type LayerPath,
    type Size,
    type TextEditLayout,
    type TextEditingSession,
} from '@hankchen/canvas-editor'

import { useDpr } from './useDpr'
import { useViewport } from '../shared/useViewport'

export interface TextEditingHosts {
    /** 编辑中的 textarea（提交漏斗从这里取 live 文本；内核无 DOM） */
    getTextarea: () => HTMLTextAreaElement | null
    /** 画布表面宿主元素（区分「画布内点按」与「面板/工具栏等外部交互」） */
    getHost: () => HTMLElement | null
    /**
     * 编辑浮层工具条根元素（可选，工单 03）：与 textarea 同入豁免集——工具条
     * 点击不得触发表面组件 pointerdown 的 commitNow/点选/拖动路径；也是屏幕
     * 恒定尺寸的实测面（offsetWidth/Height + RO 跟随，翻转/钳制/居中都吃它）
     */
    getToolbar?: () => HTMLElement | null
}

export interface TextEditingBinding {
    /** 编辑中的图层路径；null = 非编辑态 */
    editing: ComputedRef<LayerPath | null>
    /** 编辑层的布局描述（内核查询，路径失效为 null） */
    layout: ComputedRef<TextEditLayout | null>
    /**
     * 草稿接管序号（edit-overlay-toolbar 工单 02，会话内容独占的内核底线面）：
     * 会话对象 draftSeq 的投影——旁门内容写（查找替换等程序化写）命中编辑层时
     * 内核递增，绑定层据此全量替换 textarea 草稿为文档新值并刷新表达式诊断
     * （pill 翻标志不递增，草稿不动）。未接管过为 undefined。
     */
    draftSeq: ComputedRef<number | undefined>
    /** textarea 内联样式（随相机/dpr 实时跟随；字号视觉恒定） */
    style: ComputedRef<CSSProperties | null>
    /**
     * 编辑浮层工具条内联样式（edit-overlay-toolbar 工单 03，ADR 0019）：屏幕恒定
     * 尺寸系——屏幕坐标 left/top 直接定位、无 scale 变换，锚点 = 图层框上缘中点
     * 的屏幕折算点（与 textarea 的场景像素换算系分叉，浮层定位两套并存）；上缘
     * 放不下整条翻框下缘、水平钳制画布视口；null = 非编辑态
     */
    toolbarStyle: ComputedRef<CSSProperties | null>
    /**
     * 工具条标签类浮示锚点内联样式（工单 03）：挂工具条左端外侧、背离图层盒一侧
     * （工具条在上挂其上方，翻下随翻下方；表达式语法诊断条消费面），与工具条同
     * 屏幕恒定系；null = 非编辑态
     */
    toolbarTagStyle: ComputedRef<CSSProperties | null>
    /**
     * 呈现缩放（snapViewportToPhysicalPixels 后的 zoom）：补全锚点测量的 scale
     * 消费面——画布 textarea 整体在 transform: scale(zoom) 系（工单 03 补全绑定）
     */
    scale: ComputedRef<number>
    /** 输入法合成中（compositionstart→end）；绑定层经 setComposing 汇报 */
    composing: ComputedRef<boolean>
    /** 合成状态汇报（textarea 的 compositionstart/end 转发进来） */
    setComposing(value: boolean): void
    /** 双击入口：场景点命中 TextLayer 才进入编辑（内核校验类型） */
    beginAt(sceneX: number, sceneY: number): boolean
    /** 路径入口：已知路径直接进入编辑（画拉建层自动进编辑，drag-create 工单 02；
     *  内核校验 TextLayer 与会话幂等） */
    beginTextEdit(path: LayerPath): boolean
    /** 立即提交（Esc / Ctrl+Enter / 画布点按路径）；合成中暂存到 compositionend */
    commitNow(): void
    /**
     * 内容类型切换（工单 03）：仅翻会话标志（ui.editing.expression 原位翻转，
     * 零文档变更零历史步）；非编辑态或目标即现态零操作
     */
    setExpressionMode(expression: boolean): void
    /** blur 延迟提交：外部指针交互豁免、焦点落回取消（语义见模块头注释） */
    armBlurCommit(): void
    /** 编辑态查询：目标是否属于编辑中的 textarea 或整条工具条（表面组件的指针分流用） */
    ownsEventTarget(target: EventTarget | null): boolean
}

/** 字形盒高度缓存（font|fontSize → fontBoundingBox 高）：style 每帧重算不重复 measure */
const fontBoxHeightCache = new Map<string, number>()

/**
 * 首行字形盒高（fontBoundingBox ascent+descent 之和）：与 canvas 渲染后端同一
 * metrics 口径，供 CSS 行盒模型的半行距折算。度量不可用（无 2D 上下文/异常）时
 * 回落 1.2em（行高系数缺省同款）。browser-renderer 的 fonts.ts 同款口径。
 */
function fontBoxHeight(font: string, fontSize: number): number {
    const key = `${font}|${fontSize}`
    const cached = fontBoxHeightCache.get(key)
    if (cached !== undefined) return cached
    let height = fontSize * 1.2
    try {
        const ctx = document.createElement('canvas').getContext('2d')
        if (ctx) {
            ctx.font = `${fontSize}px ${canvasFontCssFamily(font)}`
            const metrics = ctx.measureText('字')
            const measured =
                (metrics.fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent) +
                (metrics.fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent)
            if (measured > 0) height = measured
        }
    } catch {
        // 度量失败走回落值
    }
    fontBoxHeightCache.set(key, height)
    return height
}

export function useTextEditing(editor: EditorSession, hosts: TextEditingHosts): TextEditingBinding {
    // 镜像整个会话对象（不只 path）：pill 切换 = setEditing 原位换新对象（path 不
    // 变），shallowRef 以对象身份为反应锚——layout/expressionMode 随翻转立即重算
    // （工单 03 pill 激活态与补全 enabled 的消费面）。doc 通知只重读会话引用：
    // openDocument 清会话只发 doc 通知（store 契约注记），漏读会悬挂旧会话
    const session = shallowRef<TextEditingSession | null>(editor.store.ui.editing)
    // doc 通知版本号（canvas-web-edit-overlay-toolbar 工单 01，ADR 0019 布局现算）：
    // 会话期文档写（面板/工具条样式与几何权威写、查找替换等）不改会话对象身份，
    // shallowRef 值等短路感知不到——layout 需要第二反应锚感知「文档变了」。键入
    // 零文档变更 → 版本不动 → 布局与纵向锚点天然稳定不跳（live 文本只住 textarea
    // 草稿不落文档）
    const docVersion = shallowRef(0)
    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'doc') {
            docVersion.value += 1
            session.value = editor.store.ui.editing
        } else if (change.scope === 'ui' && change.branch === 'editing') {
            session.value = editor.store.ui.editing
        }
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    const editing = computed<LayerPath | null>(() => session.value?.path ?? null)

    const dpr = useDpr()
    const viewport = useViewport(editor)

    const layout = computed(() => {
        // 反应锚双触发（ADR 0019）：会话对象管进入/退出/翻转，docVersion 管
        // 会话期文档写（样式/几何现算）——void 表达式只为参与依赖收集
        void docVersion.value
        const current = session.value
        return current ? editor.textEditLayout(current.path) : null
    })
    const presented = computed(() => snapViewportToPhysicalPixels(viewport.value, dpr.value))

    /** 场景点 → 呈现屏幕像素（screen = (scene − cam) × zoom，呈现视口口径）：style 换算共用 */
    function sceneToScreen(sceneX: number, sceneY: number): { left: number; top: number; zoom: number } {
        const { x: camX, y: camY, zoom } = presented.value
        return { left: (sceneX - camX) * zoom, top: (sceneY - camY) * zoom, zoom }
    }

    const style = computed<CSSProperties | null>(() => {
        const l = layout.value
        if (!l) return null
        // translate 折算屏幕像素（呈现视口口径），scale 补缩放（transform-origin 0 0）；
        // 盒尺寸/字号/行高/内边距保持场景像素，随 transform 一起缩放——缩放中字号
        // 视觉恒定，只有 transform 在变
        const { left, top, zoom } = sceneToScreen(l.box.x, l.box.y)
        return {
            transform: `translate(${left}px, ${top}px) scale(${zoom})`,
            transformOrigin: '0 0',
            width: `${l.box.width}px`,
            height: `${l.box.height}px`,
            color: l.fontColor,
            fontFamily: canvasFontCssFamily(l.font),
            fontSize: `${l.fontSize}px`,
            lineHeight: `${l.lineHeightPx}px`,
            ...verticalPadding(l),
            textAlign: l.horizontalAlign,
            // autowrap = 浏览器软换行（断行允许与预览不同，决策 A）；否则单行 pre
            whiteSpace: l.autowrap ? 'pre-wrap' : 'pre',
        }
    })

    /**
     * 工具条悬挂间隙（工单 03）：锚点/框缘与工具条边缘之间的屏幕像素。诊断条
     * 等标签浮示与工具条之间取同值。
     */
    const TOOLBAR_GAP_PX = 4

    // ---- 屏幕恒定尺寸的尺寸输入（ADR 0019 两套换算系分叉的量测面） ----

    /** 画布视口尺寸（水平钳制的右界）：内核 surfaceSize 权威值 + 宿主 RO 跟随 */
    const surfaceSize = shallowRef<Size>({ width: 0, height: 0 })
    /** 工具条实测尺寸（翻转/钳制/水平居中的输入）：根元素 offsetWidth/Height 实测 */
    const toolbarSize = shallowRef<Size>({ width: 0, height: 0 })

    const refreshSurfaceSize = (): void => {
        const size = editor.getSurfaceSize()
        surfaceSize.value = { width: size.width, height: size.height }
    }

    const measureToolbar = (): void => {
        const el = hosts.getToolbar?.() ?? null
        toolbarSize.value = el !== null ? { width: el.offsetWidth, height: el.offsetHeight } : { width: 0, height: 0 }
    }

    // 会话开始时同步画布视口权威值（真实装配里 CanvasSurface 在其 onMounted 同步，
    // 子组件 setup 时读太早）；渲染后量工具条尺寸并挂 RO——尺寸随内容变化（工单 04
    // 续接样式段）与宿主 resize（编辑中改窗口）实时跟随。jsdom 无布局也无 RO 回调：
    // 显式量测是测试桩（原型 getter）的消费面。
    watch(editing, (path) => {
        if (path === null) return
        refreshSurfaceSize()
    }, { flush: 'post' })
    let toolbarObserver: ResizeObserver | null = null
    watch(() => hosts.getToolbar?.() ?? null, (el) => {
        toolbarObserver?.disconnect()
        toolbarObserver = null
        if (el === null) return
        measureToolbar()
        if (typeof ResizeObserver === 'function') {
            toolbarObserver = new ResizeObserver(measureToolbar)
            toolbarObserver.observe(el)
        }
    }, { flush: 'post' })
    let hostObserver: ResizeObserver | null = null
    onMounted(() => {
        const host = hosts.getHost()
        if (host === null || typeof ResizeObserver !== 'function') return
        hostObserver = new ResizeObserver(() => {
            // 宿主自身盒即画布视口（overlay 根 inset:0 同盒）：DOM 读自足于
            // 内核值的同步时序（CanvasSurface 的 RO 与本 RO 回调次序不定）
            surfaceSize.value = { width: host.clientWidth, height: host.clientHeight }
        })
        hostObserver.observe(host)
    })
    onScopeDispose(() => {
        hostObserver?.disconnect()
        toolbarObserver?.disconnect()
    }, true)

    /**
     * 工具条框位（工单 03）：屏幕恒定系的全部几何——锚点 = 图层框上缘中点折算
     * 屏幕像素（sceneToScreen 同门换算）；上缘放不下整条（锚点上方空间 < 间隙 +
     * 条高）翻框下缘悬挂；水平以锚点居中后钳制画布视口（视口窄于工具条钳 0）。
     * 缩放只折算锚点，条尺寸恒定（无 scale 变换）。
     */
    const toolbarFrame = computed<{ left: number; top: number; height: number; flipped: boolean } | null>(() => {
        const l = layout.value
        if (!l) return null
        const { width, height } = toolbarSize.value
        const anchorTop = sceneToScreen(l.box.x + l.box.width / 2, l.box.y)
        const anchorBottom = sceneToScreen(l.box.x + l.box.width / 2, l.box.y + l.box.height)
        const flipped = anchorTop.top - TOOLBAR_GAP_PX - height < 0
        const top = flipped ? anchorBottom.top + TOOLBAR_GAP_PX : anchorTop.top - TOOLBAR_GAP_PX - height
        const left = Math.min(Math.max(anchorTop.left - width / 2, 0), Math.max(0, surfaceSize.value.width - width))
        return { left, top, height, flipped }
    })

    /** 工具条定位样式：屏幕坐标直接定位、零变换（尺寸恒定的换算面，见接口注释） */
    const toolbarStyle = computed<CSSProperties | null>(() => {
        const frame = toolbarFrame.value
        if (!frame) return null
        return { left: `${frame.left}px`, top: `${frame.top}px` }
    })

    /**
     * 标签类浮示（语法诊断条等）锚定样式：挂工具条左端、背离图层盒一侧——工具条
     * 在上挂其上方（translateY(-100%) 把自身底边对到工具条上缘上方），翻下随翻
     * 下方；水平与工具条左端对齐（工具条已钳制，条随之在场内）。
     */
    const toolbarTagStyle = computed<CSSProperties | null>(() => {
        const frame = toolbarFrame.value
        if (!frame) return null
        return frame.flipped
            ? { left: `${frame.left}px`, top: `${frame.top + frame.height + TOOLBAR_GAP_PX}px` }
            : { left: `${frame.left}px`, top: `${frame.top - TOOLBAR_GAP_PX}px`, transform: 'translateY(-100%)' }
    })

    /**
     * 纵向内边距：把内核的首行绘制锚点（verticalAnchorY，语义随 verticalAlign =
     * canvas 渲染的字形盒顶/心/底）折算成 CSS padding-top。CSS 首行字形盒相对行盒
     * 顶偏移半行距 (LH−FH)/2（FH = fontBoundingBox 高，与渲染端同 metrics），故：
     *   top:    字形盒顶 = padding + (LH−FH)/2      = 锚点 → padding = 锚点 − (LH−FH)/2
     *   center: 字形盒心 = padding + LH/2           = 锚点 → padding = 锚点 − LH/2
     *   bottom: 字形盒底 = padding + (LH+FH)/2      = 锚点 → padding = 锚点 − (LH+FH)/2
     * 其余取值归 top（与渲染端未知取值归 top 同门）；CSS padding 非负，负值钳 0
     * （误差 ≤ 半行距，亚像素到 1–2px）。锚点对当前文档文本现算（ADR 0019）：
     * live 文本只住 textarea 草稿不落文档，键入不触发文档变更，锚点天然稳定不跳。
     */
    function verticalPadding(l: TextEditLayout): CSSProperties {
        const anchor = l.padding.top + l.verticalAnchorY
        const lh = l.lineHeightPx
        const fh = fontBoxHeight(l.font, l.fontSize)
        let paddingTop: number
        if (l.verticalAlign === 'center') paddingTop = anchor - lh / 2
        else if (l.verticalAlign === 'bottom') paddingTop = anchor - (lh + fh) / 2
        else paddingTop = anchor - (lh - fh) / 2
        return {
            paddingTop: `${Math.max(0, paddingTop)}px`,
            paddingRight: `${l.padding.right}px`,
            paddingBottom: `${l.padding.bottom}px`,
            paddingLeft: `${l.padding.left}px`,
        }
    }

    const beginAt = (sceneX: number, sceneY: number): boolean => {
        const path = editor.hitTest(sceneX, sceneY)
        return path !== null && editor.beginTextEdit(path)
    }

    const beginTextEdit = (path: LayerPath): boolean => editor.beginTextEdit(path)

    /**
     * 内容类型切换（工单 03）：pill 点击仅翻会话标志——setEditing 原位换新对象
     * （path 不变），零文档变更零历史步；展开旧会话对象保留 draftSeq（工单 02：
     * 与内核 toggleDataMode 同语义——翻标志不是内容写，不得触发草稿接管）；
     * 非编辑态或目标即现态零操作（按钮只在编辑会话期在场，防御同门）。
     */
    const setExpressionMode = (expression: boolean): void => {
        const current = editor.store.ui.editing
        if (!current || current.expression === expression) return
        editor.store.setEditing({ ...current, expression })
    }

    // ---- 提交漏斗与 blur 延迟提交 ----

    let blurTimer: ReturnType<typeof setTimeout> | null = null
    let suppressNextBlur = false
    /** 合成中收到的提交意图（canvas 点按/blur 延迟）：compositionend 再落 */
    let pendingCommit = false

    const doCommit = (): void => {
        editor.commitTextEdit(hosts.getTextarea()?.value ?? '')
    }

    const cancelBlurCommit = (): void => {
        if (blurTimer !== null) clearTimeout(blurTimer)
        blurTimer = null
    }

    const commitNow = (): void => {
        cancelBlurCommit()
        // 合成中（候选窗开着）：不吞预编辑串，意图暂存到 compositionend 落
        if (composingRef.value) {
            pendingCommit = true
            return
        }
        doCommit()
    }

    const composingRef = shallowRef(false)

    const setComposing = (value: boolean): void => {
        composingRef.value = value
        if (!value && pendingCommit) {
            // 合成收束（提交或取消）后落暂存的提交意图；候选窗里按 Esc 只取消候选
            // ——没有暂存意图的 compositionend 不提交，编辑继续
            pendingCommit = false
            if (editing.value !== null) doCommit()
        }
    }

    const armBlurCommit = (): void => {
        // 会话已清（如画布点按已抢先提交）：blur 无事可做
        if (editing.value === null) return
        cancelBlurCommit()
        // 外部指针交互引发的 blur：豁免本次提交，编辑会话保持（点属性面板改样式）
        if (suppressNextBlur) {
            suppressNextBlur = false
            return
        }
        blurTimer = setTimeout(() => {
            blurTimer = null
            // 焦点已落回 textarea（同一宏任务内的重新聚焦）：取消提交
            const el = hosts.getTextarea()
            if (el !== null && document.activeElement === el) return
            // 合成中：意图暂存，compositionend 再落（键盘分支守卫的等价覆盖）
            if (composingRef.value) {
                pendingCommit = true
                return
            }
            doCommit()
        }, 0)
    }

    const ownsEventTarget = (target: EventTarget | null): boolean => {
        if (!(target instanceof Node)) return false
        // 工具条与 textarea 同豁免（工单 03 豁免集扩容）：工具条任意处点击不得
        // 触发表面组件的 commitNow/点选/拖动路径
        const toolbar = hosts.getToolbar?.() ?? null
        if (toolbar !== null && toolbar.contains(target)) return true
        const el = hosts.getTextarea()
        return el !== null && el.contains(target)
    }

    // 窗口捕获阶段的指针桥：编辑中在画布外按下（属性面板/工具栏/页面其他处）
    // → 豁免紧随的 blur 提交，pointerup 恢复（按下未成焦点的场景也复位）。
    // 画布内点按不在此处理——表面组件的 pointerdown 显式走 commitNow。
    const onWindowPointerDown = (e: PointerEvent) => {
        if (editing.value === null || ownsEventTarget(e.target)) return
        const host = hosts.getHost()
        if (host !== null && host.contains(e.target as Node)) return
        suppressNextBlur = true
    }
    const onWindowPointerUp = () => {
        suppressNextBlur = false
    }
    window.addEventListener('pointerdown', onWindowPointerDown, true)
    window.addEventListener('pointerup', onWindowPointerUp, true)
    onScopeDispose(() => {
        window.removeEventListener('pointerdown', onWindowPointerDown, true)
        window.removeEventListener('pointerup', onWindowPointerUp, true)
        cancelBlurCommit()
    }, true)

    return {
        editing,
        layout,
        draftSeq: computed(() => session.value?.draftSeq),
        style,
        toolbarStyle,
        toolbarTagStyle,
        scale: computed(() => presented.value.zoom),
        composing: computed(() => composingRef.value),
        setComposing,
        beginAt,
        beginTextEdit,
        commitNow,
        setExpressionMode,
        armBlurCommit,
        ownsEventTarget,
    }
}
