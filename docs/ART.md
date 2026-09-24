# 视觉素材记录

## 风格与构图

以用户提供的农场游戏截图作为视角与氛围参考，生成原创场景，未从参考图截取可用游戏资产。自然绿色草地、棕色木屋与陶瓦屋顶；右侧巨大的粉色桃树包围一处暖亮树洞。石子路连接小屋和树洞，小菜园与溪流只作装饰。

画面是像素插画风格的整体背景，不是已经拆好的像素瓦片或可行走地图。前端书信界面用米色纸张、旧玫瑰色按钮、细框、邮戳和中文楷体形成对应。字体来自本机系统，没有远程字体请求。

## 生成与交付

- 使用内置 `imagegen` 工具：先生成场景与透明背景小猫，再按用户补充的俯视参考修改场景。
- 场景最终提示重点：original cozy 16-bit farming-game courtyard, high oblique overhead, no sky/horizon, natural green grass, brown timber cottage left, large peach tree right with visible glowing hollow, pink blossoms rather than a whole-scene pink tint, no text/UI/watermarks or copied game assets。
- 小猫提示重点：透明背景、奶油色、小型像素精灵、清晰深色描边、可辨识的耳朵尾巴与眼睛，用作鼠标与换色预览。
- `scripts/prepare-art.mjs` 仅做交付压缩：场景保留生成尺寸，编码为 WebP；小猫压到 192 像素。原始生成文件留在本机生成目录，不包含在公开仓库中。
- `public/assets/garden.webp` 为使用中的场景；`public/assets/cat.webp` 为猫咪基础纹理。运行时由小画布对浅色毛发着色，再生成 40 像素系统光标；原图不被改写。

花瓣是少量 CSS 粒子，不需要每帧向服务器请求。用户可以关闭，系统减少动态效果设置也会关闭动画。点击树洞、按钮焦点与移动端信纸均用语义 HTML 实现。
