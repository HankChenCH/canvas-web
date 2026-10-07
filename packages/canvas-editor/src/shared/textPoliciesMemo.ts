/**
 * 文本布局策略的 memo 包装（canvas-web-render-perf 工单 02）：把注入缝的
 * TextLayoutPolicies（断行器 + 度量器工厂）包上引用级缓存——全画布重绘对未变图层
 * 反复求布局（textLines 断行 / layerWidth 自然宽逐段度量）是逐键开销链的大头，
 * immer 结构共享保证未变图层的 (text, width, font, fontSize) 键稳定命中，逐键只
 * 重算被编辑的那一层。
 *
 * 键域与缓存：
 * - 断行：font \0 fontSize \0 width \0 text → 行数组（同键同引用返回）；
 * - 度量：font \0 fontSize \u0000 text → 宽（measure 纯函数，键即输入）。
 * 两缓存均 LRU（命中重插刷新位次），容量有界（缺省 512 / 2048，可配）——被编辑层
 * 的历史键随容量上限自然淘汰，长会话不无界增长。
 *
 * 缺省分量回落 core 缺省实现并同样被 memo（断行 = createUax14LineBreaker()、度量 =
 * heuristicMeasurerFactory）——宿主只注入 measureText 工厂时（playground 先例）断行
 * 缓存照样生效。核心包（canvas）零改动：本模块纯包装注入缝，语义与未包装完全
 * 一致（wire 零变化，Go/PHP 不跟进）。
 *
 * 上下文传递：断行器签名 (text, width, measurer) 不见 font/fontSize——本包装的
 * wrappedFactory 求值时把 (font, fontSize) 记进闭包上下文，wrappedBreaker 用它组键；
 * 布局消费恒为「先 factory 后 breaker」的同同步序列（layout.ts textLines/layerWidth），
 * 上下文读取因此总对应当前图层。
 */
import {
    createUax14LineBreaker,
    heuristicMeasurerFactory,
    type LineBreaker,
    type TextLayoutPolicies,
    type TextMeasurerFactory,
} from '@hankchen/canvas'

export interface MemoTextPoliciesOptions {
    /** 断行缓存容量（键数），缺省 512 */
    readonly maxLineEntries?: number
    /** 度量缓存容量（键数），缺省 2048 */
    readonly maxMeasureEntries?: number
}

const DEFAULT_LINE_ENTRIES = 512
const DEFAULT_MEASURE_ENTRIES = 2048

/** LRU 缓存：命中重插刷新位次，超容逐最旧（Map 插入序即位次） */
class LruCache<V> {
    private readonly entries = new Map<string, V>()
    constructor(private readonly capacity: number) {}

    get(key: string): V | undefined {
        const hit = this.entries.get(key)
        if (hit !== undefined) {
            this.entries.delete(key)
            this.entries.set(key, hit)
        }
        return hit
    }

    put(key: string, value: V): void {
        if (this.entries.size >= this.capacity) {
            const oldest = this.entries.keys().next().value
            if (oldest !== undefined) this.entries.delete(oldest)
        }
        this.entries.set(key, value)
    }
}

export function memoizeTextPolicies(
    policies: TextLayoutPolicies = {},
    options: MemoTextPoliciesOptions = {},
): TextLayoutPolicies {
    const linesCache = new LruCache<string[]>(options.maxLineEntries ?? DEFAULT_LINE_ENTRIES)
    const measureCache = new LruCache<number>(options.maxMeasureEntries ?? DEFAULT_MEASURE_ENTRIES)
    // 当前 (font, fontSize) 上下文：wrappedFactory 求值时刷新，wrappedBreaker 组键消费
    let context = { font: '', fontSize: 0 }

    const measureMemoFactory: TextMeasurerFactory = (font, fontSize) => {
        context = { font, fontSize }
        const base = (policies.measurerFactory ?? heuristicMeasurerFactory)(font, fontSize)
        return {
            measure(text: string): number {
                const key = `${font}\u0000${fontSize}\u0000${text}`
                const hit = measureCache.get(key)
                if (hit !== undefined) return hit
                const width = base.measure(text)
                measureCache.put(key, width)
                return width
            },
        }
    }

    const lineBreakerMemo: LineBreaker = (text, width, measurer) => {
        const key = `${context.font}\u0000${context.fontSize}\u0000${width}\u0000${text}`
        const hit = linesCache.get(key)
        if (hit !== undefined) return hit
        const lines = (policies.lineBreaker ?? createUax14LineBreaker())(text, width, measurer)
        linesCache.put(key, lines)
        return lines
    }

    return { lineBreaker: lineBreakerMemo, measurerFactory: measureMemoFactory }
}
