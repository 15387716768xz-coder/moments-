# 此刻 — Android 应用搭建指南

## 前置要求

1. **Node.js 18+** — https://nodejs.org
2. **Android Studio** — https://developer.android.com/studio
3. **Android SDK** (通过 Android Studio 安装)
4. **JDK 17** (Android Studio 自带)

## 快速开始

### 1. 安装依赖

```bash
cd 此刻-app
npm install
```

### 2. 配置 API Key

编辑 `src/config.js`，将 `YOUR_ANTHROPIC_API_KEY_HERE` 替换为你的 Anthropic API Key：

```js
export const API_KEY = 'sk-ant-xxxxxxxxxxxxx';
```

### 3. 初始化 Capacitor Android 平台

```bash
npx cap add android
```

这会创建 Android 原生项目。如果 `android/` 目录已存在，跳过此步骤。

### 4. 同步 Web 代码到 Android

```bash
npm run cap:build
```

等价于：
```bash
npm run build
npx cap sync android
```

### 5. 在 Android 设备上运行

#### 方式 A：用 Android Studio 打开

```bash
npx cap open android
```

然后在 Android Studio 中：
- 连接 Android 手机（USB 调试模式）或启动模拟器
- 点击运行按钮 ▶️

#### 方式 B：直接在浏览器测试

```bash
npm run dev
```

然后在 `http://localhost:5173` 打开。注意：浏览器中没有 App 绑定功能。

### 6. 开启无障碍服务

安装应用后：
1. 打开「此刻」app
2. 点击首页右上角的「设置」
3. 在设置页面点击「去开启」按钮→跳转到系统无障碍设置
4. 找到「此刻」并开启无障碍服务
5. 返回「此刻」设置，选择要绑定的 app（如抖音、快手）
6. 保存绑定

### 7. 测试

打开你绑定的 app（如抖音），「此刻」会自动弹出。

## 目录结构

```
此刻-app/
├── src/
│   ├── App.jsx              # 主应用组件
│   ├── App.css               # 全局样式 & 动画
│   ├── main.jsx              # React 入口
│   ├── config.js             # API Key 配置
│   └── plugins/
│       └── app-binding/      # AppBinding 插件 (TS)
│           ├── index.ts      # 插件注册
│           ├── definitions.ts # 类型定义
│           └── web.ts        # Web 端模拟实现
├── android/
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       └── java/com/cike/app/
│           ├── MainActivity.java          # Capacitor 主 Activity
│           ├── AppBindingPlugin.java       # 插件原生实现
│           ├── AppDetectionService.java    # 无障碍服务
│           └── BootReceiver.java          # 开机自启
├── index.html
├── capacitor.config.ts
├── vite.config.js
└── package.json
```

## 自定义

### 修改绑定的计时器时长

编辑 `src/App.jsx`，找到 `{[10, 20, 30].map(...)}` 这段，修改数组中的数值（单位：分钟）。

### 修改 AI 提示词

编辑 `src/App.jsx`，搜索 `system:` 字符串，修改里面的系统提示词。

### 修改主题颜色

编辑 `src/App.jsx` 顶部的 `C` 对象。

## 国内使用注意

- 无障碍服务可能需要在「后台运行」权限中也开启
- 部分国产 ROM（MIUI、ColorOS 等）需要额外在「自启动管理」中允许「此刻」自启
- 可能需要关闭电池优化，防止无障碍服务被系统杀掉
