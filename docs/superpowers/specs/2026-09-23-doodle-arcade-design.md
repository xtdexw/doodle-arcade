# 涂鸦游戏机 Doodle Arcade — 设计文档

- 日期：2026-09-23
- 状态：已与创作者确认（待终审）
- 作者：Xxtaoaooo（CSDN: https://blog.csdn.net/Rqaqedamancy）

## 1. 背景与目标

参加豆包 Seed-2.1-pro 升级三期创作征集（Case 向，方向一）。征集硬性要求：

- 体验方向必须是**多模态 Coding 或多模态 Agent**（视觉理解 VLM + Coding/Agent），纯文本类不符合本期重点；
- Case 必须是真实任务**从输入到输出完整跑通**，有可体验的成品入口（HTML / GitHub / 产品页）；
- 文章发布口径统一使用 **Seed-2.1-pro-0915**（API 实测用 `doubao-seed-evolving`，两者能力一致）；
- IDE 偏好 TRAE / Claude Code / Codex；**在豆包工作中完成一个简单 Case 是加分项**；
- 文章禁忌：纯 AI 生成内容、拉踩竞品、极限词（最/第一/绝对/免费等）、导流词（私我/看主页/加V等）。

**选题**：「把涂鸦变成真的游戏」——上传一张真人手绘涂鸦，AI 识别角色/配色/风格，自动设计并生成一个以该涂鸦为主角、可玩的单文件 HTML5 游戏。

- 一句话亮点：涂鸦躺平在纸上，丢给 AI，它还你一个能玩的游戏。
- 契合卖点：VLM 图像理解与 grounding（本期升级点）、多模态 Coding / design2code（本期主推）、生成后自检修复（对应"减少编造结果、等待真实结果再交付"的升级点）。

### 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 方案 | 方案 B「涂鸦游戏机」小工作站（非极简脚本、非多类型大而全） |
| 交付形态 | 先本地跑通，截止前有余力再部署上线（后端无状态，可直接套云函数） |
| 素材 | 真人手绘涂鸦（家人/朋友画），另备 3 张风格不同的回归用 fixtures |
| 时间预算 | 3 天内交稿（D1 2026-09-24 起） |
| 双链路 | 开发链路：Claude Code + 火山方舟 Agent Plan（豆包后端）做核心 prompt 工程；运行链路：作品调用方舟 OpenAI 兼容 API |
| 游戏类型 | 收敛为 2 种：跑酷（runner）/ Flappy 类，由 VLM 按涂鸦特征自动二选一 |
| 文章标题 | 《把我妹画的涂鸦丢给豆包Seed-2.1-pro，火柴人当场学会二段跳》（正文首段补全 Seed-2.1-pro-0915 口径；D3 可按实际画面微调，梗不变） |

### 非目标（本期不做）

- 多游戏类型自适应引擎（平台跳跃/射击/游泳等）、内置涂鸦素材包画廊、生成历史画廊
- 第三方抠图模型（精灵预处理用纯算法）
- 用户账号系统、付费/限流等生产化功能
- 豆包工作 Skills 封装（仅在确认开放且有余力时作为可选进阶项）

## 2. 架构总览

```
浏览器（纯静态前端，无构建步骤，vanilla JS + CSS）
 ├─ 上传页：拍照/选图 → 前端压缩(长边1280) + 阈值去白底 + bbox 裁剪主体(精灵图)
 ├─ 生成时间线：看图 → 设计 → 写码 三步进度可视化(SSE 流式)
 ├─ 理解面板：VLM 结构化识别结果可视化（角色/配色/风格/类型决策）
 ├─ 游戏沙箱：iframe 加载生成物 + 健康自检 + 多轮修改热替换 + v1/v2/v3 版本切换
 └─ 修改对话框：自然语言指令改游戏（"跳得再高一点""加金币""换成夜晚配色"）
        │ HTTP (localhost)
极简后端代理（Node.js + Express，无状态，.env 藏 ARK_API_KEY）
 ├─ POST /api/analyze  → 看图（VLM，image_url base64）
 ├─ POST /api/design   → 出游戏设计稿(JSON)
 ├─ POST /api/generate → 写游戏代码(单文件 HTML)
 ├─ POST /api/repair   → 报错自修复（报错堆栈+原代码 → 修复版）
 ├─ POST /api/revise   → 多轮修改（当前代码+用户指令 → 新版本）
 └─ 静态托管 public/ + games/ 生成物存档
        │ OpenAI 兼容 API
火山方舟 doubao-seed-evolving（文章口径：Seed-2.1-pro-0915）
```

后端无状态 → 上线时套 Vercel 云函数承载 /api/*，前端不动。

## 3. 三步流水线

核心资产是 `prompts/` 下的 5 个 prompt 模板，**必须在豆包后端的 Claude Code 会话中打磨**（保证文章"开发用它、运行也用它"的故事真实成立；GLM 会话负责脚手架与工程辅助）。

| 步骤 | 输入 | 输出 | 展示的模型能力 |
|---|---|---|---|
| ① 看图 analyze | 涂鸦照片(base64) | 结构化 JSON：characters[]（名称/描述/性格/bbox）、palette[]、style、mood、suggested_genre(runner/flappy) + genre_reason | VLM 识别 + grounding 定位 |
| ② 设计 design | ①的 JSON | 设计稿 JSON：游戏标题、机制、障碍物、难度曲线、胜负条件、彩蛋 + 角色小传文案 | 任务规划 |
| ③ 写码 generate | 设计稿 + 精灵 base64 + 代码契约 | 完整单文件 Canvas 游戏 | 多模态 Coding |
| ④ 修复 repair / 修改 revise | 报错堆栈+原代码 / 当前代码+用户指令 | 修复版 / 新版本 | 自检与多轮一致性 |

**代码契约**（写码 prompt 中固定约束，保证生成物可跑）：

- 单 HTML 文件，800×600 Canvas，零外部依赖、零网络请求；
- 精灵图以 base64 内嵌，场景配色取自 ① 的 palette；
- 键盘（空格/方向键）+ 触屏双操作；
- 约定全局 API（如 `window.DOODLE_GAME.start/stop/score`）供沙箱健康检测。

## 4. 自检修复循环（文章证据链亮点）

1. 沙箱 iframe 加载生成物；
2. 健康检测：`window.onerror` 捕获报错 + 2 秒内 canvas 是否出现首帧渲染；
3. 失败 → 把报错堆栈与原代码 POST /api/repair → 重新加载再检，最多 2 轮；
4. 2 轮后仍失败 → 保留最佳版本并明确提示，不假装成功。

前端将整个过程渲染为可视时间线，文章截图即证据链：生成 → 试跑 → 报错 → 自修 → 通过。

## 5. 组件与目录

```
三期投稿/doodle-arcade/
 ├─ server.js            # Express 代理（5 个端点 + 静态托管 + 启动校验 ARK_API_KEY）
 ├─ package.json         # npm start 一键启动
 ├─ public/
 │   ├─ index.html / app.js / style.css
 │   └─ js/
 │       ├─ pipeline.js  # 三步流水线编排 + SSE 时间线
 │       ├─ sprite.js    # 涂鸦预处理：压缩、去白底、bbox 裁剪
 │       └─ sandbox.js   # iframe 沙箱 + 健康检测 + 热替换 + 版本切换
 ├─ prompts/             # analyze / design / generate / repair / revise 模板
 ├─ games/               # 生成物存档（doodle-<timestamp>.html）
 ├─ fixtures/            # 3 张回归用真人涂鸦
 └─ README.md            # 仓库门面 + 本地运行指引
```

## 6. 数据流

上传图片 → 前端压缩与预处理得到精灵 PNG(base64) → analyze（原图）→ design → generate（含精灵）→ 沙箱自检 →（失败）repair ×≤2 → 可玩 + 理解面板展示 → revise 多轮修改 → 版本历史切换。生成物同时落盘 `games/`。

## 7. 错误处理

- API 超时/限流：指数退避重试 ×2；全程 SSE 流式，等待可感知；
- JSON 解析失败：重试 ×1 + 容错提取 ` ```json ` 代码块；
- 生成代码跑不起来：repair ×2 后保留最佳版本并明示；
- 图片过大：前端压缩到长边 1280、base64 ≤10MB（方舟限制）；
- ARK_API_KEY 缺失：启动时校验并友好报错。

## 8. 测试

- 集成：3 张风格不同的真人涂鸦（简单火柴人 / 彩色儿童画 / 带翅膀角色）各跑全流水线；验收 = 游戏可玩 + 理解面板结果合理；
- 回归：prompt 每次改动后重跑 fixtures；
- 手工：手机浏览器触屏可玩性；
- 单元（轻量）：sprite 预处理、JSON 容错解析。

## 9. 三天排期（D1 = 2026-09-24）

| 时间 | 内容 |
|---|---|
| D1 上午 | 脚手架 + 方舟 API 图像输入格式验证（GLM 会话）；启动豆包后端 Claude Code 会话，打磨 analyze prompt |
| D1 下午 | 三步流水线打通，第一张真人涂鸦端到端出游戏 |
| D2 上午 | 自检修复循环 + 沙箱 + 版本切换 |
| D2 下午 | 理解面板/整体 UI 打磨 + 全部素材跑批 + 录屏 GIF |
| D2 晚 | 豆包工作简单 Case（涂鸦 → 游戏说明书/宣传海报）+ 截图 |
| D3（09-26） | /khazix-writer 写公众号文章；有余力部署上线（Vercel 云函数） |

## 10. 文章计划（D3，使用 /khazix-writer）

- 标题：《把我妹画的涂鸦丢给豆包Seed-2.1-pro，火柴人当场学会二段跳》
- 署名 Xxtaoaooo，文末挂 CSDN 主页；正文首段补全 Seed-2.1-pro-0915 口径；
- 结构：成品动图前置 → 灵感（涂鸦只能躺在纸上）→ 三步流水线拆解（理解面板 + 自检修复证据链截图为主）→ 多轮修改演示 → 豆包工作 Case → 真实感受与边界（含失败/局限，体现活人感）→ 开源地址；
- 禁忌自查：无极限词、无导流词、不拉踩、图片截图与文字对应、重点前置不写流水账。

## 11. 开放验证点（D1 上午处理，不阻塞设计）

1. `doubao-seed-evolving` 图像输入格式细节（OpenAI 兼容 `image_url` base64 是否直通）；
2. Agent Plan 端点沿用二期配置（`https://ark.cn-beijing.volces.com/api/plan`）是否仍有效；
3. 豆包工作 Skills 是否开放自定义（仅影响可选进阶项）。

## 12. 成功标准

- 3 张 fixtures 涂鸦全部端到端生成可玩游戏（含至少 1 次真实的自检修复过程被记录）；
- 本地 `npm start` 一条命令可跑；README 完整；
- 文章按禁忌自查通过，素材（录屏/截图/豆包工作 Case）齐备；
- 有余力：线上可访问入口 + GitHub 仓库公开。
