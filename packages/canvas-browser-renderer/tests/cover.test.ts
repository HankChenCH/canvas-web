import { describe, expect, it } from 'vitest'

import { coverCrop } from '../src/cover'

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
