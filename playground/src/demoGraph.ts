/**
 * 工单 02 目验样例：宿主交接的 graph JSON（手写体——部分层缺键、带字符串数字，
 * 演示解码的缺省回填与收整；工单 03/04 接入文本/图片/QR 真实绘制后替换为完整样例）。
 *
 * 目验要点：
 * - priority 叠放：100 背景垫底 → 40 表格 → 30 QR → 20 文本 → 10 半透明红盒最上
 * - 负溢出不钳位：半透明红盒宽 560 > 画布 480，锚点 top-right → x = -80，左侧溢出画布
 * - 盒模型：背景色 / 四边 border / padding 内容盒（蓝色虚线为目验辅助，非渲染产物）
 */
export const DEMO_GRAPH_JSON = `{
  "canvas": { "width": 480, "height": 320 },
  "layers": [
    {
      "type": "ImageLayer",
      "priority": 100,
      "spec": {
        "shape": { "width": 480, "height": 320, "backgroundColor": "#0f172a" },
        "align": { "horizontal": "center", "vertical": "center" },
        "position": { "x": 0, "y": 0, "position": "top-left" }
      },
      "data": { "valueType": "StaticValue", "value": "https://example.com/bg.png" }
    },
    {
      "type": "TableLayer",
      "priority": 40,
      "spec": {
        "shape": {
          "width": 300, "height": 100, "backgroundColor": "#0ea5e9",
          "border": { "top": { "width": 2, "color": "#e2e8f0" }, "bottom": { "width": 2, "color": "#e2e8f0" } }
        },
        "position": { "x": 24, "y": 190, "position": "top-left" }
      },
      "rows": [
        {
          "type": "TableRowLayer",
          "spec": { "shape": { "width": "300", "height": 45 } },
          "cells": [
            { "type": "TableCellLayer", "spec": { "shape": { "width": 150, "height": 45, "backgroundColor": "#fbbf24" } } },
            { "type": "TableCellLayer", "spec": { "shape": { "width": 150, "height": 45, "backgroundColor": "#f97316" } } }
          ]
        },
        {
          "type": "TableRowLayer",
          "spec": { "shape": { "width": "300", "height": 55 } },
          "cells": [
            {
              "type": "TableCellLayer",
              "spec": { "shape": { "width": 150, "height": 55, "backgroundColor": "#a78bfa" } },
              "content": {
                "type": "TextLayer",
                "spec": {
                  "shape": { "width": 150, "height": 55 },
                  "fontFamily": { "fontSize": 12, "fontColor": "#ffffff" }
                },
                "data": { "valueType": "StaticValue", "value": "单元格文本（工单 03 绘制）" }
              }
            },
            { "type": "TableCellLayer", "spec": { "shape": { "width": 150, "height": 55, "backgroundColor": "#fb7185" } } }
          ]
        }
      ]
    },
    {
      "type": "QrCodeLayer",
      "priority": 30,
      "spec": {
        "shape": {
          "width": 72, "height": 72, "backgroundColor": "#38bdf8",
          "border": { "top": { "width": 3, "color": "#f8fafc" }, "bottom": { "width": 3, "color": "#f8fafc" }, "left": { "width": 3, "color": "#f8fafc" }, "right": { "width": 3, "color": "#f8fafc" } }
        },
        "position": { "x": 16, "y": 16, "position": "top-right" }
      },
      "data": { "valueType": "StaticValue", "value": "https://example.com" }
    },
    {
      "type": "TextLayer",
      "priority": 20,
      "spec": {
        "shape": {
          "width": "220", "height": 64, "backgroundColor": "#34d399",
          "padding": { "top": 12, "bottom": 12, "left": 12, "right": 12 },
          "border": { "left": { "width": 6, "color": "#065f46" } }
        },
        "align": { "horizontal": "left", "vertical": "bottom" },
        "position": { "x": 24, "y": 96, "position": "top-left" },
        "fontFamily": { "fontSize": 16, "fontColor": "#052e16" }
      },
      "data": { "valueType": "StaticValue", "expression": "", "value": "标题文本（工单 03 绘制）" }
    },
    {
      "type": "ImageLayer",
      "priority": 10,
      "spec": {
        "shape": {
          "width": 560, "height": 72, "backgroundColor": "rgba(239, 68, 68, 0.35)",
          "border": { "top": { "width": 2, "color": "#ef4444" }, "bottom": { "width": 2, "color": "#ef4444" } }
        },
        "position": { "x": 0, "y": 0, "position": "top-right" }
      },
      "data": { "valueType": "StaticValue", "value": "https://example.com/banner.png" }
    }
  ]
}`
