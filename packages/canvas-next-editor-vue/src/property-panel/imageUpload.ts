/**
 * 图片上传控件的宿主注入缝（imageSrc 控件）：控件需要上传可用性与裸上传动作，
 * 而属性控件的 props 契约只有 field/modelValue——经 provide/inject 接线，控件树
 * 任意深度可取。与 fontPicker 缝的差异：这里没有宿主级配置面（字体清单是宿主
 * 资产，图片上传不是）——canUpload 与 uploadImage 都是会话能力，由 PropertyPanel
 * 以持有的 EditorSession 提供一次即可，宿主零接线；上传实现本身仍归宿主创建
 * 会话时注入的 uploadHandler（「上传」词条：编辑器核心不持有其实现）。
 *
 * 未注入（隔离挂载/旧宿主）时控件退化为纯路径输入。
 */
import { inject, type InjectionKey } from 'vue'

import type { UploadFile } from '@hankchen/canvas-next-editor'

export interface ImageUploadContext {
    /** 上传可用性（内核 canUpload：未注入 uploadHandler 即 false） */
    readonly canUpload: boolean
    /** 本机图片 → 可物化引用（内核 uploadImage 裸上传：不建层不写文档） */
    readonly uploadImage: (file: UploadFile) => Promise<string | null>
}

export const IMAGE_UPLOAD_KEY: InjectionKey<ImageUploadContext> = Symbol('canvas-next-image-upload')

/** 控件 setup 内取注入缝；未注入返回 null（控件退化） */
export function injectImageUpload(): ImageUploadContext | null {
    return inject(IMAGE_UPLOAD_KEY, null)
}
