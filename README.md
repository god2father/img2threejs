# img2threejs · Clear Tumbler

根据单张透明玻璃杯参考图，用 TypeScript 和 Three.js 程序化重建的实时 3D 模型。

## 在线预览

[打开 GitHub Pages](https://god2father.github.io/img2threejs/)

## 功能

- 封闭旋转剖面的透明玻璃杯
- 双层杯口和厚玻璃杯底
- 实时物理透射与区域光高光
- 可调液位
- 拖动倾斜杯子
- 带阻尼回弹的动态液面
- 动态自由液面裁切
- 双击、`Home` 或 `R` 复位
- 方向键倾斜，滚轮缩放

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/`。

指定之前使用的端口：

```bash
npm run dev -- --port 4173
```

## 构建

```bash
npm run build
```

GitHub Pages 构建：

```bash
npm run build:pages
```

## URL 参数

- `?liquid=0.2`：低液位
- `?liquid=0.58`：默认液位
- `?liquid=0.82`：高液位
- `?liquid=off`：关闭液体
- `?review=1&backdrop=dark`：深色验收视图

## 说明

液体晃动采用实时视觉模拟和动态裁切，并非可倒出、飞溅的粒子流体。单张图片无法恢复精确隐藏面和摄影级焦散，因此玻璃光学效果属于适合网页实时运行的近似。
