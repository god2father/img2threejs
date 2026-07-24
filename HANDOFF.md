# img2threejs 透明玻璃杯项目交接说明

更新时间：2026-07-24（Asia/Shanghai）

## 1. 当前任务目标

项目最初目标是根据 `assets/reference-glass.png` 中的单张透明玻璃杯参考图，用纯 TypeScript + Three.js 程序化重建一个可实时浏览的三维模型，尽量保持参考图中的比例、观察角度、透明玻璃颜色、双层杯口和厚杯底特征。

当前已扩展的目标是：

1. 在杯内加入透明清水。
2. 支持通过 URL 参数调整液位或关闭液体。
3. 液体在杯子倾斜时产生延迟、回弹并逐渐恢复世界水平。

当前已经完成“杯内晃动但不倒出”的第一档方案：

- **推荐默认方案：视觉晃动（slosh）**  
  液面根据杯子的角速度、线加速度和重力方向做带阻尼的倾斜与回弹。外观可信、性能稳定，不需要完整流体物理引擎。
- **中等方案：杯子用刚体物理，液体仍用视觉模拟**  
  Rapier/Cannon 等只负责杯子的碰撞和运动；液体的晃动仍由自定义弹簧模型和着色器驱动。
- **高成本方案：可倒出、飞溅、分离的真实流体**  
  需要粒子流体（SPH、MLS-MPM、FLIP 等）、容器碰撞/SDF 和 GPU 计算。普通刚体物理引擎不能直接完成，属于明显扩大的技术范围。

用户已经确认采用第一档视觉晃动方案，当前实现没有引入物理引擎。除非用户后续明确要求“水可以倒出杯子、形成水滴并与环境碰撞”，不要直接升级为完整流体物理。

## 2. 已经完成的内容

### 2.1 参考图分析和规格

- 已复制并保存参考图：`assets/reference-glass.png`。
- 已完成图像尺寸和技术适用性检查：1024×1024 PNG。
- 已判断该对象适合程序化旋转建模：
  - 单一主体。
  - 绕 Y 轴近似旋转对称。
  - 轮廓清晰。
  - 主要结构可由二维剖面旋转得到。
- 已明确单张图片无法恢复精确隐藏面、真实制造尺寸和摄影级焦散，因此当前输出是实时渲染近似，不是光学逆向工程或制造模型。
- 已生成：
  - `sculpt/assessment.json`
  - `sculpt/object-sculpt-spec.json`
- 严格规格校验已通过。
- 原始 img2threejs 分阶段流程已全部完成：
  - blockout
  - structural-pass
  - form-refinement
  - material-pass
  - surface-pass
  - lighting-pass
  - interaction-pass
  - optimization-pass
- `sculpt/object-sculpt-spec.json` 当前状态为 `currentPass: "complete"`。

### 2.2 玻璃杯模型

主实现位于 `src/createGlassModel.ts`。

已实现：

- 封闭的 LatheGeometry 旋转剖面。
- 外壁、圆润杯口、内壁、内腔底面和外部厚杯底。
- 双层杯口：
  - 外部圆润唇边。
  - 内部细唇边。
- 厚重杯底：
  - 基础剖面厚度。
  - 独立光学底环。
  - 内部下凹底面。
- 杯身轻微制造波纹，用于让斜角高光不完全机械平直。
- 物理玻璃材质：
  - `MeshPhysicalMaterial`
  - `transmission: 1`
  - `ior: 1.52`
  - 低粗糙度
  - clearcoat
  - 轻微蓝白衰减色
- 默认优化阶段使用 128 个径向分段；早期外观开发阶段使用 160 个径向分段。
- 模型根节点暴露了 `root.userData.sculptRuntime`，其中包含：
  - nodes
  - meshes
  - sockets
  - colliders
  - destructionGroups
- 还包含 `actionReadiness` 和 `optimization` 元数据，便于后续动作、碰撞或破碎扩展。

### 2.3 液体实现

液体几何位于 `src/createGlassModel.ts`，动态杯体控制位于 `src/liquidSlosh.ts`。

当前液体包含：

- 随内壁锥度变化的圆台侧壁体积。
- 独立弯月面，使用浅凹的 LatheGeometry。
- 液面边缘 Torus 高光。
- IOR 约 1.333 的水材质。
- 轻微蓝青色吸收和透射。
- 底部透明渐隐纹理，避免液体看起来像悬空的实体圆柱。
- 液体作为 `glassPivot` 的子节点，但自由表面通过局部法线反向补偿杯体倾斜。
- 液体节点已加入 `sculptRuntime.nodes` 和 `sculptRuntime.meshes`。
- 水体使用动态世界空间裁切平面；弯月面和裁切平面共享同一阻尼法线。
- 拖动会倾斜杯子本体，而不是旋转相机。
- 杯底中心作为倾斜支点，避免杯子绕几何中心悬空旋转。
- 液面使用二阶弹簧/阻尼响应：
  - 杯子快速倾斜时液面产生延迟。
  - 停止后产生衰减回弹。
  - 稳定后恢复接近世界水平。
- 双击、`Home` 或 `R` 可复位杯子。
- 方向键可进行键盘倾斜。

默认配置：

- 默认启用液体。
- 默认液位为 `0.58`。
- 默认液体颜色为 `#9edff0`。
- 液位在内部被限制到 `0.08`～`0.92`。

URL 参数：

- `http://127.0.0.1:4173/`：默认 58% 液位。
- `http://127.0.0.1:4173/?liquid=0.82`：较高液位。
- `http://127.0.0.1:4173/?liquid=0.2`：较低液位。
- `http://127.0.0.1:4173/?liquid=off`：关闭液体。
- `http://127.0.0.1:4173/?liquid=0`：同样关闭液体，不表示 0% 的最小液位。

已在浏览器中检查：

- 默认液位正面视图。
- 旋转后的视图。
- 82% 高液位。
- 液面未穿出杯口或内壁。
- 浏览器页面应用日志无错误。

相关截图：

- `review/liquid-final.png`
- `review/liquid-front.jpg`
- `review/liquid-rotated.jpg`
- `review/liquid-high.jpg`

### 2.4 场景、灯光和交互

主场景位于 `src/main.ts`。

已实现：

- `OrbitControls`：
  - 鼠标拖动旋转。
  - 滚轮缩放。
  - 禁止平移。
  - 限制缩放距离和垂直旋转角度。
- `RoomEnvironment` + PMREM 环境反射。
- 四盏 RectAreaLight：
  - key
  - fill
  - rear rim
  - overhead
- HemisphereLight。
- ACES Filmic tone mapping。
- 深色渐变背景。
- 软接触阴影圆盘和底部微光。
- `review=1` 模式会隐藏 UI。
- 透明材质验收模式可显示棋盘背景。
- `backdrop=dark` 可强制使用深色验收背景。
- review 模式会把 draw calls、triangles、FPS 和 radialSegments 写入 canvas 的 data 属性。

### 2.5 视觉验收

`review/` 中保存了每个阶段的截图、对照图、分层评分和语义特征评分。

完成的主要对照：

- blockout
- structural（包含一次失败和修正）
- form refinement
- material
- surface
- lighting
- interaction
- optimization
- liquid

优化阶段在加入液体之前记录过：

- 60,288 个渲染三角面。
- 16 次渲染调用。
- 约 58.5 FPS。

加入动态液体后重新记录：

- 66,432 个渲染三角面。
- 23 次渲染调用。
- 约 56.5 FPS。
- 128 个径向分段。

测试环境和窗口状态会影响 FPS，但当前仍接近 60 FPS 目标。

### 2.6 构建状态

2026-07-24 已重新执行：

```powershell
npm run build
```

结果：

- TypeScript 类型检查通过。
- Vite 生产构建通过。
- `dist/` 已更新。

同日重新执行严格规格校验：

```powershell
python "C:\Users\tc\.codex\skills\img2threejs\forge\stage2_spec\validate_sculpt_spec.py" sculpt\object-sculpt-spec.json --strict-quality
```

结果：`PASS`

## 3. 修改过的文件

### 3.1 主要运行代码

- `src/createGlassModel.ts`
  - 玻璃杯程序化几何。
  - 玻璃材质。
  - 双层杯口和厚杯底。
  - 微观制造波纹。
  - 可裁切液体体积、动态弯月面、液面边缘和底部渐隐。
  - `updateLiquidSlosh()` 阻尼液面更新函数。
  - runtime hierarchy、sockets、colliders、optimization 元数据。
- `src/liquidSlosh.ts`
  - 杯底固定的倾斜控制器。
  - 指针拖动、双击复位和键盘控制。
  - 杯体倾斜弹簧。
- `src/main.ts`
  - 渲染器、相机、灯光、环境、OrbitControls。
  - URL 参数解析。
  - 液体开关和液位参数。
  - review 棋盘背景。
  - 性能诊断 data 属性。
- `src/style.css`
  - 全屏场景和 HUD。
  - review 模式。
  - 响应式规则。
  - 对高而窄窗口隐藏 summary，避免文字压到杯口。
- `index.html`
  - 页面结构。
  - 中文可访问性标签。
  - 已更新说明文字，包含透明清水。

### 3.2 工程配置

- `package.json`
- `package-lock.json`
- `tsconfig.json`

### 3.3 规格和生成辅助

- `sculpt/assessment.json`
- `sculpt/object-sculpt-spec.json`
- `tools/author-spec.mjs`
- `src/generatedGlassFactory.ts`

注意：`src/generatedGlassFactory.ts` 是生成器产生的脚手架/参考文件，当前页面实际导入的是 `src/createGlassModel.ts`，不要误改后者却只检查前者，或反过来。

### 3.4 资源和验收证据

- `assets/reference-glass.png`
- `review/` 下全部 JSON、JPG 和 PNG

### 3.5 构建产物

- `dist/`
- `node_modules/`

当前目录已初始化为 Git 仓库，默认分支为 `main`，远程仓库为：

```text
https://github.com/god2father/img2threejs
```

GitHub Pages 通过独立 `gh-pages` 分支发布，源码分支不提交 `dist/`。

## 4. 当前代码运行状态

### 4.1 本地服务

检查时间：2026-07-24。

端口 `4173` 当前由开发服务器监听，最近一次启动进程 ID 为 `28464`。新会话开始时仍应重新检查端口，不能仅凭浏览器标签判断服务状态。

如果服务已停止，重新启动：

```powershell
npm run dev -- --port 4173
```

### 4.2 构建

当前生产构建通过，`dist/` 已更新。

### 4.3 页面功能

已确认可用：

- 杯体显示。
- 玻璃透射和反射。
- 默认静态清水。
- URL 调节液位。
- URL 关闭液体。
- 拖动倾斜杯子。
- 液面延迟、回弹并恢复水平。
- 动态水体裁切。
- 双击/键盘复位。
- 滚轮缩放。
- 高液位不穿出杯口。
- 浏览器应用日志无错误。

### 4.4 测试

项目没有自动化测试、lint 脚本或单独的 typecheck 脚本。

当前最小可靠检查是：

```powershell
npm run build
```

它会执行：

```text
tsc --noEmit
vite build
```

视觉改动必须在浏览器中实际检查，不能只看代码。

## 5. 已确认的技术方案和重要决定

### 5.1 几何方案

- 杯子是旋转对称对象，采用 LatheGeometry 剖面旋转，不采用外部 GLB/OBJ。
- 内外壁、杯口和杯底由一个封闭剖面形成，避免纯薄壳。
- 杯口和杯底再增加局部 Torus 强化光学边缘。
- 液体使用锥形侧壁体积 + 独立弯月面，不使用单纯水平平面。

### 5.2 材质方案

- 杯子使用 MeshPhysicalMaterial 的 transmission/IOR。
- 液体使用独立 MeshPhysicalMaterial，IOR 为 1.333。
- 透明物体叠加并不是严格的多层光线追踪；当前是为 WebGL 实时展示做的稳定近似。

### 5.3 透明排序方案

这是当前实现最重要的决定：

- 玻璃外壳保留 `depthWrite: true`，因为把整个玻璃改成 `depthWrite: false` 会破坏杯底和内壁的视觉层次。
- 液体使用：
  - `depthTest: false`
  - `depthWrite: false`
  - 较高 `renderOrder`
- 当前 renderOrder 大致是：
  - 杯壳：1
  - 杯底和内底：2
  - 内杯口：3
  - 液体体积：8
  - 液体弯月面：9
  - 液面边缘：10
  - 外杯口：12

这不是物理正确的透明组合，但在当前相机和模型中能稳定显示杯中水。继续开发时不要随意重排这些值。

### 5.4 液体底部融合

- 没有保留独立液体底盖。
- 独立底盖曾产生明显“悬空暗圆盘”。
- 当前液体侧壁使用程序化 DataTexture 作为 alphaMap，让靠近杯底的透明度逐渐衰减。

### 5.5 动态液体已采用的方案

“水随着杯子流动”已经使用分析式 slosh 完成，没有引入完整物理引擎：

1. `src/liquidSlosh.ts` 维护杯体目标倾角、当前倾角和倾角速度。
2. 杯子以底部中心为固定支点倾斜，最大合成倾角为 0.28 弧度。
3. `updateLiquidSlosh()` 把世界向上方向转换到杯子局部空间，得到目标液面法线。
4. 当前液面法线通过二阶弹簧/阻尼追踪目标法线。
5. 弯月面枢轴根据当前法线旋转。
6. 水体材质使用同一世界空间 clipping plane，裁掉自由液面上方的片元。
7. 水体几何向原始液位上方预留高度，确保倾斜裁切后高侧仍有可见体积。
8. 最大杯体倾角受到限制，当前不允许倒水。

如果杯子还需要碰撞、抛掷和落地：

- 可以加入 Rapier 或 Cannon 作为杯子刚体。
- 物理引擎只提供杯子的 transform、速度和加速度。
- 液体晃动仍由上述自定义模型完成。

只有明确要求可倒出/飞溅时，才考虑 WebGPU 粒子流体。

## 6. 当前存在的问题和报错

### 6.1 尚未实现

- 液体不能倒出杯子。
- 没有水滴、飞溅、泡沫或碰撞。
- 液体颜色暂时不能通过 URL 修改，只能改工厂参数或代码。
- 当前晃动由旋转/重力方向驱动，尚未加入杯子线加速度造成的额外惯性。
- 当前体积守恒是近似的：裁切平面穿过固定液位中心，没有对锥形杯内截面积做积分补偿。

### 6.2 已知视觉近似

- `depthTest: false` 会让液体在极端观察角度下可能覆盖本应位于其前方的玻璃高光。
- 深色背景下液面中心会较亮，这是实时透射、区域光和非路径追踪透明组合的结果。
- 当前液体是视觉体积，不是真正求解的自由表面。
- 单张参考图本身是空杯，液体颜色和高度属于用户追加设计，不是参考图复原内容。

### 6.3 构建警告

Vite 构建会提示主 JS chunk 超过 500 kB：

```text
Some chunks are larger than 500 kB after minification
```

当前构建结果约：

- 未压缩 JS：809.12 kB
- gzip：245.37 kB

这不是构建失败，不影响当前功能。主要原因是 Three.js 和相关 examples 模块集中在一个入口包中。只有用户要求优化首次加载或生产部署时，再考虑手动分包/动态导入。

### 6.4 服务状态

- 4173 端口当前有开发服务器监听。
- 新会话仍需通过端口或 HTTP 请求确认，浏览器标签存在不等于服务持续运行。

### 6.5 工具层噪声

开发过程中曾出现 Codex 内置浏览器自身的 Statsig 网络超时：

```text
[Statsig] A networking error occurred ...
Timeout of 10000ms expired
```

这是 Codex 浏览器遥测请求，不是本项目代码报错。项目页面的应用错误日志检查结果为空。

### 6.6 版本管理

- 当前目录是 Git 仓库。
- 默认分支：`main`。
- 远程：`origin` → `https://github.com/god2father/img2threejs.git`。
- Pages 发布分支：`gh-pages`。
- 公开页面目标：`https://god2father.github.io/img2threejs/`。
- 修改前先检查 `git status -sb`，不要回滚未确认的用户改动。

## 7. 下一步应该执行什么

建议按以下顺序继续：

### 第一步：启动和确认当前基线

```powershell
npm run dev -- --port 4173
```

打开并检查：

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/?liquid=0.82
http://127.0.0.1:4173/?liquid=off
```

确认当前静态效果与 `review/liquid-final.png` 一致。

### 第二步：向用户确认动态目标

如果用户没有进一步说明，推荐直接按“杯内晃动但不倒出”的方案实现。

只有用户明确说需要倒出/飞溅时，才升级为粒子流体方案。

### 第三步：继续完善动态液体（可选）

当前 slosh 和 clipping plane 已完成。若继续提高真实性，优先顺序是：

1. 加入杯子线加速度对有效重力的影响。
2. 根据锥形杯内截面积修正倾斜液面中心高度，提高体积守恒准确度。
3. 在液面增加非常轻微的程序化波纹，幅度与 `normalVelocity` 关联。
4. 为移动设备降低水体径向分段或增加质量档位。

### 第四步：视觉和性能验证

至少检查：

- 静止时液面回到水平。
- 快速左右旋转时液面延迟并回弹。
- 突然停止时出现衰减振荡。
- 低液位和高液位都不穿壁。
- 正面、斜角和俯视角无明显透明排序错误。
- `?liquid=off` 不受动态逻辑影响。
- 记录加入动态逻辑后的 FPS、draw calls 和 triangles。

### 第五步：如需要，再接刚体引擎

如果用户要杯子掉落、碰撞或被抛掷：

- 推荐用 Rapier 管理杯子刚体。
- 把 Rapier 的 transform、线速度和角速度喂给 slosh 模块。
- 不要期待 Rapier/Cannon 自动模拟杯中水。

## 8. 项目的启动、构建和测试命令

所有命令在项目根目录执行：

```powershell
Set-Location "C:\Users\tc\Documents\img2threejs"
```

### 安装依赖

```powershell
npm install
```

### 启动开发服务器

默认 Vite 端口：

```powershell
npm run dev
```

固定使用本项目之前的 4173 端口：

```powershell
npm run dev -- --port 4173
```

### 生产构建

```powershell
npm run build
```

该命令同时完成 TypeScript 检查和 Vite 构建。

### GitHub Pages 构建

```powershell
npm run build:pages
```

该命令使用 `/img2threejs/` 作为 Vite base，生成适合项目 Pages 地址的 `dist/`。

### 预览生产构建

```powershell
npm run preview -- --port 4173
```

### 严格规格校验

```powershell
python "C:\Users\tc\.codex\skills\img2threejs\forge\stage2_spec\validate_sculpt_spec.py" sculpt\object-sculpt-spec.json --strict-quality
```

### 查看 img2threejs 阶段状态

```powershell
python "C:\Users\tc\.codex\skills\img2threejs\forge\stage3_build\orchestrate_passes.py" status sculpt\object-sculpt-spec.json
```

期望状态：

```text
currentPass: complete
```

### 检查 4173 服务

```powershell
Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
```

或：

```powershell
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:4173/"
```

### 手动视觉测试 URL

```text
http://127.0.0.1:4173/
http://127.0.0.1:4173/?liquid=0.2
http://127.0.0.1:4173/?liquid=0.58
http://127.0.0.1:4173/?liquid=0.82
http://127.0.0.1:4173/?liquid=off
http://127.0.0.1:4173/?review=1&backdrop=dark&liquid=0.58
http://127.0.0.1:4173/?review=1&liquid=0.58
```

项目当前没有：

- `npm test`
- `npm run lint`
- 独立 `npm run typecheck`

不要在文档或汇报中声称存在这些测试。

## 9. 不要重复尝试的方法

### 9.1 不要把整个玻璃材质改成 `depthWrite: false`

已经尝试过。结果：

- 内部底面和杯底会出现错误的明亮圆盘。
- 多层玻璃排序失真。
- 杯底结构看起来分离。

当前玻璃外壳必须保留 `depthWrite: true`，除非整体透明方案被系统性重写。

### 9.2 不要让液体先于玻璃渲染，并期待 transmission 自动合成

已经尝试过较低 renderOrder。

结果：液体几乎完全不可见。Three.js 的实时 transmission 不是完整的多层透明光线追踪，不能假设玻璃会正确采样另一个透明对象。

### 9.3 不要让液体保持普通 `depthTest: true` 放在玻璃后面

玻璃外壳写入深度后，内部液体会被深度测试挡掉。

当前可用近似是液体 `depthTest: false`、`depthWrite: false` 并在杯壳之后渲染。

### 9.4 不要使用高不透明度蓝色水体

已经尝试过约 0.42 的不透明度和较强蓝色。

结果：

- 看起来像实心蓝色塑料圆柱。
- 破坏透明玻璃效果。

当前较低 opacity、较高 transmission 和底部渐隐效果更合适。

### 9.5 不要恢复独立液体底盖

独立 CircleGeometry 底盖曾形成明显的悬空暗椭圆。

当前采用开放侧壁 + alphaMap 底部渐隐。除非改成真正的裁切/体积着色器，不要重新加入可见底盖。

### 9.6 不要只旋转液面网格来模拟流动

如果只旋转弯月面：

- 水体侧壁上边界仍保持水平。
- 液面会与水体分离。
- 高倾角下会穿过杯壁。

必须同时引入自由液面裁切或几何变形。

### 9.7 不要仅仅为了液体晃动就加入刚体物理引擎

Rapier/Cannon 等主要解决刚体、碰撞和约束，不会自动产生杯中水的自由表面。

若只需要“看起来会晃”，自定义弹簧模型更直接、稳定、可控。

### 9.8 不要把浏览器已打开的 URL 当作服务健康检查

项目曾出现浏览器标签仍指向 4173、但端口已经停止监听的情况。始终用端口或 HTTP 请求确认。

### 9.9 不要只读代码就宣布视觉修改成功

透明玻璃和嵌套液体的错误经常只能从实际渲染发现。每次改材质、renderOrder、深度设置、液位或相机后都要截图检查。

## 10. 继续开发时需要特别注意的事项

### 10.1 保护现有透明排序

修改以下值前必须做前后截图：

- `depthTest`
- `depthWrite`
- `renderOrder`
- `transmission`
- `opacity`
- `side`

尤其是：

- 玻璃杯壳。
- 内部底面。
- 液体体积。
- 弯月面。
- 液面边缘。
- 外杯口。

### 10.2 动态液面要在杯子局部空间计算

杯子本身可能旋转、移动或以后由物理引擎控制。

液面目标法线应从世界有效重力转换到杯子的局部空间，再驱动局部 liquid 节点或 shader。不要直接把世界欧拉角写到液面。

### 10.3 使用固定时间步或限制 delta

弹簧晃动容易在浏览器切换标签、帧率下降或断点恢复后爆炸。

应：

- 限制单帧 delta。
- 必要时使用固定步长累计器。
- 给弹簧速度设置合理上限。
- 页面失焦后避免使用巨大的恢复帧 delta。

### 10.4 保持体积近似守恒

倾斜液面时不要简单上下平移到任意位置。

至少应：

- 以杯内有效横截面为依据修正液面高度。
- 对最大倾角设置限制。
- 高液位时更严格限制液面边缘高度。

### 10.5 倒水是另一套系统

一旦允许液面超过杯口：

- 必须计算溢出量。
- 杯内体积需要减少。
- 杯外需要生成粒子/水流。
- 需要容器与环境碰撞。
- 透明渲染和性能成本都会显著上升。

不要把“晃动”原型逐步堆补丁变成“倒水”系统；如果用户确认要倒水，应先重新设计架构。

### 10.6 重新测量性能

当前动态液体记录为约 56.5 FPS、66,432 triangles、23 calls。

继续修改动态液体后，至少在以下状态重新测量：

- 静止。
- 持续旋转。
- 高液位。
- review 棋盘背景。

### 10.7 保持参数兼容

现有 URL 参数可能被验收截图或用户书签使用：

- `stage`
- `review`
- `backdrop`
- `liquid`

不要随意改变语义。

特别是：

- `liquid=0` 当前代表关闭。
- 数字液位限制为 0.08～0.92。

### 10.8 不要误改未使用的生成文件

页面使用：

```ts
import { createClearTumblerModel } from './createGlassModel';
```

`src/generatedGlassFactory.ts` 当前不是主运行入口。实现功能时优先修改 `src/createGlassModel.ts`，并用 `rg` 确认真实引用关系。

### 10.9 响应式 UI

高而窄窗口中，HUD 文字曾压到杯口。

`src/style.css` 已增加：

```css
@media (max-width: 900px) and (min-height: 850px) {
  .summary { display: none; }
}
```

如果调整相机、模型尺寸或 HUD，应同时检查：

- 768×768。
- 约 830×980 的高窗口。
- 小于 640 px 的窄屏。

### 10.10 交付前最小检查清单

1. `npm run build` 通过。
2. 严格规格校验 `PASS`。
3. 开发服务器真实监听。
4. 默认液位正常。
5. 低液位正常。
6. 高液位不穿壁。
7. `liquid=off` 正常。
8. 拖动和缩放正常。
9. 浏览器应用错误日志为空。
10. 实际查看最终截图，而不是只检查代码。
