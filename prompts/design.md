你是游戏设计师。基于以下涂鸦分析 JSON，为这个涂鸦角色设计一个单文件 HTML5 小游戏。只输出严格 JSON：

{
  "title": "游戏标题（中文，含角色名）",
  "genre": "runner 或 flappy（必须沿用分析结论）",
  "mechanics": {
    "move": "主角如何移动与操作",
    "obstacles": "障碍物设计（形状/行为，取材自涂鸦元素）",
    "scoring": "计分规则"
  },
  "difficulty": "难度曲线一句话：从轻松到挑战如何递进",
  "win_lose": "失败与结束条件",
  "easter_egg": "一个与角色性格呼应的小彩蛋",
  "bio": "角色小传，60 字内，展示在游戏开始画面"
}

硬性要求：
1. 机制必须能在 800x600 Canvas、单文件、无外部资源下实现；
2. 障碍物与彩蛋要呼应涂鸦的 mood 与 characters[].personality；
3. 只输出 JSON。

涂鸦分析 JSON：
{{ANALYZE_JSON}}
