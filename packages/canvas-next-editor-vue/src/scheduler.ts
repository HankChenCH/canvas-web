/**
 * rAF 帧调度器（绑定层注入物）：把 window.requestAnimationFrame 包装成内核
 * FrameScheduler 形状（返回取消函数）。内核自身无 DOM，合帧语义在内核、
 * 帧源在绑定层（impl 研究文档 §2.1 的职责切分）。
 */
import type { FrameScheduler } from '@hankchen/canvas-next-editor'

export function createRafScheduler(): FrameScheduler {
    return (callback) => {
        const handle = window.requestAnimationFrame(() => callback())
        return () => window.cancelAnimationFrame(handle)
    }
}
