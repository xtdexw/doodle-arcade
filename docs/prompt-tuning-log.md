# Prompt 精调日志

> 约定：每轮一行 `日期 | prompt | 改动 | 之前效果 | 之后效果`；代码 bug 只记录不改（交 GLM 会话处理）。

## 环境与链路排查结论（2026-09-24）

- `.env` 中 `ark-` 前缀 46 位 Key 在 v3 端点有效（`doubao-seed-evolving` 可用，图像输入 base64 `image_url` 格式实测通过：红点图→「红色」）。
- 前序会话的 401「API key format is incorrect」**根因是脚本不加载 .env**（见 bug#1），并非 Key 无效。

## 代码 bug 清单（待 GLM 会话处理，本会话不动代码）

1. **脚本不加载 .env**：`server.js` 自带 `loadDotEnv()`，但 `scripts/regress.js`、`scripts/verify-ark.js` 直接 `node` 运行时 `process.env.ARK_API_KEY` 为 undefined → 401「API key format is incorrect」。建议：两脚本复用 server 的 loadDotEnv 或提为 lib。
2. **generate 长生成必须流式**：~~lib/ark.js 非流式调用……建议改流式~~ **已由并行 GLM 会话修复**（提交 7fef1a8，2026-09-24 01:29：chat 改 stream:true + SSE 增量聚合，默认超时 420s，可用 ARK_TIMEOUT_MS 调）。附带发现供参考：流式下 429 错误块会出现在流中间（见 bug#4）。
3. **regress.js 精灵占位符未替换**：`scripts/regress.js:28` 仍传已废弃的 `SPRITE_DATA` 变量（模板无此键，死代码），且落盘 `regress-*.html` 不做 `__DOODLE_SPRITE__` 替换（routes/api.js 有 `substituteSprite`，脚本没有）→ 回归产物精灵图必坏，无法做「精灵不变形」验收。建议：对齐 api.js 行为。
4. **429 突发保护会掐断流**：连续长请求触发 `RequestBurstTooFast`，一次流式请求被**中途**插入错误块后终止（reasoning 7295 字、content 0、无 finish_reason、仍收到 [DONE]）。ark.js 现有 429 重试只覆盖「响应状态码为 429」，不覆盖流中途 429。建议：脚本与前端流水线在长调用间加间隔；流式分支检测流内 error 块。

## 基线测量（fixtures/stickman.jpg，彩色小丑画）

| 环节 | 结果 |
|---|---|
| analyze ×3 | JSON 一次通过 3/3；genre=runner 3/3（正确：有腿无翅膀）；palette 8 色合理（纸底+线稿+主色）；**bbox 2/3 良好**（run2 y2=45% 将小丑拦腰截断；run1/3 x2=83% 略过包；目测真值≈[13%,18%,70%,82%]） |
| design ×1 | title「彩虹小丑欢乐跑酷」含角色名 ✓；bio 41 字 ✓；机制（跑酷/跳跃/纽扣与背带障碍/音符星星计分）单文件 Canvas 可实现 ✓ |
| generate | 非流式两次超时（>5min、9.7min 0 字节）；流式一次被 429 中途掐断（content 0）；再次流式 9m20s 仍是纯推理（17283 字、0 字正文，被 curl max-time 掐断，无打转，是过度详尽规划：连云朵圆弧/纽扣旋转角都在推理里定稿）→ generate 可完成但极慢，prompt 侧需压输出规模与实现复杂度 |

另：bbox 基线裁图目检确认 run2=[110,100,830,450] 拦腰截断（只剩头+假发）；run1/3 完整但 x2=830 过包至右侧空白（角色真值 x2≈700，星星在 x≈890 未包入，属正确排除）。

## 精调记录

| 日期 | prompt | 改动 | 之前效果 | 之后效果 |
|---|---|---|---|---|
| 2026-09-24 | analyze.md R1 | bbox 条款加「完整框住全身（头顶→脚/最低点）、不得截断、排除零散小涂鸦」 | 3 次 JSON 通过 3/3、genre 对，但 bbox 1/3 腰斩（y2=45%） | 2/3 完整（y2=90%），仍 1/3 y2=55% 截断 |
| 2026-09-24 | analyze.md R2 | bbox 条款再加「极值点自查：四边贴最左/最上/最右/最下；框内只见头/上半身即 y2 过小」 | R1 后仍 1/3 截断 | **3/3 稳定完整** [≈110-155,195,825,900]，裁图目检：小丑全身在框、无截断，右缘蹭星星一小角（可接受）。genre 3/3 runner 正确，JSON 一次通过 9/9（累计）。**达标** |
| 2026-09-24 | design.md R1 | 硬性要求#1 加复杂度上限：跳跃一种、障碍一类、收集物一类、无外围系统、机制合计 ≤120 字 | 基线已过三条标准（title 含角色名/bio 41 字/可实现），但机制臃肿（二段跳+组合排布+音符星星双收集）导致 generate 推理 1.7 万字不收笔 | title「欢乐小丑跑酷」含角色名 ✓；bio 36 字 ✓；机制合计 79 字（单跳+蜡笔桩+红纽扣）✓。**达标**（并为 generate 减负） |
