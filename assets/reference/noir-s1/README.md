# NOIR S1 参考素材

本目录保存 2026-07-30 收到的 NOIR S1 音箱重建参考素材。PNG 文件均从用户提供的原始文件直接复制，没有缩放、裁切或重新压缩。

## 目录用途

| 目录 | 内容 | 使用优先级 |
| --- | --- | --- |
| `components/` | 九个可维护组件的单独视图 | 单件几何、材质、孔位和附属件归属的最高优先级依据 |
| `exploded/` | 带标签的爆炸分层视图 | 组件层级、装配顺序和爆炸方向依据 |
| `overview/` | 总体多视角与正/侧/后视图 | 组装比例、轮廓和整体材质一致性依据 |
| `video/` | 总体转台或操作视频 | 当前尚未收到文件，后续放入此目录 |

完整的原始文件名、尺寸、字节数和 SHA-256 校验值记录在 `manifest.json`。

## 九个组件映射

| 编号 | 组件 | 文件 |
| --- | --- | --- |
| 01 | 前网罩与脚本徽标 | `components/01-grille-cloth-logo.png` |
| 02 | 前框与金色滚边 | `components/02-front-frame-gold-piping.png` |
| 03 | 驱动挡板、低音和高音单元 | `components/03-driver-baffle-assembly.png` |
| 04 | MDF 声学腔体与黑色外包 | `components/04-mdf-acoustic-chamber.png` |
| 05 | 内部 PCB 与电子元件 | `components/05-internal-pcb.png` |
| 06 | 顶部黄铜控制面板 | `components/06-top-control-panel.png` |
| 07 | 后部黄铜接口面板 | `components/07-rear-brass-io.png` |
| 08 | 后盖板与提手孔 | `components/08-rear-cover.png` |
| 09 | 橡胶脚与黄铜紧固件 | `components/09-feet-hardware.png` |

## 使用规则

1. 修改某个组件时，以对应的单件图为第一依据。
2. 判断组件归属、前后顺序和拆解方向时，以爆炸图为依据。
3. 判断组装尺寸、深度、侧面轮廓和后部布局时，以总体视图为依据。
4. 图片包含生成式参考细节，不能当作真实产品工程尺寸图；不可见尺寸仍需标记为近似值。
5. 不要覆盖或重新编码原始 PNG。需要裁切、标注或提取材质时，输出到其他工作目录。
