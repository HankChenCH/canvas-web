/**
 * useTextEditing：文本编辑会话的响应式桥（工单 11；内容类型 pill/补全消费面
 * canvas-web-expression-editing 工单 03）。
 *
 * - 会话状态：ui.editing（会话对象身份，pill 切换原位换新即驱动 layout 重算）
 *   的 shallowRef 桥 + 内核 textEditLayout 布局查询（与绘制/命中同一套布局策略，
 *   overlay 与内容层几何不漂移）；
 * - 呈现换算：textarea 以「场景字号/盒尺寸占位 + CSS transform scale(zoom)」定位
 *   ——字号视觉恒定（excalidraw textWysiwyg 同款，impl 研究 §2.4），缩放中元素
 *   不重建、光标不丢；对位用与内容层同一呈现视口（snapViewportToPhysicalPixels，
 *   相机/物理像素对齐）；纵向按 CSS 行盒模型折算内核的首行绘制锚点（锚点语义随
 *   verticalAlign = 字形盒顶/心/底，与渲染端基线消化同源），enter/exit 不跳变；
 *   pillStyle 同换算系把内容类型 pill 锚到图层框上边框居中（工单 03）；
 * - 提交漏斗：四条退出路径（Esc / Ctrl+Enter / blur / 点画布他处）全部收拢到
 *   commitNow → 内核 commitTextEdit（先清会话保证幂等，一次退出恰一步历史）；
 * - IME 守卫全分支：键盘分支由绑定层按 isComposing/keyCode 229 拦截；blur 与
 *   画布点按等非键盘分支若在合成中触发，提交意图暂存到 compositionend 再落
 *   （候选窗里的 Esc 只取消候选——无暂存意图的 compositionend 不提交）；
 * - blur 走延迟提交：外部指针交互（属性面板/工具栏）引发的 blur 被豁免（excalidraw
 *   temporarilyDisableSubmit 同款语义——点面板调样式不误提交），焦点落回 textarea
 *   则取消（窗口捕获阶段 pointerdown 标记豁免、pointerup 恢复）；
 * - 豁免集（工单 03）：ownsEventTarget 收 textarea + 内容类型 pill 两目标——
 *   表面组件 pointerdown 对两者的指针不提交不点选不拖动；setExpressionMode
 *   仅翻会话标志（零文档变更零历史步）。
 */
import { computed, onScopeDispose, shallowRef, type CSSProperties, type ComputedRef } from 'vue'

import {
    canvasFontCssFamily,
    snapViewportToPhysicalPixels,
    type EditorSession,
    type LayerPath,
    type TextEditLayout,
    type TextEditingSession,
} from '@hankchen/canvas-next-editor'

import { useDpr } from './useDpr'
import { useViewport } from '../shared/useViewport'

export interface TextEditingHosts {
    /** 编辑中的 textarea（提交漏斗从这里取 live 文本；内核无 DOM） */
    getTextarea: () => HTMLTextAreaElement | null
    /** 画布表面宿主元素（区分「画布内点按」与「面板/工具栏等外部交互」） */
    getHost: () => HTMLElement | null
    /**
     * 内容类型 pill 根元素（可选，工单 03）：与 textarea 同入豁免集——pill 点击
     * 不得触发表面组件 pointerdown 的 commitNow/点选/拖动路径
     */
    getPill?: () => HTMLElement | null
}

export interface TextEditingBinding {
    /** 编辑中的图层路径；null = 非编辑态 */
    editing: ComputedRef<LayerPath | null>
    /** 编辑层的布局描述（内核查询，路径失效为 null） */
    layout: ComputedRef<TextEditLayout | null>
    /** textarea 内联样式（随相机/dpr 实时跟随；字号视觉恒定） */
    style: ComputedRef<CSSProperties | null>
    /**
     * 内容类型 pill 内联样式（工单 03）：图层框上边框居中的锚点换算——与 textarea
     * 同一换算系（场景定位 + CSS transform scale，相机/dpr 跟随复用），尾部
     * translate(-50%, -100%) 把 pill 自身底边中点对到锚点；null = 非编辑态
     */
    pillStyle: ComputedRef<CSSProperties | null>
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
    /** 编辑态查询：目标是否属于编辑中的 textarea 或内容类型 pill（表面组件的指针分流用） */
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
    // （工单 03 pill 激活态与补全 enabled 的消费面）
    const session = shallowRef<TextEditingSession | null>(editor.store.ui.editing)
    const unsubscribe = editor.subscribe((change) => {
        if (change.scope === 'doc' || (change.scope === 'ui' && change.branch === 'editing')) {
            session.value = editor.store.ui.editing
        }
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(unsubscribe, true)

    const editing = computed<LayerPath | null>(() => session.value?.path ?? null)

    const dpr = useDpr()
    const viewport = useViewport(editor)

    const layout = computed(() => {
        const current = session.value
        return current ? editor.textEditLayout(current.path) : null
    })
    const presented = computed(() => snapViewportToPhysicalPixels(viewport.value, dpr.value))

    /** 场景点 → 呈现屏幕像素（screen = (scene − cam) × zoom，呈现视口口径）：style 与 pillStyle 共用 */
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
     * pill 锚点换算（工单 03）：与 textarea 同一换算系——上边框中点折算屏幕像素后
     * translate 定位，scale 补缩放（transform-origin 0 0），尾部 translate(-50%,
     * -100%) 在缩放系内把 pill 自身底边中点对到锚点（百分比基于布局尺寸，随 scale
     * 一起折算——zoom ≠ 1 贴边不漂）。pill 尺寸用场景像素，视觉随画布缩放与图层框
     * 保持同刻度。
     */
    const pillStyle = computed<CSSProperties | null>(() => {
        const l = layout.value
        if (!l) return null
        const { left, top, zoom } = sceneToScreen(l.box.x + l.box.width / 2, l.box.y)
        return {
            transform: `translate(${left}px, ${top}px) scale(${zoom}) translate(-50%, -100%)`,
            transformOrigin: '0 0',
        }
    })

    /**
     * 纵向内边距：把内核的首行绘制锚点（verticalAnchorY，语义随 verticalAlign =
     * canvas 渲染的字形盒顶/心/底）折算成 CSS padding-top。CSS 首行字形盒相对行盒
     * 顶偏移半行距 (LH−FH)/2（FH = fontBoundingBox 高，与渲染端同 metrics），故：
     *   top:    字形盒顶 = padding + (LH−FH)/2      = 锚点 → padding = 锚点 − (LH−FH)/2
     *   center: 字形盒心 = padding + LH/2           = 锚点 → padding = 锚点 − LH/2
     *   bottom: 字形盒底 = padding + (LH+FH)/2      = 锚点 → padding = 锚点 − (LH+FH)/2
     * 其余取值归 top（与渲染端未知取值归 top 同门）；CSS padding 非负，负值钳 0
     * （误差 ≤ 半行距，亚像素到 1–2px）。锚点按进入编辑时的文档文本计，编辑中稳定。
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
     * （path 不变，会话快照语义），零文档变更零历史步；非编辑态零操作（按钮只在
     * 编辑会话期在场，防御同门）。
     */
    const setExpressionMode = (expression: boolean): void => {
        const current = editor.store.ui.editing
        if (!current || current.expression === expression) return
        editor.store.setEditing({ path: current.path, expression })
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
        // pill 与 textarea 同豁免（工单 03）：pill 点击不得触发表面组件的
        // commitNow/点选/拖动路径
        const pill = hosts.getPill?.() ?? null
        if (pill !== null && pill.contains(target)) return true
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
        style,
        pillStyle,
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
