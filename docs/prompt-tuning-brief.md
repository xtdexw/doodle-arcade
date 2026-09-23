# Prompt 精调任务简报（豆包后端 Claude Code 会话专用）

> 本文件是给「豆包 Seed 模型驱动的 Claude Code 会话」的任务书。你（豆包）是本项目核心 prompt 的开发者。
> 项目背景：涂鸦游戏机 Doodle Arcade——上传真人手绘涂鸦，经三步流水线（看图→设计→写码）生成可玩单文件 HTML5 游戏。
> 完整设计见 `docs/superpowers/specs/2026-09-23-doodle-arcade-design.md`，实施计划见 `docs/superpowers/plans/2026-09-23-doodle-arcade.md`（可按需查阅，不必通读）。

## 你的任务

精调 `prompts/` 下 5 个模板，让真实涂鸦端到端效果稳定达标：

| 模板 | 文件 | 达标标准 |
|---|---|---|
| 看图 | prompts/analyze.md | bbox 套住主角（看裁出的精灵图）；genre 决策合理（翅膀→flappy，有腿→runner）；JSON 一次通过率 ≥ 2/3 |
| 设计 | prompts/design.md | title 含角色名；bio ≤60 字；机制可在单文件 Canvas 实现 |
| 写码 | prompts/generate.md | 游戏可玩（键盘+触屏）；精灵不变形；配色来自 palette；契约 8 条全守住（尤其 `window.DOODLE_GAME` 与加载即开始） |
| 修复 | prompts/repair.md | 故意删一个函数制造坏 HTML，修复轮能修好 |
| 修改 | prompts/revise.md | 三条标准指令（跳更高/加金币/夜晚配色）改动最小化 |

## 工作循环（每轮）

1. 改一个 prompt（一次只改一个变量，便于归因）
2. 用真涂鸦验证：`npm run regress`（需 `fixtures/` 有涂鸦照片且 `.env` 的 ARK_API_KEY 有效），或起服务 `npm start` 后浏览器上传
3. 在 `docs/prompt-tuning-log.md` 追加一行：`日期 | prompt | 改动 | 之前效果 | 之后效果`
4. 达标一个 commit 一次：`git commit -m "feat(prompt): <模板名> 精调 <一句话>"`

## 已知背景（前序会话的验证结论）

- 客户端与端点已验证可用（lib/ark.js，OpenAI 兼容 `image_url` base64 格式）——曾因 API Key 无效得到 401，属 Key 问题非格式问题
- 图像输入格式：OpenAI 兼容多模态消息（lib/ark.js `imageMessage`）
- 生成物落盘在 `games/`；沙箱健康检测会自动报错回喂（前端 pipeline）——修复 prompt 的效果可以在浏览器时间线上直观看到
- T9 已修复两处 UI 缺陷（修改流修复版入版本栈、调色板容器），与 prompt 无关但演示时可见

## 约束

- 只改 `prompts/*.md` 与 `docs/prompt-tuning-log.md`，不动其他代码（发现代码 bug 记到 log 里，由 GLM 会话处理）
- 对外文案（含 prompt 内指令）不使用极限词（最/第一/绝对/免费）与导流词
- 修改保持向后兼容：变量键（{{ANALYZE_JSON}} 等）不可改名——lib/prompts.js 会校验
- 中文 prompt，逐字符 UTF-8

## 启动方式（项目级配置已就位，任何终端均可）

`.claude/settings.local.json` 已配置 Agent Plan 三件套（BASE_URL / AUTH_TOKEN / MODEL=doubao-seed-evolving），**优先级高于全局配置，仅在本项目目录生效**。启动：

```bash
cd "C:\Users\xiaotao\Desktop\CSDN相关\豆包\三期投稿\doodle-arcade"
claude
```

进入会话后：
1. 先 `/status` 确认模型显示为 doubao-seed-evolving（不是 glm 才算成功）
2. 第一句话：「请阅读 docs/prompt-tuning-brief.md 并开始执行」

## 重要：认领既有的精调成果

历史提交 `8d7066e`（analyze 精调）及可能存在的未提交 design.md 修改，产生自一个未切换成功的会话（实为 GLM）。你需要：
1. `git log --oneline -5` 和 `git diff` 查看这些改动；
2. 逐条审视其合理性，**用自己的判断重新验证或改写**（跑 fixtures 确认效果）；
3. 在 docs/prompt-tuning-log.md 如实记录：哪些是沿用、哪些是你重做的。

## 环境注意

- 运行时服务器可能占用 3000 端口：你要起服务时用 `PORT=3001 node server.js`，或直接 `npm run regress`（不起服务）
- generate/repair/revise 已改为关思考+32k 输出上限（工程侧修复），回归跑起来是快的
- 两把 Key 各司其职：plan key 只用于本会话（配置文件里）；`.env` 里的 runtime key 驱动工具本身，勿混用

## 降级方案（已不需要，留档）

若 plan 端点不可用（401/404）：在 GLM 会话完成精调，文章叙事只写运行链路（豆包 API 驱动全部生成能力），并如实记录原因到 prompt-tuning-log.md。
