import { describe, expect, it } from 'vitest'

import {
    DEFAULT_ZOOM_BOUNDS,
    clampZoom,
    fitRect,
    fitViewport,
    nextZoomByWheel,
    panBy,
    sceneToScreen,
    screenToScene,
    snapViewportToPhysicalPixels,
    zoomAtPoint,
    type Size,
    type Viewport,
} from '../../src/spatial/camera'

const BOUNDS = DEFAULT_ZOOM_BOUNDS

describe('坐标换算（screen = (scene - cam) * zoom）', () => {
    it('场景→屏幕：1x 无平移为恒等，放大/平移按公式', () => {
        expect(sceneToScreen({ x: 0, y: 0, zoom: 1 }, 120, 80)).toEqual({ x: 120, y: 80 })
        expect(sceneToScreen({ x: 100, y: 50, zoom: 1 }, 120, 80)).toEqual({ x: 20, y: 30 })
        expect(sceneToScreen({ x: 0, y: 0, zoom: 2 }, 120, 80)).toEqual({ x: 240, y: 160 })
        expect(sceneToScreen({ x: 100, y: 50, zoom: 0.5 }, 120, 80)).toEqual({ x: 10, y: 15 })
    })

    it('屏幕→场景为逆变换，任意视口下往返恒等', () => {
        const viewports: Viewport[] = [
            { x: 0, y: 0, zoom: 1 },
            { x: 100, y: -40, zoom: 0.05 },
            { x: -2200.5, y: 960.25, zoom: 8 },
            { x: 33.3, y: 44.4, zoom: 1.35 },
        ]
        for (const viewport of viewports) {
            for (const [sx, sy] of [[0, 0], [17, -3], [1920, 1080]] as const) {
                const scene = screenToScene(viewport, sx, sy)
                const back = sceneToScreen(viewport, scene.x, scene.y)
                expect(back.x).toBeCloseTo(sx, 10)
                expect(back.y).toBeCloseTo(sy, 10)
            }
        }
    })
})

describe('clampZoom（范围可配置，缺省 5%–800%）', () => {
    it('低于下界/高于上界钳位，界内原样', () => {
        expect(clampZoom(0.001, BOUNDS)).toBe(0.05)
        expect(clampZoom(100, BOUNDS)).toBe(8)
        expect(clampZoom(1, BOUNDS)).toBe(1)
        expect(clampZoom(2.5, BOUNDS)).toBe(2.5)
    })

    it('自定义范围生效', () => {
        expect(clampZoom(0.5, { min: 1, max: 2 })).toBe(1)
        expect(clampZoom(4, { min: 1, max: 2 })).toBe(2)
    })
})

describe('panBy（平移增量恒为 cam -= delta / zoom，与缩放无关的速度）', () => {
    it('按 zoom 折算场景位移', () => {
        expect(panBy({ x: 100, y: 50, zoom: 1 }, -30, 20)).toEqual({ x: 130, y: 30, zoom: 1 })
        expect(panBy({ x: 100, y: 50, zoom: 2 }, -30, 20)).toEqual({ x: 115, y: 40, zoom: 2 })
        expect(panBy({ x: 0, y: 0, zoom: 0.5 }, -100, 100)).toEqual({ x: 200, y: -200, zoom: 0.5 })
    })

    it('zoom 不变，原视口对象不被改写', () => {
        const viewport: Viewport = { x: 10, y: 20, zoom: 1.5 }
        const next = panBy(viewport, -10, 10)
        expect(viewport).toEqual({ x: 10, y: 20, zoom: 1.5 })
        expect(next.zoom).toBe(1.5)
    })
})

describe('zoomAtPoint（缩放以指针为中心：指针下的场景点不动）', () => {
    it('缩放前后指针下的场景点恒等', () => {
        const viewport: Viewport = { x: 120, y: 80, zoom: 1 }
        const pointer = { x: 400, y: 300 }
        const before = screenToScene(viewport, pointer.x, pointer.y)
        const next = zoomAtPoint(viewport, pointer.x, pointer.y, 2.5, BOUNDS)
        const after = screenToScene(next, pointer.x, pointer.y)
        expect(after.x).toBeCloseTo(before.x, 10)
        expect(after.y).toBeCloseTo(before.y, 10)
    })

    it('同点同倍率：已知值核对公式 cam\' = scene₀ - screen₀ / zoom\'', () => {
        // scene₀ = (400/1 + 120, 300/1 + 80) = (520, 380)
        const next = zoomAtPoint({ x: 120, y: 80, zoom: 1 }, 400, 300, 4, BOUNDS)
        expect(next.zoom).toBe(4)
        expect(next.x).toBeCloseTo(520 - 400 / 4, 10)
        expect(next.y).toBeCloseTo(380 - 300 / 4, 10)
    })

    it('目标倍率先钳位到范围，锚点关系按钳位后倍率成立', () => {
        const viewport: Viewport = { x: 0, y: 0, zoom: 1 }
        const pointer = { x: 100, y: 100 }
        const before = screenToScene(viewport, pointer.x, pointer.y)
        const next = zoomAtPoint(viewport, pointer.x, pointer.y, 1000, BOUNDS)
        expect(next.zoom).toBe(BOUNDS.max)
        const after = screenToScene(next, pointer.x, pointer.y)
        expect(after.x).toBeCloseTo(before.x, 10)
        expect(after.y).toBeCloseTo(before.y, 10)
    })

    it('倍率不变时相机不动（幂等）', () => {
        const viewport: Viewport = { x: 33, y: -7, zoom: 1.25 }
        expect(zoomAtPoint(viewport, 90, 60, 1.25, BOUNDS)).toEqual(viewport)
    })
})

describe('fitViewport（一键适应画布：整页可见、居中、钳位）', () => {
    it('大画布按 min 比例缩小并居中', () => {
        const canvas: Size = { width: 2400, height: 1500 }
        const surface: Size = { width: 1200, height: 750 }
        const viewport = fitViewport(canvas, surface, BOUNDS, 0)
        expect(viewport.zoom).toBeCloseTo(0.5, 12)
        // 画布中心落在视口中心：scene = screen/zoom + cam
        const center = screenToScene(viewport, 600, 375)
        expect(center.x).toBeCloseTo(1200, 10)
        expect(center.y).toBeCloseTo(750, 10)
    })

    it('宽高分别受约束时取更紧的一侧', () => {
        // 高是紧侧：1200×750 视口放 800×1000 画布 → min(1.5, 0.75) = 0.75
        const viewport = fitViewport({ width: 800, height: 1000 }, { width: 1200, height: 750 }, BOUNDS, 0)
        expect(viewport.zoom).toBeCloseTo(0.75, 12)
    })

    it('margin 内缩可视区域', () => {
        const viewport = fitViewport({ width: 2000, height: 1000 }, { width: 1000, height: 500 }, BOUNDS, 50)
        expect(viewport.zoom).toBeCloseTo(Math.min(900 / 2000, 400 / 1000), 12)
    })

    it('小画布放大到填满（受上界钳位）', () => {
        const viewport = fitViewport({ width: 100, height: 100 }, { width: 1000, height: 1000 }, BOUNDS, 0)
        expect(viewport.zoom).toBe(BOUNDS.max)
        const center = screenToScene(viewport, 500, 500)
        expect(center.x).toBeCloseTo(50, 10)
    })

    it('超大画布 fit 低于交互下界时不钳（整页可见优先于缩放范围）', () => {
        const viewport = fitViewport({ width: 40000, height: 30000 }, { width: 1000, height: 750 }, BOUNDS, 0)
        expect(viewport.zoom).toBeCloseTo(0.025, 12)
        // 画布四角仍在视口内：右上角场景点不超出视口右/上缘
        const bottomRight = sceneToScreen(viewport, 40000, 30000)
        expect(bottomRight.x).toBeCloseTo(1000, 6)
        expect(bottomRight.y).toBeCloseTo(750, 6)
    })

    it('零尺寸画布/视口防御：回落恒等视口', () => {
        expect(fitViewport({ width: 0, height: 100 }, { width: 100, height: 100 }, BOUNDS, 0)).toEqual({
            x: 0,
            y: 0,
            zoom: 1,
        })
        expect(fitViewport({ width: 100, height: 100 }, { width: 0, height: 0 }, BOUNDS, 0)).toEqual({
            x: 0,
            y: 0,
            zoom: 1,
        })
    })
})

describe('fitRect（适应选区：任意场景矩形整块可见、居中；fitViewport 的推广）', () => {
    it('矩形按更紧侧缩放，矩形中心（可为负坐标/溢出画布）落在视口中心', () => {
        const surface: Size = { width: 600, height: 450 }
        const viewport = fitRect({ x: 100, y: 200, width: 300, height: 150 }, surface, BOUNDS, 0)
        expect(viewport.zoom).toBeCloseTo(2, 12)
        const center = screenToScene(viewport, 300, 225)
        expect(center.x).toBeCloseTo(250, 10)
        expect(center.y).toBeCloseTo(275, 10)
        // 四角可见（紧侧贴边：宽是约束侧，竖向居中留边）
        const topLeft = sceneToScreen(viewport, 100, 200)
        expect(topLeft).toEqual({ x: 0, y: 75 })
        const bottomRight = sceneToScreen(viewport, 400, 350)
        expect(bottomRight).toEqual({ x: 600, y: 375 })
    })

    it('margin 内缩与上界钳位沿用 fitViewport 语义', () => {
        const viewport = fitRect({ x: -50, y: -50, width: 100, height: 100 }, { width: 1000, height: 1000 }, BOUNDS, 0)
        expect(viewport.zoom).toBe(BOUNDS.max)
        const center = screenToScene(viewport, 500, 500)
        expect(center.x).toBeCloseTo(0, 10)
    })

    it('退化矩形/视口回落恒等视口', () => {
        expect(fitRect({ x: 10, y: 10, width: 0, height: 50 }, { width: 100, height: 100 }, BOUNDS, 0)).toEqual({ x: 0, y: 0, zoom: 1 })
    })
})

describe('snapViewportToPhysicalPixels（相机平移对齐物理像素，呈现清晰）', () => {
    it('cam * zoom * dpr 取整，zoom 不动', () => {
        const snapped = snapViewportToPhysicalPixels({ x: 100.037, y: -50.012, zoom: 1.3 }, 2)
        expect(snapped.zoom).toBe(1.3)
        expect(snapped.x * 1.3 * 2).toBeCloseTo(Math.round(100.037 * 1.3 * 2), 10)
        expect(snapped.y * 1.3 * 2).toBeCloseTo(Math.round(-50.012 * 1.3 * 2), 10)
    })

    it('dpr=1 且整数视口时不改变', () => {
        const viewport: Viewport = { x: 12, y: -8, zoom: 1 }
        expect(snapViewportToPhysicalPixels(viewport, 1)).toEqual(viewport)
    })
})

describe('nextZoomByWheel（滚轮/捏合下一档缩放，excalidraw 同式加性曲线）', () => {
    it('deltaY=0 不动', () => {
        expect(nextZoomByWheel(1.25, 0, BOUNDS)).toBe(1.25)
    })

    it('一个滚轮档（|Δ|=100）在 100% 处步进 0.1，向上放大、向下缩小', () => {
        expect(nextZoomByWheel(1, -100, BOUNDS)).toBeCloseTo(1.1, 12)
        expect(nextZoomByWheel(1, 100, BOUNDS)).toBeCloseTo(0.9, 12)
    })

    it('大 delta 钳位为单档步长（ZOOM_STEP*100），不做过冲跳变', () => {
        expect(nextZoomByWheel(1, -10000, BOUNDS)).toBe(nextZoomByWheel(1, -100, BOUNDS))
        expect(nextZoomByWheel(1, 10000, BOUNDS)).toBe(nextZoomByWheel(1, 100, BOUNDS))
    })

    it('>100% 区按 log10(zoom) 增幅，缩小区无增幅项', () => {
        const wide = { min: 0.05, max: 30 }
        // zoom=8，Δ=-100：base = 8.1，增幅 = log10(8) * 1 * min(1, 1) = 0.903…
        const at8 = nextZoomByWheel(8, -100, wide)
        expect(at8).toBeCloseTo(8 + 0.1 + Math.log10(8), 12)
        // zoom=0.5（<100%）：无增幅项
        const atHalf = nextZoomByWheel(0.5, -100, wide)
        expect(atHalf).toBeCloseTo(0.6, 12)
    })

    it('小 delta（触控板捏合）增幅衰减为 min(1, |Δ|/20)', () => {
        const wide = { min: 0.05, max: 30 }
        // zoom=8，Δ=-4：增幅 = log10(8) * (4/20)
        const next = nextZoomByWheel(8, -4, wide)
        expect(next).toBeCloseTo(8 + 0.04 + (Math.log10(8) * 4) / 20, 12)
    })

    it('结果钳位到缩放范围，单调：向上滚不小于向下滚', () => {
        expect(nextZoomByWheel(7.95, -100, BOUNDS)).toBe(8)
        expect(nextZoomByWheel(0.051, 100, BOUNDS)).toBe(0.05)
        for (const zoom of [0.05, 0.3, 1, 2, 8]) {
            expect(nextZoomByWheel(zoom, -50, BOUNDS)).toBeGreaterThanOrEqual(nextZoomByWheel(zoom, 50, BOUNDS))
        }
    })
})
