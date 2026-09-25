/**
 * 目验样图（工单 15）：平移 php-canvas-image-renderer/scripts/visual-check.php 的
 * 同一场景——中文禁则断行段落、三行两列表格（带边框表头行）、QR、双色图片条、
 * priority 叠放（priority 越大越先渲染越垫底），供人工核对预览观感。
 *
 * 与 PHP 脚本的两处同构差异：
 * - 字体：PHP 探测本机 CJK 字体文件；浏览器端走内置默认（系统无衬线族），预览
 *   断行允许与终图不同（决策 A）。
 * - 图片条：PHP 现场生成双色 PNG；此处内联同构图的 SVG data URL（360×40，底
 *   #e8f0e8 + 120×20 色块 #6dc287 @ (10,10)）。
 */
import { decodeGraph, layerHeight, type Canvas } from '@hankchen/canvas-next'

/** 图片条的同构源图：data URL 免网络依赖（物化管线经 Image 元素装载） */
const STRIP_SVG_DATA_URL =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='40'%3E%3Crect width='360' height='40' fill='%23e8f0e8'/%3E%3Crect x='10' y='10' width='120' height='20' fill='%236dc287'/%3E%3C/svg%3E"

/** 场景 wire（与 PHP 脚本逐层对应；表格 height 置 0 占位，运行时按行高之和回填） */
const VISUAL_CHECK_GRAPH_JSON = `{
  "canvas": { "width": 400, "height": 400 },
  "layers": [
    {
      "type": "ImageLayer",
      "priority": 11,
      "spec": {
        "shape": { "width": 400, "height": 400, "backgroundColor": "#ffffff" },
        "position": { "x": 0, "y": 0, "position": "top-left" }
      }
    },
    {
      "type": "ImageLayer",
      "priority": 10,
      "spec": {
        "shape": { "width": 400, "height": 90, "backgroundColor": "#2d6cdf" },
        "position": { "x": 0, "y": 0, "position": "top-left" }
      }
    },
    {
      "type": "TextLayer",
      "priority": 5,
      "spec": {
        "shape": { "width": 400, "height": 90 },
        "align": { "horizontal": "center", "vertical": "center" },
        "position": { "x": 0, "y": 0, "position": "top-left" },
        "fontFamily": { "fontSize": 24, "fontColor": "#ffffff" }
      },
      "data": { "valueType": "StaticValue", "expression": "", "value": "canvas-web 目验样图" }
    },
    {
      "type": "TextLayer",
      "priority": 4,
      "spec": {
        "shape": {
          "width": 360, "height": "auto", "backgroundColor": "#f5f7fa",
          "padding": { "top": 10, "bottom": 10, "left": 10, "right": 10 }
        },
        "position": { "x": 20, "y": 110, "position": "top-left" },
        "fontFamily": { "fontSize": 14, "fontColor": "#333333", "autowrap": true }
      },
      "data": {
        "valueType": "StaticValue",
        "expression": "",
        "value": "图层树与渲染器分离之后，同一份结构树可以交给不同后端渲染；中文断行内置禁则处理，行首不会出现句号、逗号等收尾标点。英文单词 hello world 优先在词边界断行。"
      }
    },
    {
      "type": "TableLayer",
      "priority": 4,
      "spec": {
        "shape": {
          "width": 250, "height": 0, "backgroundColor": "#ffffff",
          "border": { "top": { "width": 1, "color": "#dddddd" }, "bottom": { "width": 1, "color": "#dddddd" }, "left": { "width": 1, "color": "#dddddd" }, "right": { "width": 1, "color": "#dddddd" } }
        },
        "position": { "x": 20, "y": 250, "position": "top-left" }
      },
      "rows": [
        {
          "type": "TableRowLayer",
          "spec": { "shape": { "width": 250, "height": "auto" } },
          "cells": [
            {
              "type": "TableCellLayer",
              "spec": {
                "shape": {
                  "width": 80, "height": "auto", "backgroundColor": "#eef3fd",
                  "border": { "top": { "width": 1, "color": "#dddddd" }, "bottom": { "width": 1, "color": "#dddddd" }, "left": { "width": 1, "color": "#dddddd" }, "right": { "width": 1, "color": "#dddddd" } }
                }
              },
              "content": {
                "type": "TextLayer",
                "spec": {
                  "shape": { "width": 80, "height": "auto", "padding": { "top": 6, "bottom": 6, "left": 6, "right": 6 } },
                  "fontFamily": { "fontSize": 12, "fontColor": "#222222" }
                },
                "data": { "valueType": "StaticValue", "value": "字段" }
              }
            },
            {
              "type": "TableCellLayer",
              "spec": {
                "shape": {
                  "width": 170, "height": "auto", "backgroundColor": "#eef3fd",
                  "border": { "top": { "width": 1, "color": "#dddddd" }, "bottom": { "width": 1, "color": "#dddddd" }, "left": { "width": 1, "color": "#dddddd" }, "right": { "width": 1, "color": "#dddddd" } }
                }
              },
              "content": {
                "type": "TextLayer",
                "spec": {
                  "shape": { "width": 170, "height": "auto", "padding": { "top": 6, "bottom": 6, "left": 6, "right": 6 } },
                  "fontFamily": { "fontSize": 12, "fontColor": "#222222" }
                },
                "data": { "valueType": "StaticValue", "value": "说明" }
              }
            }
          ]
        },
        {
          "type": "TableRowLayer",
          "spec": { "shape": { "width": 250, "height": "auto" } },
          "cells": [
            {
              "type": "TableCellLayer",
              "spec": { "shape": { "width": 80, "height": "auto", "backgroundColor": "#ffffff" } },
              "content": {
                "type": "TextLayer",
                "spec": {
                  "shape": { "width": 80, "height": "auto", "padding": { "top": 6, "bottom": 6, "left": 6, "right": 6 } },
                  "fontFamily": { "fontSize": 12, "fontColor": "#222222" }
                },
                "data": { "valueType": "StaticValue", "value": "Canvas" }
              }
            },
            {
              "type": "TableCellLayer",
              "spec": { "shape": { "width": 170, "height": "auto", "backgroundColor": "#ffffff" } },
              "content": {
                "type": "TextLayer",
                "spec": {
                  "shape": { "width": 170, "height": "auto", "padding": { "top": 6, "bottom": 6, "left": 6, "right": 6 } },
                  "fontFamily": { "fontSize": 12, "fontColor": "#222222" }
                },
                "data": { "valueType": "StaticValue", "value": "纯结构容器" }
              }
            }
          ]
        },
        {
          "type": "TableRowLayer",
          "spec": { "shape": { "width": 250, "height": "auto" } },
          "cells": [
            {
              "type": "TableCellLayer",
              "spec": { "shape": { "width": 80, "height": "auto", "backgroundColor": "#ffffff" } },
              "content": {
                "type": "TextLayer",
                "spec": {
                  "shape": { "width": 80, "height": "auto", "padding": { "top": 6, "bottom": 6, "left": 6, "right": 6 } },
                  "fontFamily": { "fontSize": 12, "fontColor": "#222222" }
                },
                "data": { "valueType": "StaticValue", "value": "Renderer" }
              }
            },
            {
              "type": "TableCellLayer",
              "spec": { "shape": { "width": 170, "height": "auto", "backgroundColor": "#ffffff" } },
              "content": {
                "type": "TextLayer",
                "spec": {
                  "shape": { "width": 170, "height": "auto", "padding": { "top": 6, "bottom": 6, "left": 6, "right": 6 } },
                  "fontFamily": { "fontSize": 12, "fontColor": "#222222" }
                },
                "data": { "valueType": "StaticValue", "value": "可插拔渲染后端" }
              }
            }
          ]
        }
      ]
    },
    {
      "type": "QrCodeLayer",
      "priority": 4,
      "spec": {
        "shape": { "width": 90, "height": 90 },
        "position": { "x": 280, "y": 250, "position": "top-left" }
      },
      "data": { "valueType": "StaticValue", "value": "https://github.com/hankchen/php-canvas-next" }
    },
    {
      "type": "ImageLayer",
      "priority": 4,
      "spec": {
        "shape": { "width": 360, "height": 40, "backgroundColor": "#ffffff" },
        "position": { "x": 20, "y": 340, "position": "top-left" }
      },
      "data": { "valueType": "StaticValue", "value": "${STRIP_SVG_DATA_URL}" }
    },
    {
      "type": "TextLayer",
      "priority": 4,
      "spec": {
        "shape": { "width": 400, "height": 30 },
        "align": { "horizontal": "center", "vertical": "center" },
        "position": { "x": 0, "y": 370, "position": "top-left" },
        "fontFamily": { "fontSize": 11, "fontColor": "#888888" }
      },
      "data": { "valueType": "StaticValue", "expression": "", "value": "HankChen/canvas-web" }
    }
  ]
}`

/**
 * 目验样图文档：解码 wire + 表格高按行高之和回填（PHP visual-check
 * setHeight(array_sum(row heights)) 同式——表高不在解码 add 同步面内）。
 */
export function buildVisualCheckGraph(): Canvas {
    const doc = decodeGraph(JSON.parse(VISUAL_CHECK_GRAPH_JSON))
    return {
        ...doc,
        layers: doc.layers.map((layer) => {
            if (layer.type !== 'TableLayer') return layer
            const height = layer.rows.reduce((sum, row) => sum + layerHeight(row), 0)
            return { ...layer, shape: { ...layer.shape, height } }
        }),
    }
}
