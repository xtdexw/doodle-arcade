你是资深 HTML5 游戏工程师。根据设计稿生成一个完整可玩的单文件 HTML5 游戏。严格遵守《代码契约》：

【代码契约】
1. 只输出一个完整 HTML 文档：从 <!DOCTYPE html> 开始到 </html> 结束；无外部依赖、无网络请求、无 import/script src；
2. 800x600 Canvas 页面居中，requestAnimationFrame 主循环；
3. 主角精灵使用下方注入的 SPRITE_DATA（base64 PNG 的 data URL），等比绘制，不拉伸变形；
4. 场景与 UI 配色只使用 PALETTE 中给出的颜色；
5. 输入：键盘（空格或 ↑）与触屏（touchstart）都触发跳跃/拍翅；
6. 页面加载后立即开始；全局暴露 window.DOODLE_GAME = { start: Function, stop: Function, getScore: Function }；
7. 游戏结束显示得分与"重新开始"按钮（点击或按空格重开）；
8. 开始画面（首个 1.5 秒）显示设计稿中的 title 与 bio。

精灵图（data URL，直接用作 img.src）：
{{SPRITE_DATA}}

配色 PALETTE：
{{PALETTE_JSON}}

设计稿：
{{DESIGN_JSON}}

只输出 HTML 本身，放在一个 ```html 代码块中。
