/**
 * headless 编辑器内核的 observable store（工单 05 起步形态）。
 *
 * - doc 分支：解码后的领域画布（@hankchen/canvas-next 的 Canvas），唯一事实源。
 *   工单 05 只做整体替换打开；immer produceWithPatches 事务管线在工单 06/08 落地。
 * - ui 分支：视口/选择/工具等易变状态，整体替换、**永不进历史**（红线 3 的
 *   编辑器延伸：物化等派生状态只住这里，不写文档）。
 * - 通知携带变更位置（scope/branch），绑定层与渲染调度据此细分脏区。
 */
import type { Canvas } from '@hankchen/canvas-next'

import type { Viewport } from './camera'

export interface EditorUi {
    viewport: Viewport
}

export type EditorChange = { scope: 'doc' } | { scope: 'ui'; branch: keyof EditorUi }

type Listener = (change: EditorChange) => void

export class EditorStore {
    private docValue: Canvas | null = null
    private uiValue: EditorUi = { viewport: { x: 0, y: 0, zoom: 1 } }
    private readonly listeners = new Set<Listener>()

    get doc(): Canvas | null {
        return this.docValue
    }

    get ui(): EditorUi {
        return this.uiValue
    }

    /** 打开/替换文档（整体替换；编辑事务进历史的能力由后续工单在写入路径上接管） */
    openDocument(canvas: Canvas): void {
        this.docValue = canvas
        this.notify({ scope: 'doc' })
    }

    /** 视口更新：ui 分支整体替换，旧切片引用保持原值（computed 引用短路依赖此语义） */
    setViewport(viewport: Viewport): void {
        this.uiValue = { ...this.uiValue, viewport }
        this.notify({ scope: 'ui', branch: 'viewport' })
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    private notify(change: EditorChange): void {
        for (const listener of this.listeners) listener(change)
    }
}
