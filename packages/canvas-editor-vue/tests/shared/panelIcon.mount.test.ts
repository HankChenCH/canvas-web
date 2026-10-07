// @vitest-environment jsdom
/**
 * <PanelIcon> 挂载测试（layer-panel-ux 工单 02）：统一档默认（尺寸/描边）、
 * props 覆盖、其余属性透传、icon prop 注入生效。最小消费形态即测试自身——
 * 消费方按名引入所需 lucide 图标经 icon prop 注入，封装不引 lucide 运行时
 * （tree-shake 的构建产物面另有一次性 vite 目验，见工票记录）。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { Eye, Pencil } from '@lucide/vue'

import PanelIcon from '../../src/shared/PanelIcon.vue'

describe('PanelIcon（lucide 图标面板封装，工单 02）', () => {
    it('默认统一档：14px / 描边 2（面板 11.5px 字号尺度）', () => {
        const wrapper = mount(PanelIcon, { props: { icon: Pencil } })
        const svg = wrapper.find('svg')
        expect(svg.exists()).toBe(true)
        expect(svg.attributes('width')).toBe('14')
        expect(svg.attributes('height')).toBe('14')
        expect(svg.attributes('stroke-width')).toBe('2')
        // 装饰性默认：无 a11y 属性时 lucide 自动补 aria-hidden
        expect(svg.attributes('aria-hidden')).toBe('true')
    })

    it('size / strokeWidth props 覆盖统一档', () => {
        const wrapper = mount(PanelIcon, { props: { icon: Pencil, size: 16, strokeWidth: 1.5 } })
        const svg = wrapper.find('svg')
        expect(svg.attributes('width')).toBe('16')
        expect(svg.attributes('height')).toBe('16')
        expect(svg.attributes('stroke-width')).toBe('1.5')
    })

    it('其余属性透传：color → stroke，data-* / class 合到 svg', () => {
        const wrapper = mount(PanelIcon, {
            props: { icon: Pencil },
            attrs: { color: '#ff0000', class: 'text-cn-muted', 'data-testid': 'rename-icon' },
        })
        const svg = wrapper.find('svg')
        expect(svg.attributes('stroke')).toBe('#ff0000')
        expect(svg.attributes('data-testid')).toBe('rename-icon')
        // 消费方的 class 与 lucide 自带类名（lucide lucide-pencil）合并共存
        expect(svg.classes()).toContain('text-cn-muted')
        expect(svg.classes()).toContain('lucide-pencil')
    })

    it('a11y 属性透传（title）：lucide 让位不补 aria-hidden', () => {
        const wrapper = mount(PanelIcon, { props: { icon: Pencil }, attrs: { title: '重命名' } })
        expect(wrapper.find('svg').attributes('aria-hidden')).toBeUndefined()
    })

    it('icon prop 注入生效：不同图标渲染各自的路径', () => {
        const pencil = mount(PanelIcon, { props: { icon: Pencil } })
        const eye = mount(PanelIcon, { props: { icon: Eye } })
        const pencilSvg = pencil.find('svg').html()
        const eyeSvg = eye.find('svg').html()
        // 各自含路径且互不相同 = icon prop 真正到达 svg（不硬编码 lucide 路径数据，
        // 避免上游图标重绘即碎）
        expect(pencilSvg).toContain('<path')
        expect(eyeSvg).toContain('<path')
        expect(pencilSvg).not.toBe(eyeSvg)
    })
})
