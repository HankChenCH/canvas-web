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

/** open 节点桩源（工单 10，D10）：候选可空但携带 open 信号——'' = 头部层 open 根节点，
 * 'mix.' = open 节点带宿主合入 properties 的候选（信号与候选空否无关），'mix' = 前缀
 * 过滤后空仍携信号 */
const openSource: CompletionSource = (expr) => {
    if (expr === '') return { partial: '', candidates: [], open: true }
    if (expr === 'dyn') return { partial: 'dyn', candidates: [], open: true }
    if (expr === 'mix') return { partial: 'mix', candidates: [{ path: 'mix.alpha', segment: 'alpha', type: 'string' }], open: true }
    if (expr === 'mix.') return { partial: '', candidates: [{ path: 'mix.alpha', segment: 'alpha', type: 'string' }], open: true }
    return null
}

/** title 回落桩源（工单 10，D8）：description/title 两字段分离透传的三态样本 */
const titleSource: CompletionSource = (expr) => {
    if (expr === '') {
        return {
            partial: '',
            candidates: [
                { path: 'both', segment: 'both', description: '描述优先', title: '标题兜底' },
                { path: 'onlyTitle', segment: 'onlyTitle', title: '仅标题' },
                { path: 'neither', segment: 'neither', type: 'string' },
            ],
        }
    }
    return null
}

/* ---------------------------------------------------------------- 测试宿主 */

type FieldTag = 'textarea' | 'input'

interface HostHarness {
    wrapper: VueWrapper
    field: () => HTMLTextAreaElement | HTMLInputElement
    enabled: Ref<boolean>
    /** 配对门（工单 07）：与 enabled 分离——表达式态未注入 schema 也配对 */
    pairing: Ref<boolean>
    source: Mock<CompletionSource>
    /** 宿主记录到的提交事件（input 实时 / change 收口） */
    events: { kind: 'input' | 'change'; value: string }[]
}

const wrappers: VueWrapper[] = []

function mountHost(tag: FieldTag, resolve: CompletionSource): HostHarness {
    const el = ref<HTMLTextAreaElement | HTMLInputElement | null>(null)
    const popupComp = ref<InstanceType<typeof ExpressionCompletionPopup> | null>(null)
    const enabled = ref(true)
    const pairing = ref(true)
    const source = vi.fn(resolve)
    const events: HostHarness['events'] = []
    const Host = defineComponent({
        setup() {
            // 接线面与 PropertyField 同构：popup 根元素经 expose 回递做量宽收口
            const completion = useExpressionCompletion({
                target: el,
                enabled,
                pairing,
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
    return { wrapper, field: () => el.value as HTMLTextAreaElement, enabled, pairing, source, events }
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

/** 带 inputType 的 input 事件（真实浏览器恒带；jsdom 的 InputEvent 可能丢 init，兜底补写） */
function typedInput(inputType: string): Event {
    let event: Event
    try {
        event = new InputEvent('input', { bubbles: true, inputType })
    } catch {
        event = new Event('input', { bubbles: true })
    }
    if ((event as InputEvent).inputType !== inputType) {
        Object.defineProperty(event, 'inputType', { value: inputType })
    }
    return event
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

/* ---------------------------------------------------------------- 触发与候选 */

describe('触发与候选呈现', () => {
    it('输入 {{ 自动触发：portal 到 body（面板子树外）、候选按 partial 前缀过滤', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{r', 3)
        const popup = popupEl()
        expect(popup).not.toBeNull()
        expect(harness.wrapper.element.contains(popup)).toBe(false)
        expect(popup!.querySelector('[role="listbox"]')).not.toBeNull() // listbox 内只含 option，占位行在表格外
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

/* -------------------------------------------- 开放映射占位与 title 回落（工单 10） */

describe('开放映射占位提示行（工单 10，D10）', () => {
    it('open 信号 → 浮层开：占位提示行渲染（动态字段，键由模板定义）、零候选按钮', async () => {
        const harness = mountHost('textarea', openSource)
        await type(harness, '{{', 2)
        expect(popupEl()).not.toBeNull()
        expect(optionEls()).toHaveLength(0)
        expect(hintEl()?.textContent?.trim()).toBe('动态字段，键由模板定义')
    })

    it('提示行不进导航序：↑↓ 无导航目标；Enter/Tab/点选零提交、浮层保持', async () => {
        const harness = mountHost('textarea', openSource)
        await type(harness, '{{', 2)
        harness.events.length = 0
        await pressKey(harness, 'ArrowDown')
        await pressKey(harness, 'ArrowUp')
        expect(activeIndex()).toBe(-1) // 无 option 项，无高亮
        await pressKey(harness, 'Enter')
        await pressKey(harness, 'Tab')
        expect(harness.field().value).toBe('{{}}')
        expect(harness.events).toHaveLength(0)
        expect(popupEl()).not.toBeNull()
        hintEl()!.click()
        await nextTick()
        expect(harness.field().value).toBe('{{}}')
        expect(harness.events).toHaveLength(0)
    })

    it('open 节点带候选（宿主合入 properties）：提示行并存，候选照常导航接受', async () => {
        const harness = mountHost('textarea', openSource)
        await type(harness, '{{mix.', 7)
        expect(optionSegments()).toEqual(['alpha'])
        expect(hintEl()).not.toBeNull()
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('{{mix.alpha')
        expect(popupEl()).toBeNull()
    })

    it('partial 过滤后空而 open 在场：浮层仍开只显示提示行（无候选但不阻断）', async () => {
        const harness = mountHost('textarea', openSource)
        await type(harness, '{{mix', 5) // expr 'mix'：候选 alpha 不匹配前缀，shown 空
        expect(popupEl()).not.toBeNull()
        expect(optionEls()).toHaveLength(0)
        expect(hintEl()).not.toBeNull()
    })

    it('提示行态关闭路径不回归：Esc / 失焦 / 点外 / }} 照常收口', async () => {
        const harness = mountHost('textarea', openSource)
        await type(harness, '{{', 2)
        expect(popupEl()).not.toBeNull()
        await pressKey(harness, 'Escape')
        expect(popupEl()).toBeNull()

        await type(harness, '{{', 2)
        harness.field().dispatchEvent(new Event('blur'))
        await nextTick()
        expect(popupEl()).toBeNull()

        await type(harness, '{{', 2)
        const outside = document.createElement('div')
        document.body.appendChild(outside)
        outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await nextTick()
        expect(popupEl()).toBeNull()

        await type(harness, '{{dyn}}', 7) // 光标越过 }} 出片段
        expect(popupEl()).toBeNull()
    })

    it('非 open 节点空候选维持现状：不弹（提示行只随 open 信号渲染）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{zz', 4)
        expect(popupEl()).toBeNull()
    })
})

describe('候选展示回落 description ?? title（工单 10，D8）', () => {
    it('description 优先显示；仅 title 回落显示；二者皆缺省无说明文本', async () => {
        const harness = mountHost('textarea', titleSource)
        await type(harness, '{{', 2)
        const options = optionEls()
        expect(options[0]!.textContent).toContain('描述优先')
        expect(options[0]!.textContent).not.toContain('标题兜底')
        expect(options[1]!.textContent).toContain('仅标题')
        expect(options[2]!.textContent).not.toContain('描述')
        expect(options[2]!.textContent).not.toContain('标题')
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
        expect(harness.field().value).toBe('{{orderNo}}') // {{ 键入已配对：接受落 {{ }} 之间出完整片段
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

/* ---------------------------------------------------------------- 自动配对（工单 07） */

describe('自动配对（工单 07）：{{ 补出 }} + 光标回移 + 弹候选', () => {
    it('键入第二个 {：值补成 {{}}、光标落片段内、弹头部候选；第一个 { 不配', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{', 1)
        expect(harness.field().value).toBe('{')
        expect(popupEl()).toBeNull()
        await type(harness, '{{', 2)
        expect(harness.field().value).toBe('{{}}')
        expect(harness.field().selectionStart).toBe(2)
        expect(popupEl()).not.toBeNull()
        expect(optionSegments()).toEqual(['orderNo', 'assets', 'row', '$index', '$root'])
    })

    it('与手工输入同路：补出 } 只派发 input 实时合步（change 归接受/失焦，undo 粒度同手工连打）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        expect(harness.events.map((event) => [event.kind, event.value])).toEqual([
            ['input', '{{'],
            ['input', '{{}}'],
        ])
    })

    it('空片段接受候选：补在 {{ }} 之间出完整片段、光标片段内原位', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        await pressKey(harness, 'Enter')
        expect(harness.field().value).toBe('{{orderNo}}')
        expect(harness.field().selectionStart).toBe(9) // 'orderNo' 尾（index 9 = 首个 }} 之前，片段内原位）
        expect(popupEl()).toBeNull()
    })

    it('composing 中不配对（延伸既有守卫语义）；compositionend 后片段在、浮层开但不补对', async () => {
        const harness = mountHost('textarea', headSource)
        harness.field().dispatchEvent(new Event('compositionstart'))
        await nextTick()
        await type(harness, '{{', 2)
        expect(harness.field().value).toBe('{{')
        expect(popupEl()).toBeNull()
        harness.field().dispatchEvent(new Event('compositionend'))
        await nextTick()
        expect(harness.field().value).toBe('{{')
        expect(popupEl()).not.toBeNull()
    })

    it('非键入插入不配对：paste / 合成落定的 inputType 各归其道；显式 insertText 配对', async () => {
        const harness = mountHost('textarea', headSource)
        const field = harness.field()
        field.value = 'x{{'
        field.setSelectionRange(3, 3)
        field.dispatchEvent(typedInput('insertFromPaste'))
        await nextTick()
        expect(field.value).toBe('x{{')
        expect(popupEl()).not.toBeNull() // open 片段照常触发浮层，只是不配对

        field.value = '{{'
        field.setSelectionRange(2, 2)
        field.dispatchEvent(typedInput('insertCompositionText'))
        await nextTick()
        expect(field.value).toBe('{{')

        // 真实浏览器键入恒带 insertText（退化空串同义，见实现注释）
        field.value = 'y{{'
        field.setSelectionRange(3, 3)
        field.dispatchEvent(typedInput('insertText'))
        await nextTick()
        expect(field.value).toBe('y{{}}')
    })

    it('静态态（enabled=false、pairing=false）键入 {{ 原样不配', async () => {
        const harness = mountHost('textarea', headSource)
        harness.enabled.value = false
        harness.pairing.value = false
        await type(harness, '{{', 2)
        expect(harness.field().value).toBe('{{')
        expect(harness.source).not.toHaveBeenCalled()
    })

    it('配对门独立于候选源注入：表达式态未注入 schema（enabled=false）仍配对、浮层不弹', async () => {
        const harness = mountHost('textarea', headSource)
        harness.enabled.value = false
        await type(harness, '{{', 2)
        expect(harness.field().value).toBe('{{}}')
        expect(popupEl()).toBeNull()
        expect(harness.source).not.toHaveBeenCalled()
    })

    it('空片段退格 = {{}} 整对删除：光标落删除点、只发 input、浮层收口', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, 'a {{', 4)
        expect(harness.field().value).toBe('a {{}}')
        harness.events.length = 0
        await pressKey(harness, 'Backspace')
        expect(harness.field().value).toBe('a ')
        expect(harness.field().selectionStart).toBe(2)
        expect(harness.events.map((event) => [event.kind, event.value])).toEqual([['input', 'a ']])
        expect(popupEl()).toBeNull()
    })

    it('非空片段退格不劫持：只删一个字符由原生处理（整对删除仅空片段）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{r}}', 3)
        harness.events.length = 0
        await pressKey(harness, 'Backspace')
        expect(harness.field().value).toBe('{{r}}') // 测试无原生删除，handler 未拦截即断言成立
        expect(harness.events).toHaveLength(0)
    })

    it('删对产物恰以 {{ 收尾时不立刻再配（再入闸对称）：{{{{}} 删外层对得 {{', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{{{}}', 4)
        await pressKey(harness, 'Backspace')
        expect(harness.field().value).toBe('{{')
        expect(harness.field().selectionStart).toBe(2)
    })

    it('} 越过不重复：下一字符已是 } 时不插入、光标跳过，文本零变化零提交', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{', 2)
        harness.events.length = 0
        await pressKey(harness, '}')
        expect(harness.field().value).toBe('{{}}')
        expect(harness.field().selectionStart).toBe(3)
        expect(harness.events).toHaveLength(0)
        expect(popupEl()).not.toBeNull() // 仍在片段区域内（closed 判定 < end）
        await pressKey(harness, '}')
        expect(harness.field().selectionStart).toBe(4)
        expect(popupEl()).toBeNull() // 越过 }} 出片段 → 关闭
    })

    it('浮层未开（无候选态）时 } 越过同样生效（惯例作用于表达式态输入，不依赖浮层）', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, '{{zz}}', 4)
        expect(popupEl()).toBeNull() // 'zz' 无候选
        await pressKey(harness, '}')
        expect(harness.field().value).toBe('{{zz}}')
        expect(harness.field().selectionStart).toBe(5)
    })

    it('光标后已有 }}（closed 片段）时不误配：交给既有候选路径', async () => {
        const harness = mountHost('textarea', headSource)
        await type(harness, 'x{{}}', 3)
        expect(harness.field().value).toBe('x{{}}') // 不再补 }} —— 已是（空）片段
        expect(popupEl()).not.toBeNull() // 空片段 → 头部候选自然弹出
    })

    it('单行 input 同款配对（textarea/input 双形态同路）', async () => {
        const harness = mountHost('input', headSource)
        await type(harness, '{{', 2)
        expect(harness.field().value).toBe('{{}}')
        expect(popupEl()).not.toBeNull()
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
        expect(harness.field().value).toBe('{{}}') // {{ 键入已在合成开始前配对；合成期 Enter 未接受
        expect(harness.events).toHaveLength(0)
        expect(popupEl()).not.toBeNull()

        // 合成期方向键是预编辑操作，不导航
        await pressKey(harness, 'ArrowDown', { keyCode: 229, isComposing: true } as KeyboardEventInit)
        expect(activeIndex()).toBe(0)

        // 合成结束：键位恢复正常
        harness.field().dispatchEvent(new Event('compositionend'))
        await nextTick()
        await pressKey(harness, 'Enter', { keyCode: 13 })
        expect(harness.field().value).toBe('{{orderNo}}') // 空片段配对态接受：补在 {{ }} 之间
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
        expect(harness.field().value).toBe('{{}}') // {{ 键入已在合成开始前配对；合成期点选不接受
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

    it('光标贴近视口右缘：浮层左移收口不越出视口（首开补量 + resize 同路）', async () => {
        const VIEWPORT_W = 1024
        const POPUP_W = 241 // 工单 05 目验实测宽
        Object.defineProperty(window, 'innerWidth', { value: VIEWPORT_W, configurable: true })
        const harness = mountHost('textarea', headSource)
        const field = harness.field()
        // 字段贴视口右缘：光标锚 x=900，900 + 241 > 1024 → 不收口即越界 117px
        vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(rectOf({ left: 900, x: 900, right: 1100 }))
        // jsdom 零布局：浮层量宽口径按类名钉在 prototype（首渲染即被覆盖，先于首开补量一拍）
        const widthSpy = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
            return this.classList.contains('cn-completion') ? POPUP_W : 0
        })

        await type(harness, '{{', 2)
        await nextTick()

        const popup = popupEl()!
        expect(popup).not.toBeNull()
        expect(parseFloat(popup.style.left) + POPUP_W).toBeLessThanOrEqual(VIEWPORT_W)

        // 视口收窄：resize 重算按新视口收口
        Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true })
        window.dispatchEvent(new Event('resize'))
        await nextTick()
        expect(parseFloat(popup.style.left) + POPUP_W).toBeLessThanOrEqual(960)

        widthSpy.mockRestore()
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
