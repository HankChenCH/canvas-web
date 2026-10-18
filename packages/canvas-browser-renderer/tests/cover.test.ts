import { describe, expect, it } from 'vitest'

import { containRect, coverCrop } from '../src/cover'

/** cover 裁切窗逐值平移 go-canvas coverImage 同款数学（PHP intervention cover 同语义） */
describe('cover 裁切窗（coverCrop）', () => {
  it('宽图进竖盒：裁两侧', () => {
    // scale = max(120/200, 90/100) = 0.9 → 窗 133×100，sx = ⌊67/2⌋ = 33
    expect(coverCrop(200, 100, 120, 90)).toEqual({ sx: 33, sy: 0, sw: 133, sh: 100 })
  })

  it('高图进方盒：裁上下', () => {
    // scale = 0.9 → 窗 100×100，sy = ⌊100/2⌋ = 50
    expect(coverCrop(100, 200, 90, 90)).toEqual({ sx: 0, sy: 50, sw: 100, sh: 100 })
  })

  it('同比例：整图铺放，零偏移', () => {
    expect(coverCrop(100, 50, 100, 50)).toEqual({ sx: 0, sy: 0, sw: 100, sh: 50 })
  })

  it('放大铺满：小图放大到目标盒', () => {
    expect(coverCrop(50, 50, 100, 100)).toEqual({ sx: 0, sy: 0, sw: 50, sh: 50 })
  })

  it('极端宽高比：向零截断得 0 宽窗钳到 ≥1（宁可纵横比略让也不输出空图）', () => {
    // scale = max(0.2, 25) = 25 → cropW = ⌊20/25⌋ = 0 → 1；sx = ⌊99/2⌋ = 49
    expect(coverCrop(100, 4, 20, 100)).toEqual({ sx: 49, sy: 0, sw: 1, sh: 4 })
  })

  it('非整除缩放：裁切窗与居中偏移都向零截断', () => {
    // scale = max(0.3, 0.5) = 0.5 → 窗 60×60，sx = ⌊40/2⌋ = 20，sy = 0
    expect(coverCrop(100, 60, 30, 30)).toEqual({ sx: 20, sy: 0, sw: 60, sh: 60 })
  })
})

/**
 * contain 收缩矩形（image-fit 工单 05）：min-scale/trunc/居中偏移与核心
 * containRect（PHP getContainRect 同语义的图层无关版）同款数学；≥1 钳制是
 * coverCrop 房规的延伸（核心不钳制，截断得 0 由渲染臂 drawImage 防护只画盒），
 * 本函数供本包测试断言用、约定输出非空矩形
 */
describe('contain 收缩矩形（containRect）', () => {
  it('宽图进竖盒：长边贴宽，上下留空隙', () => {
    // scale = min(120/200, 90/100) = 0.6 → 120×60，x = 0，y = ⌊30/2⌋ = 15
    expect(containRect(200, 100, 120, 90)).toEqual({ x: 0, y: 15, width: 120, height: 60 })
  })

  it('高图进方盒：长边贴高，左右留空隙', () => {
    // scale = min(90/100, 90/200) = 0.45 → 45×90，x = ⌊45/2⌋ = 22，y = 0
    expect(containRect(100, 200, 90, 90)).toEqual({ x: 22, y: 0, width: 45, height: 90 })
  })

  it('同比例：整盒铺满，零偏移', () => {
    expect(containRect(100, 50, 100, 50)).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })

  it('缩小完整显示：小图进大盒按比例放大到贴边', () => {
    expect(containRect(50, 50, 100, 100)).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('极端宽高比：向零截断得 0 高钳到 ≥1（与 coverCrop 同门，宁可纵横比略让也不输出空矩形）', () => {
    // scale = min(20/100, 100/4) = 0.2 → 20×⌊0.8⌋=0 → 1；y = ⌊99/2⌋ = 49
    expect(containRect(100, 4, 20, 100)).toEqual({ x: 0, y: 49, width: 20, height: 1 })
  })

  it('非整除缩放：矩形与居中偏移都向零截断', () => {
    // scale = min(0.3, 0.5) = 0.3 → 30×18，x = 0，y = ⌊12/2⌋ = 6
    expect(containRect(100, 60, 30, 30)).toEqual({ x: 0, y: 6, width: 30, height: 18 })
  })
})
