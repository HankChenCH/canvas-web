/// <reference lib="dom" />

/**
 * 预览 PNG 导出（工单 13，ADR 0004）：浏览器 Canvas2D 的导出只作**预览/快速
 * 分享**，终图由服务端渲染端依据 graph JSON 权威产出——出图带预览语义标注
 * （PNG tEXt 元数据；界面提示与文件名后缀归宿主），不得当作生产输出。
 *
 * 全幅语义：离屏画布 = 文档像素（可选 scale 倍率），恒等变换渲染（不经预览
 * 视口）；资源沿用编辑面后端的物化结果（forkWith 复制注册，不重新装载）。
 * 调用方须先等待物化排空（Materializer.whenSettled），慢资源才有完整呈现。
 */
import { renderCanvas, type Canvas, type TextLayoutPolicies } from '@hankchen/canvas-next'

import { type Canvas2DBackend } from './canvas2d-backend'
import { insertPngTextChunk } from './png'

export interface PreviewPngOptions {
    /** 输出倍率（相对文档像素；缺省 1 = 文档像素 1:1） */
    readonly scale?: number
    /** 文本布局策略：与编辑会话同一注入值，导出与预览的断行/盒高才一致 */
    readonly textPolicies?: TextLayoutPolicies
}

export interface PreviewPngResult {
    /** PNG blob（已注入预览语义 tEXt） */
    readonly blob: Blob
    /** 输出像素尺寸 */
    readonly width: number
    readonly height: number
}

/** 预览语义标注（tEXt 域只收 Latin-1，用 ASCII；中文标注由界面/文件名承担） */
export const PREVIEW_TEXT_KEYWORD = 'CanvasNext'
export const PREVIEW_TEXT_VALUE = 'preview render, not the final image (final = server-side render of the graph JSON)'

/**
 * 渲染当前文档为预览 PNG：离屏 canvas 全幅渲染 → toBlob → 注入 tEXt 标注。
 * 抛错时文档与编辑面不受影响（导出面独立，fork 不回写编辑面后端）。
 */
export async function exportPreviewPng(
    doc: Canvas,
    sourceBackend: Canvas2DBackend,
    options: PreviewPngOptions = {},
): Promise<PreviewPngResult> {
    const scale = options.scale ?? 1
    const width = Math.max(1, Math.round(doc.width * scale))
    const height = Math.max(1, Math.round(doc.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建导出画布（2D 上下文不可用）')

    renderCanvas(doc, sourceBackend.forkWith(ctx), options.textPolicies)
    const blob = await toPngBlob(canvas)
    const bytes = await blob.arrayBuffer()
    const annotated = insertPngTextChunk(
        new Uint8Array(bytes),
        PREVIEW_TEXT_KEYWORD,
        PREVIEW_TEXT_VALUE,
    )
    return { blob: new Blob([annotated], { type: 'image/png' }), width, height }
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob)
            else reject(new Error('PNG 导出失败（toBlob 返回空）'))
        }, 'image/png')
    })
}
