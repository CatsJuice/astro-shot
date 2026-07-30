# AstroShot · 真实星空与流星模拟器

一个从地球观测视角出发的交互式星空模拟器。项目使用真实恒星星表绘制可见星空，包含恒星闪烁、地球自转、可拖拽视角、银河轮廓、普通流星，以及带高光、长尾和残影的分级火流星。

## 本地运行

需要 Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

默认开发地址为 `http://localhost:3002/`。可使用以下命令完成生产构建和测试：

```bash
npm test
```

## GitHub Pages 部署

GitHub Pages 是项目的默认生产部署方式。默认的 `npm run build` 会执行
Next.js 静态导出并生成 `out/`；推送到 `main` 后，
`.github/workflows/deploy-pages.yml` 会自动构建、测试并发布该目录。

仓库首次启用时，需要在 GitHub 的 **Settings → Pages → Build and
deployment → Source** 中选择 **GitHub Actions**。之后每次推送到 `main`
都会更新站点，也可以在 Actions 页面手动运行部署工作流。

工作流会从 GitHub Pages 自动取得站点 URL 和仓库子路径，所以项目页、
用户/组织主页以及自定义域名都不需要手工修改配置。若要在本地模拟
`https://catsjuice.github.io/astro-shot/` 的子路径构建，可运行：

```bash
NEXT_PUBLIC_BASE_PATH=/astro-shot \
NEXT_PUBLIC_SITE_URL=https://catsjuice.github.io/astro-shot \
npm test
```

构建完成后可用 `npm start` 在 `http://localhost:3002/` 预览 `out/`。
原有 Sites/Cloudflare 构建仍作为可选兼容路径保留，可使用
`npm run build:sites`。

## 数据来源

- 恒星数据：HYG Database v4.1，整合 Hipparcos、Yale Bright Star 与 Gliese 星表，数据采用 CC BY-SA 4.0。
- 银河轮廓：ESO / S. Brunier 的全天银河全景，经低对比度处理后仅用于表现银河平面的轻微结构。

流星不再作为固定在屏幕上的二维覆盖层存储。生成时会把屏幕轨迹反投影为
观测者本地天球上的单位向量，运动、长尾与残影都保留同一组天空坐标，
每一帧再使用当前相机姿态重新投影。因此拖拽或用方向键旋转视角时，流星
会和所处的天空区域一起移动，不会粘在镜头上。流星属于大气现象，所以
它绑定的是本地地平坐标，而不是恒星星表使用的赤经/赤纬；恒星仍会按
地球自转速度独立转动。

## Liquid Glass 实现与致谢

右下角参数菜单严格复刻
[AndrewPrifer/liquid-dom](https://github.com/AndrewPrifer/liquid-dom)
的
[MenuDemo.tsx](https://github.com/AndrewPrifer/liquid-dom/blob/master/demo/showcase/src/demos/MenuDemo.tsx)。
除后续按产品需求放大的面板尺寸外，没有添加自定义主题或动画曲线：

- 按钮为 50 × 50，收起玻璃为 40 × 40；
- 桌面菜单放大为 400 × 680；关闭圆角为 130，打开圆角按内层胶囊与
  20px 间距的共心关系调整为 40；
- 内容关闭态 blur 为 8、scale 为 2；
- 玻璃参数原样使用 `spacing=37`、`bezelWidth=70`、
  `thickness=40`、`blur=20`；tint 按产品需求改为暗色
  `rgba(40, 40, 40, 0.4)`，
  黑色阴影 alpha 0.14、`shadowOffsetY=18`、`shadowBlur=46`、
  `specularOpacity=0.7` 与 `displacementBlur=20`；
- 菜单与按钮的弹簧、缓动配置逐项沿用上游实现，例如按钮打开位置
  `stiffness / damping = 499 / 22`，菜单打开位置为 `144 / 14`，
  菜单尺寸使用 0.3 秒的 `cubic-bezier(0.8, 0.3, 0.5, 0.8)`；
- 按钮三点图标、内容排版、黑白配色、hover 背景及 140ms 过渡均按
  `MenuDemo.module.css` 处理。

面板默认按当前内容的自然高度展开，分组开合时通过 `ResizeObserver`
重新测量；玻璃高度和底部锚点逐帧跟随 Collapse 已经产生的布局变化，
不会再次触发菜单打开时的尺寸 easing 或位置弹簧。桌面端 680px、移动端
50vh 仅作为最大高度，超过后才在面板内部滚动。

为适配最高 680px 的面板，关闭时高度使用 0.18 秒先行收拢，
避免高纵横比在中途形成竖向胶囊；内容 opacity 在 0.08 秒内先淡出，
blur 与 scale 在 0.12 秒内完成收起，随后玻璃轮廓继续关闭。
由于本项目是直接采样 Canvas 的 GLSL 移植版，菜单与按钮的移动中心显式
共用菜单位置 spring，保证 smooth-union 在展开和收起全程保持单一轮廓。

本项目没有直接使用 `@liquid-dom/react`，也不依赖 HTML-in-Canvas。
唯一的渲染替换是按需求让玻璃直接采样现有星空 Canvas：使用独立透明
WebGL2 Canvas，并将上游 `GLASS_SHADER` 的圆角 SDF、液体融合、曲面法线、
折射、反射和镜面高光逻辑移植到 GLSL。由于没有内容图集，
上游只作用于 HTML-in-Canvas 内容纹理的 `contentIor/contentDepth` 路径
不适用；可见的内容 opacity、blur 和 scale 动画保持上游参数。

相关实现位于 `app/LiquidGlassMenu.tsx`。感谢 Liquid DOM contributors
公开其实现与示例；上游仓库中的许可声明与版权归原作者及贡献者所有。

## 主要控制

- 拖拽：旋转观测视角
- 滚轮：调整视场角
- 方向键：微调视角
- 右下角圆形按钮：展开参数菜单
- 点击菜单外空白区域或按 `Escape`：关闭菜单
- 参数面板右上角的“中 / EN”：切换简体中文与英文
- 参数分组标题：展开或收起该组；初始状态下全部收起
- 天空色相：完整 `0–360°` 色相范围；`240°` 附近为标准蓝色
- 天空饱和度：默认 40% 保持原有自然夜空，提升至 100% 可获得浓郁蓝色

色相滑块使用完整彩虹色带；饱和度滑块会随当前色相实时更新为从中性灰到
纯色的渐变，因此无需只靠数值判断最终色彩方向。

参数菜单处于收起状态时，鼠标连续 2 秒没有移动或点击，圆形玻璃入口会
自动淡出；任意移动或点击会重新显示。隐藏状态不拦截星空画布交互。

参数分组的开合动画参数来自本地 Cue 组件库的 `Collapse`：高度容器使用
`180ms cubic-bezier(0.006, 0.522, 0.252, 0.968)`，内容使用
`200ms cubic-bezier(0.004, 0.505, 0.202, 0.918)`，隐藏态为
`opacity: 0`、`scale(0.98)` 与 `translateY(-10px)`。

移动端仅按产品需求覆盖 MenuDemo 的菜单尺寸：展开至视口高度的 50%，
菜单左右与底部各保留 14px 间距，并适配安全区域；其余玻璃参数和动画
不变。

界面国际化由内置类型安全词典提供，首次访问会参考浏览器语言，手动选择
会写入 `localStorage` 并在后续访问中恢复；页面标题、面板内容、按钮和
无障碍标签会同步切换。
