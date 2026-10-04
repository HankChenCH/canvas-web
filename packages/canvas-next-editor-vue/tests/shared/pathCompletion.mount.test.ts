// @vitest-environment jsdom
/**
 * 裸路径（rowsPath）补全浮层控件挂载测试（rows-path-completion 工单 02）。
 *
 * 控件 = usePathCompletion（composable，绑宿主 input/textarea）+ 既有
 * ExpressionCompletionPopup（零改动复用）。候选源按纯函数注入，测试桩只回固定
 * 候选集——枚举语义已由内核工单 01 单测钉死，桩的候选形状照抄其外显面（object
 * 中间站无徽标数据、array 终点 type 字段携「行数组」展示文案——文案置入归
 * 工单 03/04 source 组装，本文件以带文案的桩钉浮层渲染路径）。本文件只钉：
 *   触发（输入即弹 / `.` 刷新 / Ctrl+Space 强制含空输入全量 / 空输入不自动弹）、
 *   前缀过滤（大小写敏感）、接受（↑↓ 导航、Enter/Tab、点选；后缀替换 + 合成
 *   input/change；array 段接受不补 `.`；中途编辑只换光标所在段）、
 *   IME 守卫（229/isComposing 不接受）、关闭（Esc/失焦/点外/候选空/open 占位例外、
 *   占位态键位让路原生）、
 *   「行数组」文案经 source 数据直透浮层、portal 与锚点重算。
 * 表达式补全（useExpressionCompletion）零改动的回归由既有
 * expressionCompletion.mount.test.ts 不改动全绿保证。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import ExpressionCompletionPopup from '../../src/shared/ExpressionCompletionPopup.vue'
import { usePathCompletion } from '../../src/shared/usePathCompletion'
import type { CompletionItem, CompletionSource } from '../../src/shared/completion'

/* ---------------------------------------------------------------- 候选源桩 */

/** 顶层候选：form = object 中间站（无徽标数据）、rows/Region = array 终点（「行数组」
 * 展示文案由 source 数据置入 type 字段——工单 01 枚举器外显面同款） */
const ROOT_ITEMS: CompletionItem[] = [
    { path: 'form', segment: 'form', description: '表单' },
    { path: 'rows', segment: 'rows', type: '行数组' },
    { path: 'Region', segment: 'Region', type: '行数组' },
]
/** form 之下：fields = array 终点、meta = object 中间站（title 元信息） */
const FORM_ITEMS: CompletionItem[] = [
    { path: 'form.fields', segment: 'fields', type: '行数组' },
    { path: 'form.meta', segment: 'meta', title: '元信息' },
]

/** 光标前输入串 → 候选集；未列出的输入 = 无补全态（null，对齐源契约——漂移/降级同款） */
const pathSource: CompletionSource = (expr) => {
    if (expr === '') return { partial: '', candidates: ROOT_ITEMS }
    if (expr === 'f' || expr === 'fo' || expr === 'form') return { partial: expr, candidates: ROOT_ITEMS }
    if (expr === 'r' || expr === 'R') return { partial: expr, candidates: ROOT_ITEMS }
    if (expr === 'zz') return { partial: 'zz', candidates: [] }
    if (expr === 'form.') return { partial: '', candidates: FORM_ITEMS }
    if (expr === 'form.f' || expr === 'form.fi') return { partial: expr.slice(5), candidates: FORM_ITEMS }
    return null
}

/** open 节点桩源（D10 同款）：候选空但携带 open 信号——占位提示行解释原因 */
const openPathSource: CompletionSource = (expr) => {
    if (expr === 'dyn') return { partial: 'dyn', candidates: [], open: true }
    return null
}

/* ---------------------------------------------------------------- 测试宿主 */

type FieldTag = 'textarea' | 'input'

interface HostHarness {
    wrapper: VueWrapper
    field: () => HTMLTextAreaElement | HTMLInputElement
    enabled: Ref<boolean>
    source: ReturnType<typeof vi.fn>
    /** 宿主记录到的提交事件（input 实时 / change 收口） */
    events: { kind: 'input' | 'change'; value: string }[]
}

const wrappers: VueWrapper[] = []

function mountHost(tag: FieldTag, resolve: CompletionSource): HostHarness {
    const el = ref<HTMLTextAreaElement | HTMLInputElement | null>(null)
    const popupComp = ref<InstanceType<typeof ExpressionCompletionPopup> | null>(null)
    const enabled = ref(true)
    const source = vi.fn(resolve)
    const events: HostHarness['events'] = []
    const Host = defineComponent({
        setup() {
            // 接线面与 PropertyField 同构：popup 根元素经 expose 回递做量宽收口
            const completion = usePathCompletion({
                target: el,
                enabled,
                resolve: source,
                popupEl: () => popupComp.value?.rootEl ?? null,
            })
            const record = (kind: 'input' | 'change') => (event: Event) =>
                events.push({ kind, value: (event.target as HTMLInputElement).value })
            return () => [
                h(tag, { ref: el, onInput: record('input'), onChange: record('change') }),
                h(ExpressionCompletionPopup, { ref: popupComp, state: completion.popup, onSelect: completion.accept }),
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
const hintEl = (): HTMLElement | null => document.body.querySelector('.cn-completion__hint')

afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
})

/* ---------------------------------------------------------------- 触发与前缀过滤 */

describe('触发与前缀过滤', () => {
    it('输入即弹（首字符起）：portal 到 body、候选按 partial 前缀过滤', async () => {
        const harness = mountHost('input', pathSource)
        expect(popupEl()).toBeNull() // 空字段不自动弹（D4）
        await type(harness, 'f', 1)
        const popup = popupEl()
        expect(popup).not.toBeNull()
        expect(harness.wrapper.element.contains(popup)).toBe(false)
        expect(harness.source).toHaveBeenLastCalledWith('f')
        expect(optionSegments()).toEqual(['form'])
    })

    it('`.` 刷新下钻：form. 出下一层候选', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.', 5)
        expect(harness.source).toHaveBeenLastCalledWith('form.')
        expect(optionSegments()).toEqual(['fields', 'meta'])
    })

    it('前缀过滤大小写敏感：r 只出 rows、R 只出 Region', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'r', 1)
        expect(optionSegments()).toEqual(['rows'])
        await type(harness, 'R', 1)
        expect(optionSegments()).toEqual(['Region'])
    })

    it('Ctrl+Space 强制开：空输入列全量起点候选；带 partial 时旁路过滤出全量', async () => {
        const harness = mountHost('input', pathSource)
        await pressKey(harness, ' ', { ctrlKey: true })
        expect(optionSegments()).toEqual(['form', 'rows', 'Region'])
        await type(harness, 'f', 1)
        expect(optionSegments()).toEqual(['form'])
        await pressKey(harness, ' ', { metaKey: true })
        expect(optionSegments()).toEqual(['form', 'rows', 'Region'])
    })

    it('空输入不自动弹（D4）：清空已开的浮层随手收口，候选源不被空输入扰动', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'f', 1)
        expect(popupEl()).not.toBeNull()
        harness.source.mockClear()
        await type(harness, '', 0)
        expect(popupEl()).toBeNull()
        expect(harness.source).not.toHaveBeenCalled()
    })

    it('候选空不弹：zz 无匹配；无补全态（source null，漂移/降级）同款静默', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'zz', 2)
        expect(popupEl()).toBeNull()
        await type(harness, 'form.zz', 7)
        expect(popupEl()).toBeNull()
    })
})

/* ------------------------------------------------ open 占位提示行（D10 同款） */

describe('open 占位提示行（D10 同款）', () => {
    it('open 信号 → 浮层开：占位提示行渲染、零候选按钮', async () => {
        const harness = mountHost('input', openPathSource)
        await type(harness, 'dyn', 3)
        expect(popupEl()).not.toBeNull()
        expect(optionEls()).toHaveLength(0)
        expect(hintEl()?.textContent?.trim()).toBe('动态字段，键由模板定义')
    })

    it('提示行不进导航序：↑↓ 无导航目标；Enter/Tab/点选零提交、浮层保持', async () => {
        const harness = mountHost('input', openPathSource)
        await type(harness, 'dyn', 3)
        harness.events.length = 0
        await pressKey(harness, 'ArrowDown')
        await pressKey(harness, 'ArrowUp')
        expect(activeIndex()).toBe(-1)
        await pressKey(harness, 'Enter')
        await pressKey(harness, 'Tab')
        expect(harness.field().value).toBe('dyn')
        expect(harness.events).toHaveLength(0)
        expect(popupEl()).not.toBeNull()
        hintEl()!.click()
        await nextTick()
        expect(harness.field().value).toBe('dyn')
        expect(harness.events).toHaveLength(0)
    })

    it('占位态键位让路原生（不进导航序的键位面）：Enter/Tab/方向键不劫持，Esc 照收', async () => {
        const harness = mountHost('input', openPathSource)
        await type(harness, 'dyn', 3)
        const field = harness.field()
        const rawKey = (key: string, init: KeyboardEventInit = {}): boolean => {
            const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
            field.dispatchEvent(event)
            return event.defaultPrevented
        }
        expect(rawKey('Enter')).toBe(false) // 宿主表单原生 Enter 提交不吞
        expect(rawKey('Tab')).toBe(false) // 原生移焦不吞
        expect(rawKey('ArrowDown')).toBe(false) // 原生移光标不吞
        expect(rawKey('Escape')).toBe(true) // Esc 收口保留
        await nextTick()
        expect(popupEl()).toBeNull()
    })

    it('open 态关闭路径不回归：Esc / 失焦 / 点外照常收口', async () => {
        const harness = mountHost('input', openPathSource)
        await type(harness, 'dyn', 3)
        expect(popupEl()).not.toBeNull()
        await pressKey(harness, 'Escape')
        expect(popupEl()).toBeNull()

        await type(harness, 'dyn', 3)
        harness.field().dispatchEvent(new Event('blur'))
        await nextTick()
        expect(popupEl()).toBeNull()

        await type(harness, 'dyn', 3)
        const outside = document.createElement('div')
        document.body.appendChild(outside)
        outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await nextTick()
        expect(popupEl()).toBeNull()
    })
})

/* ---------------------------------------------------------------- 接受 */

describe('接受（后缀替换，与手工输入同路）', () => {
    it('Enter 接受高亮项：partial 换所选段、光标落段尾、发出 input+change', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.fi', 7)
        expect(optionSegments()).toEqual(['fields'])
        harness.events.length = 0 // 只看接受动作本身的提交事件
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('form.fields')
        expect(harness.field().selectionStart).toBe(11)
        expect(harness.events.map((event) => event.kind)).toEqual(['input', 'change'])
        expect(harness.events.map((event) => event.value)).toEqual(['form.fields', 'form.fields'])
        expect(popupEl()).toBeNull()
    })

    it('Tab 同义接受；尾点态接受 = 串尾插入（空 partial 替换）', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.', 5)
        harness.events.length = 0
        await pressKey(harness, 'Tab')
        expect(harness.field().value).toBe('form.fields')
        expect(harness.field().selectionStart).toBe(11)
        expect(harness.events.map((event) => event.kind)).toEqual(['input', 'change'])
    })

    it('鼠标点选接受', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.', 5)
        harness.events.length = 0
        optionEls()[1]!.click()
        await nextTick()
        expect(harness.field().value).toBe('form.meta')
        expect(harness.events.map((event) => event.kind)).toEqual(['input', 'change'])
    })

    it('↑↓ 循环导航高亮（aria-selected 跟随），Enter 接受所选项', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.', 5)
        expect(activeIndex()).toBe(0)
        await pressKey(harness, 'ArrowDown')
        expect(activeIndex()).toBe(1)
        await pressKey(harness, 'ArrowUp')
        await pressKey(harness, 'ArrowUp')
        expect(activeIndex()).toBe(1)
        await pressKey(harness, 'ArrowDown')
        expect(activeIndex()).toBe(0)
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('form.fields')
    })

    it('array 段（合法终点）接受不补 `.`：值即段名收口', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'r', 1)
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('rows')
        expect(harness.field().value.endsWith('.')).toBe(false)
    })

    it('中途编辑：源入参取光标前串，接受只换光标所在段、光标后文本保留', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.fi', 6) // 光标在 f 后：候选按 form.f 段落
        expect(harness.source).toHaveBeenLastCalledWith('form.f')
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('form.fieldsi') // 尾巴 i 保留
        expect(harness.field().selectionStart).toBe(11)
    })

    it('接受前 DOM 值漂移（浮层状态滞后）：手术拒绝安全收口，零提交', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.fi', 7)
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
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.fi', 7)
        harness.field().dispatchEvent(new Event('compositionstart'))
        await nextTick()
        harness.events.length = 0

        await pressKey(harness, 'Enter', { keyCode: 229, isComposing: true } as KeyboardEventInit)
        expect(harness.field().value).toBe('form.fi')
        expect(harness.events).toHaveLength(0)
        expect(popupEl()).not.toBeNull()

        await pressKey(harness, 'ArrowDown', { keyCode: 229, isComposing: true } as KeyboardEventInit)
        expect(activeIndex()).toBe(0) // 合成期方向键是预编辑操作，不导航

        harness.field().dispatchEvent(new Event('compositionend'))
        await nextTick()
        await pressKey(harness, 'Enter', { keyCode: 13 })
        expect(harness.field().value).toBe('form.fields')
        expect(harness.events.map((event) => event.kind)).toEqual(['input', 'change'])
    })

    it('合成期鼠标点选不接受', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.fi', 7)
        harness.field().dispatchEvent(new Event('compositionstart'))
        await nextTick()
        harness.events.length = 0
        optionEls()[0]!.click()
        await nextTick()
        expect(harness.field().value).toBe('form.fi')
        expect(harness.events).toHaveLength(0)
    })
})

/* ---------------------------------------------------------------- 关闭路径 */

describe('关闭路径', () => {
    it('Esc 关闭；关闭后再输入可重新触发（不死锁）', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'f', 1)
        expect(popupEl()).not.toBeNull()
        await pressKey(harness, 'Escape')
        expect(popupEl()).toBeNull()
        await type(harness, 'fo', 2)
        expect(popupEl()).not.toBeNull()
    })

    it('失焦关闭', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'f', 1)
        expect(popupEl()).not.toBeNull()
        harness.field().dispatchEvent(new Event('blur'))
        await nextTick()
        expect(popupEl()).toBeNull()
    })

    it('点外关闭；点浮层本身不关（浮层根拦 mousedown 防夺焦）', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'f', 1)
        popupEl()!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
        await nextTick()
        expect(popupEl()).not.toBeNull()

        const outside = document.createElement('div')
        document.body.appendChild(outside)
        outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await nextTick()
        expect(popupEl()).toBeNull()
    })

    it('光标移动跟踪（keyup/click 只跟踪不主动开）：移到串首空输入位关闭', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'form.fi', 7)
        expect(popupEl()).not.toBeNull()

        harness.field().setSelectionRange(5, 5)
        harness.field().dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }))
        await nextTick()
        expect(popupEl()).not.toBeNull() // form. 处仍有候选，保持

        harness.field().setSelectionRange(0, 0)
        harness.field().dispatchEvent(new KeyboardEvent('keyup', { key: 'Home', bubbles: true }))
        await nextTick()
        expect(popupEl()).toBeNull() // 串首空输入位：不主动开即收口
    })

    it('静态态（enabled=false）零补全：不弹、候选源零调用；已开的随切换收口', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, 'f', 1)
        expect(popupEl()).not.toBeNull()

        harness.enabled.value = false
        await nextTick()
        expect(popupEl()).toBeNull()

        harness.source.mockClear()
        await type(harness, 'fo', 2)
        expect(popupEl()).toBeNull()
        expect(harness.source).not.toHaveBeenCalled()
        await pressKey(harness, ' ', { ctrlKey: true })
        expect(popupEl()).toBeNull()
        expect(harness.source).not.toHaveBeenCalled()

        harness.enabled.value = true
        await nextTick()
        await type(harness, 'f', 1)
        expect(popupEl()).not.toBeNull()
    })
})

/* ---------------------------------------- 「行数组」徽标与元信息（source 数据直透） */

describe('「行数组」徽标文案经 source 数据直透（浮层零改动）', () => {
    it('array 候选徽标显示 source 置入的展示文案；object 中间站无徽标；title 回落显示', async () => {
        const harness = mountHost('input', pathSource)
        await type(harness, '', 0)
        await pressKey(harness, ' ', { ctrlKey: true }) // 空输入全量起点候选
        const options = optionEls()
        expect(options).toHaveLength(3)
        expect(options[0]!.querySelector('.cn-completion__segment')!.textContent).toBe('form')
        expect(options[0]!.textContent).toContain('表单') // description 透出
        expect(options[1]!.textContent).toContain('行数组') // array 展示文案（非 'array' 字面）
        expect(options[2]!.textContent).toContain('行数组')
        await type(harness, 'form.', 5)
        const sub = optionEls()
        expect(sub[0]!.textContent).toContain('行数组')
        expect(sub[1]!.textContent).toContain('元信息') // title 回落（description ?? title）
    })
})

/* ---------------------------------------------------------------- portal 与锚点 */

describe('portal 与锚点重算（jsdom 布局为零，rect 经 mock 钉坐标公式）', () => {
    it('input 单行形态：锚 = 字段下缘 + 间隙；resize/scroll 按最新 rect 重算', async () => {
        const harness = mountHost('input', pathSource)
        const field = harness.field()
        const rectOf = (overrides: Partial<DOMRect>): DOMRect =>
            ({
                x: 0, y: 0, width: 200, height: 20, top: 100, left: 50, right: 250, bottom: 120, toJSON: () => ({}),
                ...overrides,
            }) as DOMRect
        const rectSpy = vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(rectOf({}))

        await type(harness, 'f', 1)
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

    it('textarea 双形态同路（建表表单/属性面板宿主均单行，控件不设形态差）', async () => {
        const harness = mountHost('textarea', pathSource)
        await type(harness, 'f', 1)
        expect(popupEl()).not.toBeNull()
        expect(optionSegments()).toEqual(['form'])
    })
})
