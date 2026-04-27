---
title: 'Astro 初体验 - 极快的静态站点框架'
description: 'Astro 是一个专注于内容驱动的 Web 框架，它的核心卖点是「服务器优先渲染」和几乎零 JavaScript 输出。'
pubDate: '2026-04-27'
---

## 什么是 Astro？

Astro 是一个专注于**内容驱动网站**的 JavaScript 框架。它的核心特点是：默认情况下不向浏览器发送任何 JavaScript，只输出纯粹的 HTML + CSS。

传统的 React/Vue 框架比如 Next.js，即使页面只需要一个简单的按钮，也会加载一整个 JS runtime 到浏览器。但 Astro 不是——它默认把所有组件在**服务器端渲染成静态 HTML**，只有在真正需要交互的地方才加载对应的 JavaScript。

## 核心特性：Astro Islands

Astro 的 Islands 架构是其最大亮点。你可以想象页面是一块海洋，而各个交互组件是孤岛。海洋（静态 HTML）不需要 JavaScript，只有岛屿（交互组件）才需要。

> Astro Islands 让我可以在静态博客里优雅地嵌入一个 React 组件，而不影响整体性能。

## 快速开始

只需要一行命令就能创建一个新项目：

```bash
npm create astro@latest
```

访问 `http://localhost:4321` 就能看到你的博客了。

## 我的感受

用了 Astro 一周后，我对它的评价是：**做内容型网站，它是目前最好的选择之一**。开发体验流畅，性能爆表，生态也在快速成长。
