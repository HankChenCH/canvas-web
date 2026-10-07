/**
 * 上传注入点（工单 13）：本机资源 → 可物化引用的宿主实现契约。
 *
 * core 只定义接口与消费动作，**不内置任何上传实现**（红线：图层 setter 禁 I/O
 * 的延伸——文档只持有引用字符串，本机字节到引用的搬运归宿主）：生产宿主接自己
 * 的对象存储/上传服务返回 URL；playground 以 data URL 兜底（文件不经网络，可离
 * 线演示，代价是引用随 graph JSON 一起变大——演示语义，不作生产形态）。
 *
 * 文件以 DOM 无关的最小形态描述（core 无 DOM lib）：绑定层从宿主 File 对象读出
 * 名称/MIME/字节后传入，内核不接触 File/Blob 等宿主类型。
 */

/** 本机资源文件的最小描述（DOM 无关） */
export interface UploadFile {
    /** 原始文件名（含扩展名；上传实现可据其推断存储键/展示名） */
    readonly name: string
    /** MIME 类型（如 image/png、font/ttf；未知时可为空串） */
    readonly mime: string
    /** 文件字节 */
    readonly bytes: Uint8Array
}

/** 本机资源 → 可物化引用（URL / data URL / 宿主存储地址，渲染端物化管线可装载的引用） */
export type UploadHandler = (file: UploadFile) => Promise<string>

/**
 * 上传建层的摆位覆盖（kbd-nav 工单 05，拖文件入画布语义）：缺省（两键皆缺）=
 * 编辑器缺省盒（createDefaultLayer 的 ImageLayer 形态 200×150 落 0,0）。
 * - `at`：图层盒左上角的场景坐标（缺省 top-left 锚不改，改写锚点偏移）；
 * - `size`：盒尺寸 1:1 落值不缩放（拖放语义传解码出的图片自然尺寸，溢出画布
 *   属预期——Figma 同构）。
 */
export interface UploadImagePlacement {
    readonly at?: { x: number; y: number }
    readonly size?: { width: number; height: number }
}

/** 上传条目的展示名：去扩展名的文件名基名（空退化全名） */
export function uploadDisplayName(file: UploadFile): string {
    const base = file.name.replace(/\.[^.]+$/, '')
    return base === '' ? file.name : base
}

/** 未注入上传实现时的统一错误（宿主侧降级提示的对位语义） */
export class UploadHandlerMissingError extends Error {
    constructor() {
        super('未注入上传实现（uploadHandler）：宿主可在创建 EditorSession 时提供本机资源 → 可物化引用的实现')
        this.name = 'UploadHandlerMissingError'
    }
}
