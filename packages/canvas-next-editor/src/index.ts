/**
 * @hankchen/canvas-next-editor headless 内核公共出口。
 *
 * 脚手架占位：工单 05 起在这里长出 observable store、工具状态机、选择与
 * viewport；工单 06–08 落拖拽/吸附/历史。红线：内核不依赖任何 UI 绑定层
 * （Vue/React），测试全部在 Node 无 DOM 环境运行。
 */
export const PACKAGE_NAME = '@hankchen/canvas-next-editor' as const
