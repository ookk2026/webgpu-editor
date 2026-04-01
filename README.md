# WebGPU 在线图形编辑器

基于 Three.js + WebGPU 的在线 3D 场景编辑器和播放器。

## 系统要求

- **Node.js** 18.0 或更高版本
- **浏览器**: Chrome 120+, Edge 120+, 或支持 WebGPU 的现代浏览器

## 快速开始

### 1. 安装 Node.js

访问 [nodejs.org](https://nodejs.org/) 下载并安装 LTS 版本。

验证安装：
```bash
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 2. 初始化项目

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

**Windows (CMD):**
```cmd
setup.bat
```

**手动步骤:**
```bash
# 安装 pnpm
npm install -g pnpm

# 安装依赖
pnpm install

# 构建核心包
pnpm build:core

# 启动编辑器
pnpm dev:editor
```

### 3. 访问应用

- **编辑器**: http://localhost:5173
- **播放器**: http://localhost:5174

## 项目结构

```
webgpu-editor/
├── apps/
│   ├── editor/          # 编辑器应用
│   │   ├── src/
│   │   │   └── main.ts  # 编辑器入口
│   │   └── index.html
│   └── player/          # 场景播放器
│       ├── src/
│       │   └── main.ts  # 播放器入口
│       └── index.html
├── packages/
│   └── core/            # 核心引擎包
│       ├── src/
│       │   ├── renderer/     # WebGPU/WebGL 渲染器
│       │   ├── scene/        # 场景管理
│       │   ├── serialization/# 场景序列化
│       │   └── types/        # 类型定义
│       └── package.json
├── examples/            # 示例场景
├── docs/               # 文档
└── package.json        # 根配置
```

## 功能特性

### 已实现
- ✅ WebGPU 渲染，自动降级 WebGL2
- ✅ 3D 视口 + 相机控制 (OrbitControls)
- ✅ 场景图层级面板
- ✅ 属性编辑 (位置/旋转/缩放)
- ✅ 变换工具 (移动/旋转/缩放 Gizmo)
- ✅ 基础几何体创建 (立方体/球体)
- ✅ 光源管理
- ✅ 场景导入/导出 (JSON)
- ✅ 对象选择和高亮

### 待实现
- 🔄 撤销/重做系统
- 🔄 材质编辑器
- 🔄 模型导入 (GLTF/GLB/OBJ)
- 🔄 后处理效果
- 🔄 动画系统
- 🔄 多人协作

## 开发命令

```bash
# 启动编辑器开发服务器
pnpm dev:editor

# 启动播放器开发服务器
pnpm dev:player

# 构建所有包
pnpm build

# 仅构建核心包
pnpm build:core

# 类型检查
pnpm typecheck

# 运行测试
pnpm test
```

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| `T` | 移动工具 |
| `R` | 旋转工具 |
| `S` | 缩放工具 |
| `Delete` / `Backspace` | 删除选中对象 |
| `Ctrl+D` | 复制对象 |
| `Ctrl+Z` | 撤销 |
| `Ctrl+Shift+Z` | 重做 |

## 浏览器兼容性

| 浏览器 | WebGPU | 状态 |
|--------|--------|------|
| Chrome 120+ | ✅ | 推荐 |
| Edge 120+ | ✅ | 推荐 |
| Firefox | ⚠️ Nightly | 需开启 `dom.webgpu.enabled` |
| Safari | ⚠️ 技术预览版 | 等待正式支持 |

## 技术栈

- **渲染**: Three.js r160+ (WebGPU/WebGL)
- **构建**: Vite 5
- **语言**: TypeScript 5
- **包管理**: pnpm
- **Monorepo**: pnpm workspaces

## 许可证

MIT
