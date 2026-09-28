// @vitest-environment jsdom
/**
 * 表达式补全浮层控件挂载测试（content-completion 工单 04）。
 *
 * 控件 = useExpressionCompletion（composable，绑宿主 input/textarea）+
 * ExpressionCompletionPopup（portal 到 body 的候选浮层）。候选源按纯函数注入
 * （工单 04 解耦缝，将来 CM6 升级路径），测试桩只回固定候选集——候选枚举语义
 * 已由内核 01/02 单测钉死，本文件只钉浮层控件行为面：
 *   触发（`{{` 自动 / `.` 刷新 / Ctrl+Space 手动全量）、
 *   接受（↑↓ 导航、Enter/Tab、鼠标点选；补全剩余路径段非整段重插、不包外壳、
 *   光标落片段内原位；替换走既有 input/change 事件——与手工输入同路）、
 *   IME 守卫（事件入口最前沿：合成期 229/isComposing 的 Enter 是候选确认，
 *   绝不接受；compositionend 后键位恢复）、
 *   关闭（Esc/失焦/点外/`}}`/光标离开片段；静态态零补全）、
 *   portal 挂载与 scroll/resize 锚点重算（jsdom 布局为零，rect 经 mock 钉公式）。
 */
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import ExpressionCompletionPopup from '../../src/property-panel/fields/ExpressionCompletionPopup.vue'
import { useExpressionCompletion } from '../../src/property-panel/fields/useExpressionCompletion'
import type { CompletionItem, CompletionSource } from '../../src/property-panel/fields/completion'

/* ---------------------------------------------------------------- 候选源桩 */

const orderNoItem: CompletionItem = { path: 'orderNo', segment: 'orderNo', description: '订单号', type: 'string' }
const HEAD_ITEMS: CompletionItem[] = [
    orderNoItem,
    { path: 'assets', segment: 'assets', type: 'array' },
    { path: 'row', segment: 'row' },
    { path: '$index', segment: '$index' },
    { path: '$root', segment: '$root' },
]
const ROW_ITEMS: CompletionItem[] = [
    { path: 'row.name', segment: 'name', description: '行名', type: 'string' },
    { path: 'row.qty', segment: 'qty', type: 'number' },
]

/** 片段表达式 → 候选集；未列出的表达式 = 无补全态（null，对齐源契约） */
const headSource: CompletionSource = (expr) => {
    if (expr === '') return { partial: '', candidates: HEAD_ITEMS }
    if (expr === 'r' || expr === 'ro' || expr === 'row') return { partial: expr, candidates: HEAD_ITEMS }
    if (expr === 'row.') return { partial: '', candidates: ROW_ITEMS }
    if (expr === 'or') return { partial: 'or', candidates: [orderNoItem] }
    if (expr === 'zz') return { partial: 'zz', candidates: [] }
    return null
}

/* ---------------------------------------------------------------- 测试宿主 */

type FieldTag = 'textarea' | 'input'

interface HostHarness {
    wrapper: VueWrapper
    field: () => HTMLTextAreaElement | HTMLInputElement
    enabled: Ref<boolean>
    source: Mock<CompletionSource>
    /** 宿主记录到的提交事件（input 实时 / change 收口） */
    events: { kind: 'input' | 'change'; value: string }[]
}

const wrappers: VueWrapper[] = []

function mountHost(tag: FieldTag, resolve: CompletionSource): HostHarness {
    const el = ref<HTMLTextAreaElement | HTMLInputElement | null>(null)
    const enabled = ref(true)
    const source = vi.fn(resolve)
    const events: HostHarness['events'] = []
    const Host = defineComponent({
        setup() {
            const completion = useExpressionCompletion({ target: el, enabled, resolve: source })
            const record = (kind: 'input' | 'change') => (event: Event) =>
                events.push({ kind, value: (event.target as HTMLInputElement).value })
            return () => [
                h(tag, { ref: el, onInput: record('input'), onChange: record('change') }),
                h(ExpressionCompletionPopup, { state: completion.popup, onSelect: completion.accept }),
            ]
        },
    })
    const wrapper = mount(Host)
    wrappers.push(wrapper)
    return { wrapper, field: () => el.value as HTMLTextAreaElement, enabled, source, events }
}

/* ---------------------------------------------------------------- 操作帮手 */

/** 模拟输入：直设 DOM 值 + 光标再派发 input（非 setValue 的连发语义） */
async function type(harness: HostHarness, value: string, cursor: number): Promise<void> {
    const field = harness.field()
    field.value = value
    field.setSelectionRange(cursor, cursor)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
}

async function pressKey(harness: HostHarness, key: string, init: KeyboardEventInit = {}): Promise<void> {
    harness.field().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
    await nextTick()
}

/** 浮层经 Teleport 挂 body，断言绕过 wrapper 直接查 document */
const popupEl = (): HTMLElement | null => document.body.querySelector('.cn-completion')
const optionEls = (): HTMLElement[] => Array.from(document.body.querySelectorAll('.cn-completion__option'))
const optionSegments = (): string[] =>
    optionEls().map((option) => option.querySelector('.cn-completion__segment')?.textContent ?? '')
const activeIndex = (): number => optionEls().findIndex((option) => option.getAttribute('aria-selected') === 'true')

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

/* ---------------------------------------------------------------- 触发与候选 */

describe('触发与候选呈现', () => {
    it('输入 {{ 自动触发：portal 到 body（面板子树外）、候选按 partial 前缀过滤', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{r', 3)
        const popup = popupEl()
        expect(popup).not.toBeNull()
        expect(harness.wrapper.element.contains(popup)).toBe(false)
        expect(popup!.getAttribute('role')).toBe('listbox')
        expect(optionSegments()).toEqual(['row'])
    })

    it('{{ 空表达式出全量头部候选（含 $root / $index 结构头）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        expect(optionSegments()).toEqual(['orderNo', 'assets', 'row', '$index', '$root'])
    })

    it('片段内输入 . 刷新候选：row. 下钻出子键集', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{r', 3)
        expect(harness.source).toHaveBeenLastCalledWith('r')
        await type(harness, '{{row.', 6)
        expect(harness.source).toHaveBeenLastCalledWith('row.')
        expect(optionSegments()).toEqual(['name', 'qty'])
    })

    it('Ctrl+Space 手动触发：旁路 partial 过滤出全量（全量展示语义归浮层，工单 02 契约）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{r', 3)
        expect(optionSegments()).toEqual(['row'])
        await pressKey(harness, ' ', { ctrlKey: true })
        expect(optionSegments()).toEqual(['orderNo', 'assets', 'row', '$index', '$root'])
    })

    it('无补全态不弹：孤点前缀 / 语法错误 / 空候选 / 光标不在片段', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{.', 3)
        expect(popupEl()).toBeNull()
        await type(harness, '{{row..', 7)
        expect(popupEl()).toBeNull()
        await type(harness, '{{zz', 4)
        expect(popupEl()).toBeNull()
        await type(harness, 'plain', 5)
        expect(popupEl()).toBeNull()
    })

    it('全角 ｛｛ 不触发（已知限制：v1 不做归一，非目标内）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '｛｛', 2)
        expect(popupEl()).toBeNull()
        expect(harness.source).not.toHaveBeenCalled()
    })
})

/* ---------------------------------------------------------------- 接受 */

describe('接受（补全剩余路径段，与手工输入同路）', () => {
    it('Enter 接受高亮项：不包 }} 外壳、光标落片段内原位、发出 input+change', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{or', 4)
        expect(optionEls()).toHaveLength(1)
        harness.events.length = 0 // 只看接受动作本身的提交事件
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('{{orderNo')
        expect(harness.field().selectionStart).toBe(9)
        expect(harness.events.map((event) => event.kind)).toEqual(['input', 'change'])
        expect(harness.events.map((event) => event.value)).toEqual(['{{orderNo', '{{orderNo'])
        expect(popupEl()).toBeNull()
    })

    it('Tab 同义接受；尾点态接受 = 片段末尾插入（空 partial 替换）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{row.', 6)
        harness.events.length = 0
        await pressKey(harness, 'Tab')
        expect(harness.field().value).toBe('{{row.name')
        expect(harness.field().selectionStart).toBe(10) // '{{row.' 6 + 'name' 4
        expect(harness.events.map((event) => event.kind)).toEqual(['input', 'change'])
    })

    it('鼠标点选接受', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{row.', 6)
        harness.events.length = 0
        optionEls()[1]!.click()
        await nextTick()
        expect(harness.field().value).toBe('{{row.qty')
        expect(harness.events.map((event) => event.kind)).toEqual(['input', 'change'])
    })

    it('↑↓ 循环导航高亮（aria-selected 跟随），Enter 接受所选项', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        expect(activeIndex()).toBe(0)
        await pressKey(harness, 'ArrowDown')
        expect(activeIndex()).toBe(1)
        await pressKey(harness, 'ArrowUp')
        await pressKey(harness, 'ArrowUp')
        expect(activeIndex()).toBe(4)
        await pressKey(harness, 'ArrowDown')
        expect(activeIndex()).toBe(0)
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('{{orderNo')
    })

    it('多片段模板：接受落在光标所在片段，字面与前序片段不动', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, 'a {{r}} b {{or', 15)
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('a {{r}} b {{orderNo')
    })

    it('接受前 DOM 值漂移（浮层状态滞后）：手术拒绝安全收口，零提交', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{r', 3)
        harness.field().value = 'zzz'
        harness.events.length = 0
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('zzz')
        expect(harness.events).toHaveLength(0)
        expect(popupEl()).toBeNull()
    })
})

/* ---------------------------------------------------------------- IME 守卫 */

describe('IME 守卫（事件入口最前沿）', () => {
    it('合成期 Enter（keyCode 229 / isComposing）是候选确认，绝不接受；compositionend 后键位恢复', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        harness.field().dispatchEvent(new Event('compositionstart'))
        await nextTick()
        harness.events.length = 0

        await pressKey(harness, 'Enter', { keyCode: 229, isComposing: true } as KeyboardEventInit)
        expect(harness.field().value).toBe('{{')
        expect(harness.events).toHaveLength(0)
        expect(popupEl()).not.toBeNull()

        // 合成期方向键是预编辑操作，不导航
        await pressKey(harness, 'ArrowDown', { keyCode: 229, isComposing: true } as KeyboardEventInit)
        expect(activeIndex()).toBe(0)

        // 合成结束：键位恢复正常
        harness.field().dispatchEvent(new Event('compositionend'))
        await nextTick()
        await pressKey(harness, 'Enter', { keyCode: 13 })
        expect(harness.field().value).toBe('{{orderNo')
        expect(harness.events.map((event) => event.kind)).toEqual(['input', 'change'])
    })

    it('合成期鼠标点选不接受', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        harness.field().dispatchEvent(new Event('compositionstart'))
        await nextTick()
        harness.events.length = 0
        optionEls()[0]!.click()
        await nextTick()
        expect(harness.field().value).toBe('{{')
        expect(harness.events).toHaveLength(0)
    })
})

/* ---------------------------------------------------------------- 关闭路径 */

describe('关闭路径', () => {
    it('Esc 关闭；关闭后再输入可重新触发（不死锁）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        expect(popupEl()).not.toBeNull()
        await pressKey(harness, 'Escape')
        expect(popupEl()).toBeNull()
        await type(harness, '{{r', 3)
        expect(popupEl()).not.toBeNull()
    })

    it('失焦关闭', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        expect(popupEl()).not.toBeNull()
        harness.field().dispatchEvent(new Event('blur'))
        await nextTick()
        expect(popupEl()).toBeNull()
    })

    it('点外关闭；点浮层本身不关（浮层根拦 mousedown 防夺焦）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        popupEl()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        await nextTick()
        expect(popupEl()).not.toBeNull()

        const outside = document.createElement('div')
        document.body.appendChild(outside)
        outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await nextTick()
        expect(popupEl()).toBeNull()
    })

    it('输入 }}：光标离开片段即关闭', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{row', 5)
        expect(popupEl()).not.toBeNull()
        await type(harness, '{{row}}', 7)
        expect(popupEl()).toBeNull()
    })

    it('光标移动跟踪（keyup）：片段内保持开启，离开片段关闭', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{r}} x', 3)
        expect(popupEl()).not.toBeNull()

        harness.field().setSelectionRange(2, 2)
        harness.field().dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }))
        await nextTick()
        expect(popupEl()).not.toBeNull()

        harness.field().setSelectionRange(5, 5)
        harness.field().dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
        await nextTick()
        expect(popupEl()).toBeNull()
    })

    it('点击跟踪：移出片段关闭', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{r}} x', 3)
        expect(popupEl()).not.toBeNull()
        harness.field().setSelectionRange(5, 5)
        harness.field().click()
        await nextTick()
        expect(popupEl()).toBeNull()
    })

    it('静态态（enabled=false）零补全：不弹、候选源零调用、Ctrl+Space 也不弹；已开的随切换收口', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        expect(popupEl()).not.toBeNull()

        harness.enabled.value = false
        await nextTick()
        expect(popupEl()).toBeNull()

        harness.source.mockClear() // 只看静态态期间（含 Ctrl+Space）候选源是否被扰动
        await type(harness, '{{r', 3)
        expect(popupEl()).toBeNull()
        expect(harness.source).not.toHaveBeenCalled()
        await pressKey(harness, ' ', { ctrlKey: true })
        expect(popupEl()).toBeNull()
        expect(harness.source).not.toHaveBeenCalled()

        harness.enabled.value = true
        await nextTick()
        await type(harness, '{{r', 3)
        expect(popupEl()).not.toBeNull()
    })
})

/* ---------------------------------------------------------------- portal 与锚点 */

describe('portal 与锚点重算（jsdom 布局为零，rect 经 mock 钉坐标公式）', () => {
    const rectOf = (overrides: Partial<DOMRect>): DOMRect =>
        ({
            x: 0, y: 0, width: 200, height: 20, top: 100, left: 50, right: 250, bottom: 120, toJSON: () => ({}),
            ...overrides,
        }) as DOMRect

    it('input 单行形态：锚 = 字段下缘 + 间隙；resize/scroll 按最新 rect 重算', async () => {
        const harness = mountHost('input', headSource)
        const field = harness.field()
        const rectSpy = vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(rectOf({}))

        await type(harness, '{{', 2)
        const popup = popupEl()!
        expect(popup.style.top).toBe('124px') // bottom 120 + 间隙 4
        expect(popup.style.left).toBe('50px')

        rectSpy.mockReturnValue(rectOf({ top: 300, bottom: 320, y: 300 }))
        window.dispatchEvent(new Event('resize'))
        await nextTick()
        expect(popup.style.top).toBe('324px')

        rectSpy.mockReturnValue(rectOf({ left: 88, x: 88 }))
        window.dispatchEvent(new Event('scroll'))
        await nextTick()
        expect(popup.style.left).toBe('88px')
    })

    it('textarea 多行形态：mirror 流式锚（jsdom 默认字号 16px 入行高兜底），双形态共用重算', async () => {
        const harness = mountHost('textarea', headSource)
        const field = harness.field()
        vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(rectOf({ top: 200, bottom: 260, height: 60, y: 200 }))

        await type(harness, '{{', 2)
        const popup = popupEl()!
        // jsdom 零度量 → 锚 top = rect.top(200)，行高兜底 = 16px × 1.4 = 22.4，弹层上缘 + 间隙 4
        expect(popup.style.top).toBe('226.4px')
        expect(popup.style.left).toBe('50px')

        window.dispatchEvent(new Event('resize'))
        await nextTick()
        expect(popup.style.top).toBe('226.4px')
    })
})
