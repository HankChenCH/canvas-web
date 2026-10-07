/**
 * 设备像素比（dpr）跟随：matchMedia 自再注册（MDN 标准手法，覆盖跨屏拖动/
 * 页面缩放）。CanvasSurface 与文本编辑 overlay 共用同一 dpr 口径——两侧消费
 * 同一呈现视口，物理像素对齐不漂移。
 */
import { onScopeDispose, shallowRef, type Ref } from 'vue'/** dpr 变更回调（callback 版：CanvasSurface 在 onMounted 手动管理 teardown） */
export type DprChangeHandler = (dpr: number) => void

/**
 * 监听 dpr 变更（含首次注册），返回取消函数。经分辨率媒体查询自再注册：
 * 旧查询在 dpr 变化瞬间失配，必须换新查询继续监听。
 */
export function watchDprChanges(handler: DprChangeHandler): () => void {
    let media: MediaQueryList | null = null
    const watch = () => {
        media?.removeEventListener('change', watch)
        handler(window.devicePixelRatio || 1)
        media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
        media.addEventListener('change', watch)
    }
    watch()
    return () => media?.removeEventListener('change', watch)
}

/** dpr 的响应式桥（composable 版：订阅随 effect scope 自动注销） */
export function useDpr(): Ref<number> {
    const dpr = shallowRef(window.devicePixelRatio || 1)
    const stop = watchDprChanges((value) => {
        dpr.value = value
    })
    // failSilently：测试可在无 effect scope 的环境调用
    onScopeDispose(stop, true)
    return dpr
}
