import { describe, expect, it, vi } from 'vitest'

import { createUax14LineBreaker, heuristicMeasurerFactory } from '@hankchen/canvas'

import { memoizeTextPolicies } from '../../src/shared/textPoliciesMemo'
import type { TextMeasurer } from '@hankchen/canvas'

/** 计数度量器工厂：观察 measure 调用次数（memo 命中的断言面） */
function countingMeasurerFactory(measure: (text: string) => number) {
    let calls = 0
    const factory = vi.fn((_font: string, _fontSize: number): TextMeasurer => ({
        measure: (text: string) => {
            calls += 1
            return measure(text)
        },
    }))
    return { factory, count: () => calls }
}

describe('memoizeTextPolicies（canvas-web-render-perf 工单 02）：布局策略的引用级 memo 包装', () => {
    it('断行缓存：同 (text, width, font, fontSize) 命中缓存不重算（同引用返回）', () => {
        const breaker = vi.fn(() => ['a', 'b'])
        const { factory } = countingMeasurerFactory(() => 10)
        const policies = memoizeTextPolicies({ lineBreaker: breaker, measurerFactory: factory })

        const first = policies.lineBreaker!('hello', 100, policies.measurerFactory!('F', 16))
        const second = policies.lineBreaker!('hello', 100, policies.measurerFactory!('F', 16))

        expect(first).toEqual(['a', 'b'])
        expect(second).toBe(first) // 缓存命中：同数组引用
        expect(breaker).toHaveBeenCalledTimes(1)
    })

    it('分量失效：text / width / font / fontSize 任一变化即重算，回落旧键仍命中', () => {
        const breaker = vi.fn((text: string) => [text])
        const { factory } = countingMeasurerFactory(() => 10)
        const policies = memoizeTextPolicies({ lineBreaker: breaker, measurerFactory: factory })

        policies.lineBreaker!('hello', 100, policies.measurerFactory!('F', 16))
        policies.lineBreaker!('hello', 200, policies.measurerFactory!('F', 16)) // width 变
        policies.lineBreaker!('world', 100, policies.measurerFactory!('F', 16)) // text 变
        policies.lineBreaker!('hello', 100, policies.measurerFactory!('G', 16)) // font 变
        policies.lineBreaker!('hello', 100, policies.measurerFactory!('F', 24)) // fontSize 变
        expect(breaker).toHaveBeenCalledTimes(5)

        // 回到首个键：缓存仍在
        policies.lineBreaker!('hello', 100, policies.measurerFactory!('F', 16))
        expect(breaker).toHaveBeenCalledTimes(5)
    })

    it('缺省分量回落 core 缺省且同样被 memo：断行结果与裸 UAX14 一致、二次调用同引用', () => {
        const policies = memoizeTextPolicies()
        const text = '你好画布，断行测试。'
        // 参照系 = core 缺省全家（UAX14 + 启发式度量器）：memo 包装须逐字节同结果
        const reference = createUax14LineBreaker()(text, 64, heuristicMeasurerFactory('', 16))

        const first = policies.lineBreaker!(text, 64, policies.measurerFactory!('', 16))
        const second = policies.lineBreaker!(text, 64, policies.measurerFactory!('', 16))

        expect(first).toEqual(reference)
        expect(second).toBe(first)
        // 缺省度量器 = 启发式：可打印 ASCII 0.55 字宽
        expect(policies.measurerFactory!('', 16).measure('abcd')).toBeCloseTo(4 * 16 * 0.55, 10)
    })

    it('容量界淘汰：超出 maxLineEntries 后最旧键被逐出、再访重算', () => {
        const breaker = vi.fn((text: string) => [text])
        const { factory } = countingMeasurerFactory(() => 10)
        const policies = memoizeTextPolicies(
            { lineBreaker: breaker, measurerFactory: factory },
            { maxLineEntries: 2 },
        )

        policies.lineBreaker!('a', 10, policies.measurerFactory!('F', 16))
        policies.lineBreaker!('b', 10, policies.measurerFactory!('F', 16))
        policies.lineBreaker!('c', 10, policies.measurerFactory!('F', 16)) // 逐出 'a'
        expect(breaker).toHaveBeenCalledTimes(3)

        policies.lineBreaker!('a', 10, policies.measurerFactory!('F', 16)) // 重算
        expect(breaker).toHaveBeenCalledTimes(4)
        policies.lineBreaker!('c', 10, policies.measurerFactory!('F', 16)) // 'c' 仍在
        expect(breaker).toHaveBeenCalledTimes(4)
    })

    it('度量缓存：同 (font, fontSize, text) 命中不重测，任一分量变化重测', () => {
        const { factory, count } = countingMeasurerFactory((text) => text.length)
        const policies = memoizeTextPolicies({ measurerFactory: factory })

        policies.measurerFactory!('F', 16).measure('abc')
        policies.measurerFactory!('F', 16).measure('abc') // 命中
        expect(count()).toBe(1)

        policies.measurerFactory!('F', 16).measure('abcd') // text 变
        expect(count()).toBe(2)
        policies.measurerFactory!('G', 16).measure('abc') // font 变
        expect(count()).toBe(3)
        policies.measurerFactory!('F', 24).measure('abc') // fontSize 变
        expect(count()).toBe(4)
    })

    it('度量缓存容量界淘汰（maxMeasureEntries）', () => {
        const { factory, count } = countingMeasurerFactory((text) => text.length)
        const policies = memoizeTextPolicies({ measurerFactory: factory }, { maxMeasureEntries: 1 })

        policies.measurerFactory!('F', 16).measure('a')
        policies.measurerFactory!('F', 16).measure('b') // 逐出 'a'
        expect(count()).toBe(2)
        policies.measurerFactory!('F', 16).measure('a') // 重算
        expect(count()).toBe(3)
    })
})
