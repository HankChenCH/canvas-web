import { describe, expect, it, vi } from 'vitest'

import { decodeGraph } from '@hankchen/canvas-next'
import type { Canvas as CanvasDoc } from '@hankchen/canvas-next'

import { Canvas2DBackend, type DrawableImage } from '../src/canvas2d-backend'
import {
    Materializer,
    fontResourceKey,
    imageResourceKey,
    qrResourceKey,
    withImageProxy,
} from '../src/materializer'
import type { ResourceLoaders } from '../src/materializer'

/** Node 无 DOM 环境：假 ctx 只录调用（真绘制走点位取样测试与目验） */
function fakeBackend() {
    const { ops, ctx } = recordingCtx()
    return { backend: new Canvas2DBackend(ctx), ops }
}

function recordingCtx() {
    const ops: Array<{ call: string; args: unknown[] }> = []
    const ctx = {
        setTransform: (...args: unknown[]) => ops.push({ call: 'setTransform', args }),
        clearRect: (...args: unknown[]) => ops.push({ call: 'clearRect', args }),
        fillRect: () => {},
        set fillStyle(_v: string) {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        set strokeStyle(_v: string) {},
        set lineWidth(_v: number) {},
        measureText: () => ({ width: 10 }),
        set font(_v: string) {},
        fillText: () => {},
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        rotate: () => {},
    }
    return { ops, ctx: ctx as unknown as CanvasRenderingContext2D }
}

/** 可编程桩加载器：逐键 decide（resolve 值 / reject 错误），并记录调用 */
function stubLoaders(
    decide: (kind: keyof ResourceLoaders, ref: string) => Promise<unknown>,
) {
    const calls: Array<{ kind: keyof ResourceLoaders; ref: string }> = []
    const loaders: ResourceLoaders = {
        loadImage: (url) => {
            calls.push({ kind: 'loadImage', ref: url })
            return decide('loadImage', url) as Promise<{ width: number; height: number }>
        },
        loadFont: (font) => {
            calls.push({ kind: 'loadFont', ref: font })
            return decide('loadFont', font) as Promise<string>
        },
        loadQr: (value) => {
            calls.push({ kind: 'loadQr', ref: value })
            return decide('loadQr', value) as Promise<{ width: number; height: number }>
        },
    }
    return { loaders, calls }
}

/** 微任务排空：桩加载器全部以已决 Promise 返回时，一轮 await 后状态机应已收敛 */
async function flush(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
}

function imageDoc(srcs: string[]): CanvasDoc {
    return decodeGraph({
        canvas: { width: 100, height: 100 },
        layers: srcs.map((src) => ({
            type: 'ImageLayer',
            spec: { shape: { width: 10, height: 10 } },
            data: { value: src },
        })),
    })
}

describe('Materializer：三类物化状态机 pending → done/failed', () => {
    it('图片/字体/QR 各经 pending 到 done，并按各自键回写后端', async () => {
        const { backend } = fakeBackend()
        const setImage = vi.spyOn(backend, 'setImage')
        const setFontFamily = vi.spyOn(backend, 'setFontFamily')
        const { loaders, calls } = stubLoaders(async (kind, ref) => {
            if (kind === 'loadFont') return `family-${ref}`
            return { width: 8, height: 8 }
        })
        const m = new Materializer(backend, { loaders })

        const doc = decodeGraph({
            canvas: { width: 100, height: 100 },
            layers: [
                { type: 'ImageLayer', spec: { shape: { width: 10, height: 10 } }, data: { value: 'https://cdn.example.com/a.png' } },
                { type: 'TextLayer', spec: { shape: { width: 10, height: 10 }, fontFamily: { font: 'https://fonts.example.com/f.ttf', fontSize: 12 } }, data: { value: '文' } },
                { type: 'QrCodeLayer', spec: { shape: { width: 10, height: 10 } }, data: { value: 'https://example.com/join' } },
            ],
        })
        m.materialize(doc)

        // 同步先落 pending（占位框语义可立即渲染）
        expect(m.state[imageResourceKey('https://cdn.example.com/a.png')]).toEqual({ status: 'pending' })
        expect(m.pendingCount).toBe(3)

        await flush()

        expect(m.state).toEqual({
            [imageResourceKey('https://cdn.example.com/a.png')]: { status: 'done' },
            [fontResourceKey('https://fonts.example.com/f.ttf')]: { status: 'done' },
            [qrResourceKey('https://example.com/join')]: { status: 'done' },
        })
        expect(m.pendingCount).toBe(0)
        // 回写面：图片/QR 进 images（QR 用 qr: 前缀键），字体进 fontFamilies
        expect(setImage).toHaveBeenCalledWith('https://cdn.example.com/a.png', { width: 8, height: 8 })
        expect(setImage).toHaveBeenCalledWith('qr:https://example.com/join', { width: 8, height: 8 })
        expect(setFontFamily).toHaveBeenCalledWith('https://fonts.example.com/f.ttf', 'family-https://fonts.example.com/f.ttf')
        expect(calls.map(({ kind, ref }) => `${kind}:${ref}`)).toEqual([
            'loadImage:https://cdn.example.com/a.png',
            'loadFont:https://fonts.example.com/f.ttf',
            'loadQr:https://example.com/join',
        ])
    })

    it('加载失败落 failed 并携带错误信息，不回写后端（保持占位）', async () => {
        const { backend } = fakeBackend()
        const setImage = vi.spyOn(backend, 'setImage')
        const { loaders } = stubLoaders(async () => {
            throw new Error('could not get remote file(https://cdn.example.com/404.png)')
        })
        const m = new Materializer(backend, { loaders })
        m.materialize(imageDoc(['https://cdn.example.com/404.png']))
        await flush()

        expect(m.state[imageResourceKey('https://cdn.example.com/404.png')]).toEqual({
            status: 'failed',
            error: 'could not get remote file(https://cdn.example.com/404.png)',
        })
        expect(setImage).not.toHaveBeenCalled()
    })

    it('failed 再物化可重试（临时网络故障自愈），done/pending 恒不重发', async () => {
        const { backend } = fakeBackend()
        let attempts = 0
        const { loaders, calls } = stubLoaders(async () => {
            attempts++
            if (attempts === 1) throw new Error('网络抖动')
            return { width: 4, height: 4 }
        })
        const m = new Materializer(backend, { loaders })
        const doc = imageDoc(['https://cdn.example.com/a.png'])

        m.materialize(doc)
        await flush()
        expect(m.state[imageResourceKey('https://cdn.example.com/a.png')]?.status).toBe('failed')

        m.materialize(doc) // 重试：failed 重新调度
        expect(m.pendingCount).toBe(1)
        await flush()
        expect(m.state[imageResourceKey('https://cdn.example.com/a.png')]).toEqual({ status: 'done' })
        expect(calls).toHaveLength(2)

        m.materialize(doc) // done：不再重发
        expect(calls).toHaveLength(2)
    })
})

describe('Materializer：同引用去重', () => {
    it('同 URL 跨图层只物化一次', async () => {
        const { backend } = fakeBackend()
        const { loaders, calls } = stubLoaders(async () => ({ width: 4, height: 4 }))
        const m = new Materializer(backend, { loaders })

        m.materialize(imageDoc([
            'https://cdn.example.com/same.png',
            'https://cdn.example.com/same.png',
            'https://cdn.example.com/other.png',
        ]))
        await flush()

        expect(calls.filter(({ kind }) => kind === 'loadImage')).toHaveLength(2)
        expect(Object.keys(m.state)).toHaveLength(2)
    })

    it('QR 同内容跨图层（不同盒宽）只生成一次；空值/内置字体/null src 不进状态', async () => {
        const { backend } = fakeBackend()
        const { loaders, calls } = stubLoaders(async () => ({ width: 4, height: 4 }))
        const m = new Materializer(backend, { loaders })

        const doc = decodeGraph({
            canvas: { width: 200, height: 200 },
            layers: [
                { type: 'QrCodeLayer', spec: { shape: { width: 40, height: 40 } }, data: { value: 'https://example.com' } },
                { type: 'QrCodeLayer', spec: { shape: { width: 80 } }, data: { value: 'https://example.com' } },
                { type: 'QrCodeLayer', spec: { shape: { width: 20, height: 20 } }, data: { value: '' } },
                { type: 'ImageLayer', spec: { shape: { width: 10, height: 10 } } },
                { type: 'TextLayer', spec: { shape: { width: 10, height: 10 }, fontFamily: { font: '3', fontSize: 12 } }, data: { value: '内置字体' } },
            ],
        })
        m.materialize(doc)
        await flush()

        expect(calls).toHaveLength(1)
        expect(calls[0]).toEqual({ kind: 'loadQr', ref: 'https://example.com' })
        expect(Object.keys(m.state)).toEqual([qrResourceKey('https://example.com')])
    })

    it('表格下钻：行/格/格内容层的资源引用都被收集', async () => {
        const { backend } = fakeBackend()
        const { loaders, calls } = stubLoaders(async (kind, ref) =>
            kind === 'loadFont' ? `family-${ref}` : { width: 4, height: 4 },
        )
        const m = new Materializer(backend, { loaders })

        const doc = decodeGraph({
            canvas: { width: 300, height: 100 },
            layers: [{
                type: 'TableLayer',
                spec: { shape: { width: 300, height: 100 } },
                rows: [{
                    type: 'TableRowLayer',
                    spec: { shape: { width: 300, height: 50 } },
                    cells: [
                        { type: 'TableCellLayer', spec: { shape: { width: 150, height: 50 } }, content: { type: 'ImageLayer', spec: { shape: { width: 150, height: 50 } }, data: { value: 'https://cdn.example.com/cell.png' } } },
                        {
                            type: 'TableCellLayer',
                            spec: { shape: { width: 150, height: 50 } },
                            content: { type: 'TextLayer', spec: { shape: { width: 150, height: 50 }, fontFamily: { font: 'https://fonts.example.com/g.woff2', fontSize: 12 } }, data: { value: '格文本' } },
                        },
                    ],
                }],
            }],
        })
        m.materialize(doc)
        await flush()

        expect(calls.map(({ kind, ref }) => `${kind}:${ref}`)).toEqual([
            'loadImage:https://cdn.example.com/cell.png',
            'loadFont:https://fonts.example.com/g.woff2',
        ])
    })
})

describe('Materializer：订阅与 ui 切片', () => {
    it('每次状态变更广播整体快照；退订后不再通知；快照不被后续变更污染', async () => {
        const { backend } = fakeBackend()
        const { loaders } = stubLoaders(async () => ({ width: 4, height: 4 }))
        const m = new Materializer(backend, { loaders })

        const seen: Array<number> = []
        const snapshots: Array<Record<string, unknown>> = []
        const unsubscribe = m.subscribe((state) => {
            seen.push(Object.keys(state).length)
            snapshots.push(state)
        })

        m.materialize(imageDoc(['https://cdn.example.com/a.png']))
        await flush()

        // materialize 落 pending 一次 + done 一次
        expect(seen).toEqual([1, 1])
        const first = snapshots[0]!
        expect(first[imageResourceKey('https://cdn.example.com/a.png')]).toEqual({ status: 'pending' })

        unsubscribe()
        m.materialize(imageDoc(['https://cdn.example.com/b.png']))
        await flush()
        expect(seen).toEqual([1, 1])

        // 旧快照不可变：新资源不写进旧对象（ui 分支整体替换语义）
        expect(Object.keys(first)).toHaveLength(1)
    })
})

describe('Materializer：并发上限与代理注入点', () => {
    it('并发不超过配置上限（默认 6），完成后队列依次补位', async () => {
        const { backend } = fakeBackend()
        let inFlight = 0
        let peak = 0
        const gates: Array<() => void> = []
        const loaders: ResourceLoaders = {
            loadImage: (url) => {
                inFlight++
                peak = Math.max(peak, inFlight)
                return new Promise((resolve, reject) => {
                    gates.push(() => {
                        inFlight--
                        if (url.includes('bad')) reject(new Error('x'))
                        else resolve({ width: 4, height: 4 })
                    })
                })
            },
            loadFont: () => Promise.resolve('family'),
            loadQr: () => Promise.resolve({ width: 4, height: 4 }),
        }
        const m = new Materializer(backend, { loaders, concurrency: 3 })

        m.materialize(imageDoc(['a.png', 'b.png', 'c.png', 'd.png', 'e.png']))
        expect(peak).toBe(3)
        expect(m.pendingCount).toBe(5)

        gates.splice(0).forEach((open) => open())
        await flush()
        expect(peak).toBe(3) // 后两片补位但仍 ≤3
        // 补位片各自在途，放行后收敛
        gates.splice(0).forEach((open) => open())
        await flush()
        expect(m.pendingCount).toBe(0)
    })

    it('withImageProxy：http(s) 引用改写为代理 URL，data:/相对路径原样通过', () => {
        const proxy = (url: string) => `https://proxy.example.com/?url=${encodeURIComponent(url)}`
        expect(withImageProxy('https://remote.example.com/a.png', proxy)).toBe(
            'https://proxy.example.com/?url=https%3A%2F%2Fremote.example.com%2Fa.png',
        )
        expect(withImageProxy('http://remote.example.com/a.png', proxy)).toBe(
            'https://proxy.example.com/?url=http%3A%2F%2Fremote.example.com%2Fa.png',
        )
        expect(withImageProxy('data:image/png;base64,AAAA', proxy)).toBe('data:image/png;base64,AAAA')
        expect(withImageProxy('/local.svg', proxy)).toBe('/local.svg')
        // 未配置代理：原样通过
        expect(withImageProxy('https://remote.example.com/a.png', undefined)).toBe(
            'https://remote.example.com/a.png',
        )
    })
})

describe('Materializer：文档切换的快照剪除（工单 15）', () => {
    it('materialize 剪除当前文档不引用的键；保留键不因剪除重发（无重载循环）', async () => {
        const { backend } = fakeBackend()
        const { loaders, calls } = stubLoaders(async () => ({ width: 4, height: 4 }))
        const m = new Materializer(backend, { loaders })

        m.materialize(imageDoc(['https://cdn.example.com/a.png', 'https://cdn.example.com/dead.png']))
        await flush()
        expect(calls).toHaveLength(2)

        // 切换文档：dead 键剪除，done 的 a 保留
        m.materialize(imageDoc(['https://cdn.example.com/a.png']))
        expect(m.state).toEqual({ [imageResourceKey('https://cdn.example.com/a.png')]: { status: 'done' } })

        // 同文档再物化：a 已 done 不重发（剪除不引发重载循环）
        m.materialize(imageDoc(['https://cdn.example.com/a.png']))
        await flush()
        expect(calls).toHaveLength(2)
    })

    it('装载在途时文档切走（键被剪除）：完成后死键不回写复活', async () => {
        const { backend } = fakeBackend()
        const gates = new Map<string, (image: DrawableImage) => void>()
        const loaders: ResourceLoaders = {
            loadImage: (url) =>
                new Promise<DrawableImage>((resolve) => {
                    gates.set(url, resolve)
                }),
            loadFont: () => Promise.resolve('family'),
            loadQr: () => Promise.resolve({ width: 4, height: 4 }),
        }
        const m = new Materializer(backend, { loaders })
        m.materialize(imageDoc(['https://cdn.example.com/a.png']))
        expect(m.pendingCount).toBe(1)

        // 切换文档：a 在途中被剪除，新文档 b 调度
        m.materialize(imageDoc(['https://cdn.example.com/b.png']))
        expect(m.state[imageResourceKey('https://cdn.example.com/a.png')]).toBeUndefined()
        expect(m.pendingCount).toBe(1)

        gates.get('https://cdn.example.com/a.png')!({ width: 4, height: 4 })
        await flush()
        // 死键不回写：状态里只有 b
        expect(m.state[imageResourceKey('https://cdn.example.com/a.png')]).toBeUndefined()
        expect(m.pendingCount).toBe(1)

        gates.get('https://cdn.example.com/b.png')!({ width: 4, height: 4 })
        await flush()
        expect(m.pendingCount).toBe(0)
        expect(Object.keys(m.state)).toEqual([imageResourceKey('https://cdn.example.com/b.png')])
    })
})

describe('Materializer.whenSettled：全量物化排空闸（工单 13 导出前置）', () => {
    it('无在途装载时立即 resolve（携带当前状态快照）', async () => {
        const { backend } = fakeBackend()
        const { loaders } = stubLoaders(async () => ({ width: 8, height: 8 }))
        const m = new Materializer(backend, { loaders })

        const settled = await m.whenSettled()
        expect(m.pendingCount).toBe(0)
        expect(settled).toEqual({})
    })

    it('在途装载全部落定后 resolve（done/failed 均算落定）', async () => {
        const { backend } = fakeBackend()
        const gates = new Map<string, { resolve: (image: DrawableImage) => void; reject: (error: Error) => void }>()
        const loaders: ResourceLoaders = {
            loadImage: (url) =>
                new Promise<DrawableImage>((resolve, reject) => {
                    gates.set(url, { resolve, reject })
                }),
            loadFont: () => Promise.resolve('family'),
            loadQr: () => Promise.resolve({ width: 4, height: 4 }),
        }
        const m = new Materializer(backend, { loaders })
        m.materialize(imageDoc(['a.png', 'bad.png']))

        let settled = false
        void m.whenSettled().then(() => {
            settled = true
        })
        await flush()
        expect(settled).toBe(false) // 两片仍在途

        gates.get('a.png')!.resolve({ width: 4, height: 4 })
        await flush()
        expect(settled).toBe(false) // bad.png 仍未落定（挂起的不放行）

        gates.get('bad.png')!.reject(new Error('x'))
        await flush()
        expect(settled).toBe(true)
        expect(m.pendingCount).toBe(0)
        expect(m.state[imageResourceKey('bad.png')]?.status).toBe('failed')
    })

    it('闸在首次全量落定时 resolve：其后新调度的装载由下一次 await 覆盖', async () => {
        const { backend } = fakeBackend()
        const gates = new Map<string, (image: DrawableImage) => void>()
        const loaders: ResourceLoaders = {
            loadImage: (url) =>
                new Promise<DrawableImage>((resolve) => {
                    gates.set(url, resolve)
                }),
            loadFont: () => Promise.resolve('family'),
            loadQr: () => Promise.resolve({ width: 4, height: 4 }),
        }
        const m = new Materializer(backend, { loaders })
        m.materialize(imageDoc(['a.png']))

        const waiting = m.whenSettled()
        gates.get('a.png')!({ width: 4, height: 4 })
        await expect(waiting).resolves.toBeDefined()
        // 闸已收口：resolve 后新调度的装载不再阻塞旧 promise（宿主对新物化再次 await）
        m.materialize(imageDoc(['a.png', 'b.png']))
        expect(m.pendingCount).toBe(1)
        await flush()
        gates.get('b.png')!({ width: 4, height: 4 })
        await flush()
        expect(m.pendingCount).toBe(0)
    })
})
