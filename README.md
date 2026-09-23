# 涂鸦游戏机 Doodle Arcade

> 把一张真人手绘涂鸦，变成一个能玩的 HTML5 游戏。
> 由豆包 Seed-2.1-pro-0915（API：doubao-seed-evolving）驱动 —— 它看图、它设计、它写码、它跑不通还会自己修。

## 它是怎么工作的

```
涂鸦照片 ──► ① 看图（VLM）：识别角色/配色/画风，决定游戏类型
        ──► ② 设计：出游戏设计稿（标题/机制/难度/彩蛋）
        ──► ③ 写码：生成单文件 HTML5 Canvas 游戏，涂鸦原样作主角
        ──► ④ 自检：沙箱试跑，报错自动回喂修复（≤2 轮）
        ──► ⑤ 多轮修改："跳得再高一点" → v2/v3…
```

## 快速开始

```bash
npm install
cp .env.example .env   # 填入火山方舟 ARK_API_KEY
export ARK_API_KEY=... # Windows Git Bash
npm start              # http://localhost:3000
```

- 回归测试（可选）：把涂鸦照片放进 `fixtures/` 后 `npm run regress`
- 图像输入连通性验证：`npm run verify:ark`

## 目录

`server.js` 无状态 Express 代理（5 个生成端点）· `public/` 前端（上传/时间线/理解面板/沙箱）· `prompts/` 5 个 prompt 模板 · `games/` 生成物存档 · `docs/` 设计文档与 prompt 调参日志

## 说明

- 仅用于豆包 Seed 创作征集演示；游戏由模型逐次生成，效果随涂鸦而变。
- 生成物为零依赖单 HTML，双击即玩，也可在手机浏览器运行。
