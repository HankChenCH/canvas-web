import { describe, expect, it, vi } from 'vitest'

import { renderCanvas, type Canvas, type RenderBackend } from '@hankchen/canvas'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { baseImageLayer, textLayer } from '../support/fixtures'

/** 同步手动调度器：测试里不真正驱动重绘，只让会话可构造 */
const nullScheduler: FrameScheduler = () => () => {}

const docWith = (layers: Canvas['layers'], background: Canvas['background'] = null): Canvas => ({
    width: 800,
    height: 600,
    background,
    layers,
})

function makeEditor(doc: Canvas): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument(doc)
    return editor
}

const contentLayer = () => textLayer({ priority: 20, position: { anchor: 'top-left', x: 40, y: 40 } })

/** 录制渲染模板的绘制调用（视觉不变断言用）：调用序列即呈现产物代理 */
function recordingBackend(): RenderBackend & { calls: string[] } {
    const calls: string[] = []
    return {
        calls,
        begin(width: number, height: number): void {
            calls.push(`begin:${width}x${height}`)
        },
        end(): void {
            calls.push('end')
        },
        drawRect(x, y, width, height, bgColor, border): void {
            // 无色无边框的盒绘制是视觉空操作（渲染后端同语义），不计入呈现序列
            const bordered = Object.values(border).some((side) => side !== null)
            if (bgColor === null && !bordered) return
            calls.push(`rect:${x},${y},${width},${height},${bgColor ?? ''}`)
        },
        drawImage(src, x, y, width, height): void {
            calls.push(`image:${src}:${x},${y},${width},${height}`)
        },
        drawText(line, x, y): void {
            calls.push(`text:${line}:${x},${y}`)
        },
    }
}

describe('baseImageConversionBlock：底图转换查询（canvas-background 工单 05）', () => {
    it('条件内（头根图片层覆盖画布）= null 可转换', () => {
        const editor = makeEditor(docWith([baseImageLayer(), contentLayer()]))
        expect(editor.baseImageConversionBlock(['layers', 0])).toBeNull()
    })

    it('非数组头（非垫底层）= not-head-root', () => {
        const editor = makeEditor(docWith([contentLayer(), baseImageLayer({ priority: 0 })]))
        expect(editor.baseImageConversionBlock(['layers', 1])).toBe('not-head-root')
    })

    it('头根非图片层 = not-image', () => {
        const editor = makeEditor(docWith([textLayer({ shape: { width: 800, height: 600 } })]))
        expect(editor.baseImageConversionBlock(['layers', 0])).toBe('not-image')
    })

    it('头根图片层未覆盖画布 = not-covering（负溢出照算同豁免判定）', () => {
        const editor = makeEditor(
            docWith([baseImageLayer({ shape: { width: 799, height: 600 } }), contentLayer()]),
        )
        expect(editor.baseImageConversionBlock(['layers', 0])).toBe('not-covering')
    })

    it('隐藏头根图片层 = hidden（背景无显隐面，转换必改画布视觉）', () => {
        const editor = makeEditor(docWith([baseImageLayer({ visible: false }), contentLayer()]))
        expect(editor.baseImageConversionBlock(['layers', 0])).toBe('hidden')
    })

    it('表达式标记底图 = expression-marked（数据驱动底图不迁移）', () => {
        const editor = makeEditor(
            docWith([baseImageLayer({ expression: '{{row.cover}}', src: '{{row.cover}}' }), contentLayer()]),
        )
        expect(editor.baseImageConversionBlock(['layers', 0])).toBe('expression-marked')
    })

    it('无图引用（纯色底形态）= no-image-src', () => {
        const editor = makeEditor(docWith([baseImageLayer({ src: null }), contentLayer()]))
        expect(editor.baseImageConversionBlock(['layers', 0])).toBe('no-image-src')
    })

    it('锁定子树 = locked（ui 分支读取口，query 与动作同门）', () => {
        const editor = makeEditor(docWith([baseImageLayer(), contentLayer()]))
        editor.toggleLayerLock(['layers', 0])
        expect(editor.baseImageConversionBlock(['layers', 0])).toBe('locked')
    })

    it('无文档/无路径 = not-head-root', () => {
        // 从未开档的会话：doc 为 null 的防御分支
        const empty = new EditorSession({ scheduleFrame: nullScheduler })
        expect(empty.baseImageConversionBlock(['layers', 0])).toBe('not-head-root')
        const editor = makeEditor(docWith([baseImageLayer()]))
        expect(editor.baseImageConversionBlock(null)).toBe('not-head-root')
    })
})

describe('convertSelectionToBackground：底图转换动作（一步历史，canvas-background 工单 05）', () => {
    it('条件内转换：图片引用写入背景 + 图层删除，一步历史', () => {
        const editor = makeEditor(docWith([baseImageLayer(), contentLayer()]))
        editor.setSelection(['layers', 0])
        const listener = vi.fn()
        editor.subscribe(listener)

        expect(editor.convertSelectionToBackground()).toBe(true)

        const doc = editor.store.doc!
        expect(doc.layers).toHaveLength(1)
        expect(doc.layers[0]!.type).toBe('TextLayer')
        expect(doc.background).toEqual({ color: null, image: '/bg.png' })
        expect(editor.store.history).toHaveLength(1)
        // 两段通知 = 文档事务 + 选择清空（ui 分支），deleteLayer 同款通知形态
        expect(listener).toHaveBeenCalledTimes(2)
        // 选中层被删除：选择落地清空（remapPathSlices 同门）
        expect(editor.store.ui.selection).toBeNull()
    })

    it('画布既有背景色保留：转换只写 image 分量（先色后图语义不破）', () => {
        const editor = makeEditor(docWith([baseImageLayer(), contentLayer()], { color: '#ffffff', image: null }))
        editor.setSelection(['layers', 0])

        editor.convertSelectionToBackground()

        expect(editor.store.doc!.background).toEqual({ color: '#ffffff', image: '/bg.png' })
    })

    it('一步撤销完整还原：背景与图层都回来', () => {
        const editor = makeEditor(docWith([baseImageLayer(), contentLayer()], { color: '#ffffff', image: null }))
        editor.setSelection(['layers', 0])
        editor.convertSelectionToBackground()

        editor.undo()

        const doc = editor.store.doc!
        expect(doc.layers).toHaveLength(2)
        expect(doc.layers[0]!.type).toBe('ImageLayer')
        expect(doc.layers[0]!.type === 'ImageLayer' && doc.layers[0]!.src).toBe('/bg.png')
        expect(doc.background).toEqual({ color: '#ffffff', image: null })
    })

    it('转换后渲染视觉不变：绘制调用序列（视觉有效调用）与转换前一致', () => {
        const doc = docWith([baseImageLayer(), contentLayer()])
        const before = recordingBackend()
        renderCanvas(doc, before)

        const editor = makeEditor(doc)
        editor.setSelection(['layers', 0])
        editor.convertSelectionToBackground()
        const after = recordingBackend()
        renderCanvas(editor.store.doc!, after)

        expect(after.calls).toEqual(before.calls)
    })

    it('条件外一律空转：无历史步、图层背景原样', () => {
        // 非数组头图片层
        const notHead = makeEditor(docWith([contentLayer(), baseImageLayer({ priority: 0 })]))
        notHead.setSelection(['layers', 1])
        // 头根非图片层
        const notImage = makeEditor(docWith([textLayer({ shape: { width: 800, height: 600 } })]))
        notImage.setSelection(['layers', 0])
        // 头根图片层未覆盖画布
        const notCovering = makeEditor(docWith([baseImageLayer({ shape: { width: 400, height: 300 } })]))
        notCovering.setSelection(['layers', 0])
        // 隐藏头根图片层
        const hidden = makeEditor(docWith([baseImageLayer({ visible: false })]))
        hidden.setSelection(['layers', 0])
        // 表达式标记底图
        const marked = makeEditor(docWith([baseImageLayer({ expression: '{{row.cover}}', src: '{{row.cover}}' })]))
        marked.setSelection(['layers', 0])
        // 无图引用
        const noSrc = makeEditor(docWith([baseImageLayer({ src: null })]))
        noSrc.setSelection(['layers', 0])
        // 锁定头根图片层
        const locked = makeEditor(docWith([baseImageLayer()]))
        locked.setSelection(['layers', 0])
        locked.toggleLayerLock(['layers', 0])
        // 无选择
        const noSelection = makeEditor(docWith([baseImageLayer()]))

        for (const editor of [notHead, notImage, notCovering, hidden, marked, noSrc, locked, noSelection]) {
            expect(editor.convertSelectionToBackground()).toBe(false)
            expect(editor.store.history).toHaveLength(0)
        }
        expect(notHead.store.doc!.layers).toHaveLength(2)
        expect(marked.store.doc!.layers[0]!.type === 'ImageLayer' && marked.store.doc!.layers[0]!.expression).toBe(
            '{{row.cover}}',
        )
        expect(locked.store.doc!.layers).toHaveLength(1)
    })

    it('重复调用幂等：转换后选择清空，再调不可转换', () => {
        const editor = makeEditor(docWith([baseImageLayer()]))
        editor.setSelection(['layers', 0])
        editor.convertSelectionToBackground()

        expect(editor.convertSelectionToBackground()).toBe(false)
        expect(editor.store.history).toHaveLength(1)
    })
})

describe('baseImageAt：底图右键命中解析（豁免的命中缝，canvas-background 工单 05）', () => {
    it('点落在头根覆盖图片层内 = 解析出该层（正常命中面拿不到它）', () => {
        const editor = makeEditor(docWith([baseImageLayer(), contentLayer()]))
        expect(editor.baseImageAt(100, 100)).toEqual(['layers', 0])
    })

    it('正常命中优先的语义不受影响：内容层照常可点选，底图自身盒照旧不可命中（豁免保留不动）', () => {
        const editor = makeEditor(docWith([baseImageLayer(), contentLayer()]))
        // 内容层（数组尾，视觉上层）点选照旧
        expect(editor.selectAt(45, 45)).toEqual(['layers', 1])
        // 底图自身盒区域（右下空白处）照旧穿透不命中——selectAt 未中清空选择
        expect(editor.selectAt(700, 500)).toBeNull()
        expect(editor.store.ui.selection).toBeNull()
    })

    it('未覆盖画布的头根图片层不参与解析（非转换候选）', () => {
        const editor = makeEditor(docWith([baseImageLayer({ shape: { width: 400, height: 300 } })]))
        expect(editor.baseImageAt(100, 100)).toBeNull()
    })

    it('隐藏与锁定的头根图片层不参与解析', () => {
        const hidden = makeEditor(docWith([baseImageLayer({ visible: false })]))
        expect(hidden.baseImageAt(100, 100)).toBeNull()
        const locked = makeEditor(docWith([baseImageLayer()]))
        locked.toggleLayerLock(['layers', 0])
        expect(locked.baseImageAt(100, 100)).toBeNull()
    })

    it('表达式标记底图照常解析（菜单要能选中它置灰说明）', () => {
        const editor = makeEditor(docWith([baseImageLayer({ expression: '{{row.cover}}', src: '{{row.cover}}' })]))
        expect(editor.baseImageAt(100, 100)).toEqual(['layers', 0])
    })
})
