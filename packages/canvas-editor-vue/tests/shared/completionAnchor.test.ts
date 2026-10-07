// @vitest-environment jsdom
/**
 * 光标锚点测量单测（表达式就地编辑 spec 决策 6 的两处画布适配）。
 *
 * - scale 折算：宿主在 `transform: scale(zoom)` 系（画布 textarea 随相机缩放）
 *   时，mirror 布局偏移与行高是未含变换的布局像素，须 × scale 折算后与
 *   getBoundingClientRect() 项（已含变换）相加——zoom 0.5/2 锚点断言钉公式；
 *   缺省 1 = 既有面板行为逐项恒等。
 * - mirror white-space 按宿主 computed 拷贝：画布 autowrap=false 的 textarea 是
 *   pre，照旧硬编码 pre-wrap 会在长行测量里提前折行、锚点横向漂移。
 *
 * jsdom 零布局：rect 经 mock 钉值、mirror 偏移经 prototype getter mock 钉值、
 * mirror 节点经 body.appendChild 捕获（即建即删，捕获引用事后验样式）——
 * expressionCompletion.mount.test 同款口径。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { measureCursorAnchor } from '../../src/shared/completionAnchor'

/** 钉值 rect（css 像素）：left 50 / top 100 / bottom 120 */
const rectOf = (overrides: Partial<DOMRect> = {}): DOMRect =>
    ({
        x: 0, y: 0, width: 200, height: 20, top: 100, left: 50, right: 250, bottom: 120, toJSON: () => ({}),
        ...overrides,
    }) as DOMRect

function makeField(tag: 'textarea' | 'input'): HTMLTextAreaElement | HTMLInputElement {
    const el = document.createElement(tag)
    document.body.appendChild(el)
    return el
}

afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
})

describe('scale 折算（宿主在 transform: scale 系）', () => {
    it('textarea：mirror 光标偏移与行高 × scale，rect 项原样——zoom 2', () => {
        const el = makeField('textarea') as HTMLTextAreaElement
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rectOf())
        // marker 是 span：mirror 布局偏移钉值（jsdom 零布局恒 0，mock 出非平凡偏移）
        vi.spyOn(HTMLSpanElement.prototype, 'offsetLeft', 'get').mockReturnValue(120)
        vi.spyOn(HTMLSpanElement.prototype, 'offsetTop', 'get').mockReturnValue(44.8)
        const anchor = measureCursorAnchor(el, 2)
        // left = rect.left 50 + border 0 + padding 0 + 120 × 2（偏移折算）
        expect(anchor.left).toBe(290)
        // top = rect.top 100 + 44.8 × 2；bottom = top + 行高 22.4（16px × 1.4 兜底）× 2
        expect(anchor.top).toBeCloseTo(189.6)
        expect(anchor.bottom).toBeCloseTo(189.6 + 44.8)
    })

    it('textarea：zoom 0.5 同式折算', () => {
        const el = makeField('textarea') as HTMLTextAreaElement
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rectOf())
        vi.spyOn(HTMLSpanElement.prototype, 'offsetLeft', 'get').mockReturnValue(120)
        vi.spyOn(HTMLSpanElement.prototype, 'offsetTop', 'get').mockReturnValue(44.8)
        const anchor = measureCursorAnchor(el, 0.5)
        expect(anchor.left).toBe(50 + 60)
        expect(anchor.top).toBeCloseTo(100 + 22.4)
        expect(anchor.bottom).toBeCloseTo(100 + 22.4 + 11.2)
    })

    it('textarea：缺省 scale=1 恒等（面板行为不变闸）', () => {
        const el = makeField('textarea') as HTMLTextAreaElement
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rectOf())
        vi.spyOn(HTMLSpanElement.prototype, 'offsetLeft', 'get').mockReturnValue(120)
        vi.spyOn(HTMLSpanElement.prototype, 'offsetTop', 'get').mockReturnValue(44.8)
        const anchor = measureCursorAnchor(el)
        expect(anchor.left).toBe(170)
        expect(anchor.top).toBeCloseTo(144.8)
        expect(anchor.bottom).toBeCloseTo(144.8 + 22.4)
    })

    it('input：mirror 量宽 × scale 折算，纵向锚 rect 上下缘（无行高项）', () => {
        const el = makeField('input') as HTMLInputElement
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(rectOf())
        // mirror 是 div：量宽口径 mock 到 prototype（120 → scale 2 = 240）
        vi.spyOn(HTMLDivElement.prototype, 'getBoundingClientRect').mockReturnValue({
            width: 120,
        } as DOMRect)
        const scaled = measureCursorAnchor(el, 2)
        expect(scaled.left).toBe(50 + 240)
        expect(scaled.top).toBe(100)
        expect(scaled.bottom).toBe(120)
        // 缺省 1 恒等
        expect(measureCursorAnchor(el).left).toBe(170)
    })
})

describe('mirror white-space 按宿主 computed', () => {
    it('宿主 pre（画布 autowrap=false）：mirror 按宿主拷贝，长行测量不再按 pre-wrap 折行', () => {
        const el = makeField('textarea') as HTMLTextAreaElement
        el.style.whiteSpace = 'pre'
        const mirrors: HTMLDivElement[] = []
        vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
            mirrors.push(node as HTMLDivElement)
            return node
        })
        measureCursorAnchor(el)
        expect(mirrors[0]!.style.whiteSpace).toBe('pre')
    })

    it('宿主缺省（UA pre-wrap）：mirror 照拷 pre-wrap——面板测量与旧版逐项一致', () => {
        const el = makeField('textarea') as HTMLTextAreaElement
        const mirrors: HTMLDivElement[] = []
        vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
            mirrors.push(node as HTMLDivElement)
            return node
        })
        measureCursorAnchor(el)
        expect(mirrors[0]!.style.whiteSpace).toBe('pre-wrap')
    })
})
