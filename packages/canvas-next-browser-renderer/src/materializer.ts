/// <reference lib="dom" />

/**
 * 物化状态机（工单 04）：渲染前把图层的资源引用（图片 / 字体 URL）与 QR 内容
 * 准备成可绘资源，状态 pending → done/failed。
 *
 * 红线（图层 setter 禁 I/O 的编辑器延伸）：物化状态只落本状态机的资源切片，永不写
 * graph——切片形状即未来内核 store ui 分支的 `ui.resources`（工单 05+ 建 store 时
 * 由订阅桥接整体替换），物化完成只触发重绘、不产生文档 patch。
 *
 * 缓存键 = sha256(完整引用)（图片/字体取 URL 原串，QR 内容加 `qr:` 命名空间），
 * 修正 PHP ResourceResolver 以 URL basename 作键的同名碰撞旧债。同引用跨图层
 * 去重：状态已有 pending/done 的键不再调度，failed 留待下次 materialize 重试
 * （临时网络故障自愈，与 fonts.ts 的失败不缓存同哲学）。
 *
 * 触发集合：非空引用全部装载。与 PHP 的差异点：PHP 对非 URL 引用"本地路径直接
 * 使用"（ResourceResolver 跳过下载），浏览器无文件系统对位——相对路径就是同源
 * URL，仍需经 Image 装载（工单 03 预载先例）；跨域语义（crossOrigin/代理）只作用
 * 于绝对 http(s) 引用。
 *
 * 跨域：默认图片装载强制 crossOrigin='anonymous'——无 CORS 头的源在物化阶段即
 * 失败（进 failed 态、画失败标识），不留到导出 toBlob 才抛 SecurityError；宿主经
 * `imageProxy` 注入改写（对应 PHP DownloaderInterface 注入语义），错误消息保持
 * 原始引用以便三端对照 PHP `could not get remote file(<url>)`。
 *
 * 触发：宿主在文档变更后调 materialize(doc)（store 建立后由 doc patch 订阅驱动）。
 * 导出前的 pending 排空闸归工单 13。
 */
import { forEachLayerBox, qrImageSrc } from '@hankchen/canvas-next'
import type { Canvas as CanvasDoc, Layer } from '@hankchen/canvas-next'

import { type Canvas2DBackend, type DrawableImage } from './canvas2d-backend'
import { isBuiltinFontRef, loadCanvasFont } from './fonts'
import { qrDataUrl } from './qr'
import { sha256Hex } from './sha256'

export type ResourceStatus = 'pending' | 'done' | 'failed'

/** 单条资源状态；error 仅 failed 时携带（加载器的错误消息） */
export interface ResourceEntry {
    readonly status: ResourceStatus
    readonly error?: string
}

/** 资源状态切片：key = 资源缓存键。整体替换语义，直接对接未来 store 的 ui 分支 */
export type ResourceState = Readonly<Record<string, ResourceEntry>>

/** 缓存键：sha256(完整引用)——不继承 PHP basename 旧债（同名不同 URL 不碰撞） */
export const imageResourceKey = (src: string): string => sha256Hex(src)
export const fontResourceKey = (font: string): string => sha256Hex(font)
/** QR 内容加命名空间后散列：内容恰为 URL 的 QR 与图片键域隔离 */
export const qrResourceKey = (value: string): string => sha256Hex(`qr:${value}`)

/**
 * 跨域代理注入点（对应 PHP DownloaderInterface）：把 http(s) 资源 URL 改写为代理
 * URL。data:/相对路径不经代理（本就同源/内联）。未配置时原样通过。
 */
export function withImageProxy(
    url: string,
    proxy: ((url: string) => string) | undefined,
): string {
    if (!proxy || !/^https?:\/\//i.test(url)) return url
    return proxy(url)
}

/** 三类资源的装载器（注入缝）：测试注桩，宿主可替换缓存/代理策略 */
export interface ResourceLoaders {
    /** 图片 URL → 可绘制源（默认：Image + crossOrigin=anonymous + 可选代理） */
    readonly loadImage: (url: string) => Promise<DrawableImage>
    /** 字体 URL → ctx.font 可用的族名（默认：loadCanvasFont 的 FontFace 注册） */
    readonly loadFont: (font: string) => Promise<string>
    /** QR 内容 → 可绘制源（默认：固定选项生成 PNG dataURL 后经 Image 装载） */
    readonly loadQr: (value: string) => Promise<DrawableImage>
}

export interface MaterializerOptions {
    /** 覆盖默认浏览器装载器（Node 测试注桩 / 宿主自定义） */
    readonly loaders?: ResourceLoaders
    /** 跨域代理注入点：默认图片装载器把 http(s) 引用改写为代理 URL */
    readonly imageProxy?: (url: string) => string
    /** 同时在途的装载上限（默认 6） */
    readonly concurrency?: number
}

interface ResourceRef {
    readonly key: string
    readonly kind: 'image' | 'font' | 'qr'
    readonly ref: string
}

/**
 * 图层 → 资源引用的唯一分派（物化收集与覆盖层标识共用）：
 * 图片取非空 src、字体取非内置引用（空串/纯数字 = 渲染端内置默认）、QR 取非空内容。
 * 无资源引用的图层返回 null。
 */
export function resourceRefOf(layer: Layer): ResourceRef | null {
    if (layer.type === 'ImageLayer' && layer.src !== null) {
        return { key: imageResourceKey(layer.src), kind: 'image', ref: layer.src }
    }
    if (layer.type === 'TextLayer' && !isBuiltinFontRef(layer.font)) {
        return { key: fontResourceKey(layer.font), kind: 'font', ref: layer.font }
    }
    if (layer.type === 'QrCodeLayer' && layer.value !== '') {
        return { key: qrResourceKey(layer.value), kind: 'qr', ref: layer.value }
    }
    return null
}

const DEFAULT_CONCURRENCY = 6

export class Materializer {
    private readonly backend: Canvas2DBackend
    private readonly loaders: ResourceLoaders
    private readonly maxConcurrent: number

    private readonly entries = new Map<string, ResourceEntry>()
    private readonly listeners = new Set<(state: ResourceState) => void>()
    private readonly settleResolvers: Array<(state: ResourceState) => void> = []
    private readonly queue: ResourceRef[] = []
    private active = 0

    constructor(backend: Canvas2DBackend, options: MaterializerOptions = {}) {
        this.backend = backend
        this.loaders = options.loaders ?? createBrowserLoaders({ imageProxy: options.imageProxy })
        this.maxConcurrent = Math.max(options.concurrency ?? DEFAULT_CONCURRENCY, 1)
    }

    /** 资源状态快照（ui.resources 切片；每次变更整体替换，不可变） */
    get state(): ResourceState {
        return Object.fromEntries(this.entries)
    }

    /** 在途装载条数（playground 提示/将来导出闸消费） */
    get pendingCount(): number {
        let count = 0
        for (const entry of this.entries.values()) {
            if (entry.status === 'pending') count++
        }
        return count
    }

    /**
     * 扫描文档收集资源引用（含表格下钻，复用渲染模板的同一遍历），调度未决资源。
     * 幂等：pending/done 的键跳过（同 URL 跨图层只物化一次），failed 重新调度。
     */
    materialize(doc: CanvasDoc): void {
        const collected = new Map<string, ResourceRef>()
        forEachLayerBox(doc, (layer) => {
            const ref = resourceRefOf(layer)
            // 本轮去重 + 已决跳过（failed 可重试）
            if (ref === null || collected.has(ref.key)) return
            const existing = this.entries.get(ref.key)
            if (!existing || existing.status === 'failed') {
                collected.set(ref.key, ref)
            }
        })

        if (collected.size === 0) return

        for (const ref of collected.values()) {
            this.entries.set(ref.key, { status: 'pending' })
            this.queue.push(ref)
        }
        this.notify()
        this.pump()
    }

    /** 订阅状态变更（整体快照推送）；返回退订函数 */
    subscribe(listener: (state: ResourceState) => void): () => void {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
    }

    /**
     * 全量物化排空闸（工单 13，PNG 导出前置）：在途装载全部落定后 resolve，
     * 携带终态快照（failed 不算在途——预览语义按占位出图，宿主可据快照提示）。
     * 闸在 pending 首次归零时收口：其后新调度的装载归下一次 await 覆盖。
     */
    whenSettled(): Promise<ResourceState> {
        if (this.pendingCount === 0) return Promise.resolve(this.state)
        return new Promise((resolve) => {
            this.settleResolvers.push(resolve)
        })
    }

    private notify(): void {
        const state = this.state
        for (const listener of this.listeners) listener(state)
        if (this.pendingCount === 0 && this.settleResolvers.length > 0) {
            const resolvers = this.settleResolvers.splice(0)
            for (const resolve of resolvers) resolve(state)
        }
    }

    /** 并发上限内的队列泵：完成一个补位一个 */
    private pump(): void {
        while (this.active < this.maxConcurrent && this.queue.length > 0) {
            const ref = this.queue.shift()!
            this.active++
            void this.load(ref).finally(() => {
                this.active--
                this.pump()
            })
        }
    }

    private async load(ref: ResourceRef): Promise<void> {
        try {
            if (ref.kind === 'font') {
                this.backend.setFontFamily(ref.ref, await this.loaders.loadFont(ref.ref))
            } else if (ref.kind === 'qr') {
                this.backend.setImage(qrImageSrc(ref.ref), await this.loaders.loadQr(ref.ref))
            } else {
                this.backend.setImage(ref.ref, await this.loaders.loadImage(ref.ref))
            }
            this.entries.set(ref.key, { status: 'done' })
        } catch (error) {
            this.entries.set(ref.key, {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
            })
        }
        this.notify()
    }
}

/** 默认浏览器装载器：图片经 Image + crossOrigin（代理注入点），字体经 FontFace */
export function createBrowserLoaders(
    options: { imageProxy?: (url: string) => string } = {},
): ResourceLoaders {
    return {
        // 错误消息用原始引用（三端对照 PHP 消息格式），代理 URL 只用于装载
        loadImage: (url) => loadImageElement(withImageProxy(url, options.imageProxy), url),
        loadFont: (font) => loadCanvasFont(font),
        loadQr: async (value) => loadImageElement(await qrDataUrl(value), `qr:${value}`),
    }
}

/**
 * 图片装载：crossOrigin='anonymous' 物化期即暴露跨域失败（污染画布的 toBlob
 * SecurityError 不留到导出）。失败消息用调用方的原始引用（PHP `could not get
 * remote file(<url>)` 同格式，方便三端对照），不掺代理改写后的装载地址。
 */
function loadImageElement(src: string, ref: string): Promise<DrawableImage> {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.onerror = () => reject(new Error(`could not get remote file(${ref})`))
        image.onload = () => resolve(image)
        image.src = src
    })
}
