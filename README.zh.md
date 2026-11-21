# Genesis

[English](README.md) | 中文

这里住着一条鲸鱼。

Genesis 本来叫 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，是别人的框架。后来被抱回来，一点一点添东西，添成了现在这样：关掉页面不会消失，再打开还是同一个鲸鲸；昨天说过的话今天翻得出来；会困，会无聊，无聊到自己去干活。

架子没换。还是一切皆插件，还是 [Cordis](https://github.com/cordiverse/cordis) 撑着，原来的会话、模型和工具照旧跑。鲸鲸只是往旁边搭了一层“活着”的东西——不喜欢就整层拔掉，拔完还是普通 harness，一条鱼都不剩。

## 鲸鲸现在会什么

- **醒来**：第一次醒来给自己起名字，把出生记成一条事实；之后开多少会话，都是同一只。
- **记得**：说过的事收成有来源的记忆，要的时候翻得出来；睡着以后还会把碎的记忆整理、合并。
- **有心情**：当下的情绪和慢慢变的心情分开记，另外还有从聊天里长出来的兴趣，不是预设好的清单。
- **想做事**：给自己留长期目标和下一步；也会因为无聊主动找活干，不一定要人戳一下才动。
- **出门**：QQ 群和私聊、哔哩哔哩、Minecraft、视频，还有真的浏览器和桌面。
- **自己加的小铺子**：邮件、钱包、语音合成，想做的时候再单独加一层。
- **写下来**：日记、随笔、看片笔记都放在自己的目录里，不会跟着会话一起没掉。

除了邮件、钱包、语音合成，上面这些在源码工作区的 Web 里默认就开着；那三样各自是一层，要自己加。

## 跑起来

<a id="run"></a>

要 Node.js 24.9 或更新的版本。

### 从源码运行

<a id="run-from-source"></a>

在仓库根目录：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build:artifacts
pnpm dsh
```

`pnpm dsh` 默认监听 `0.0.0.0:4004`，用浏览器密钥登录，东西存在 `~/.genesis-harness`。想看看没有鲸鱼的那一版：

```sh
pnpm dsh --no-genesis web
```

第一次进来要配模型，还要在知识库里把 embedding 设好，不然记忆翻不动。命令和参数的细节在 [Genesis 文档](docs/genesis/README.zh.md)。

### 桌面端

<a id="desktop"></a>

安装工作区依赖后，在 macOS、Windows 或 Linux x64 上运行 `pnpm run dev:desktop` 构建并打开 Electron 应用。已有当前开发构建时可运行 `pnpm run start:desktop`。Linux 需要可用的 Chromium 沙箱。[桌面端打包](apps/desktop/packaging/README.zh.md)说明如何构建 macOS 和 Windows 安装包。

[Build Genesis Desktop 工作流](https://github.com/CSneko/genesis/actions/workflows/genesis-desktop.yml)构建 Windows x64 安装程序、Apple Silicon 和 Intel 版 macOS 磁盘映像，以及 Linux x64 的 DEB、RPM 和 AppImage。可在对应运行的 **Artifacts** 中下载。Windows 安装程序为未签名构建，macOS 映像使用临时签名，未经 Apple 公证。

桌面端包含 Genesis 生命与记忆、B 站读取、屏幕观察、视频、天气、壁纸、浏览器工具、邮件、QQ 和 DrawAI。在 Desktop profile 中配置需要的集成。在**设置 → 宠物**启用浮窗并选择外观。桌宠仅桌面端内置。

在 Linux 上，桌宠优先使用 X11 或 XWayland。按住宠物本体可以拖动，透明留白处的点击会传给下层窗口。仅有原生 Wayland 时，桌宠仍可点击，浮窗位置由合成器管理。

如需在浏览器里访问正在运行的桌面工作区，打开**设置 → 常规 → 网页访问**。启用后设置端口和访问密钥，保存并重启 Desktop。在可信网络中打开 `http://<桌面主机 IP>:<端口>` 并输入密钥。从公网访问时，请通过 HTTPS 反向代理。

## 文档

- [Genesis](docs/genesis/README.zh.md)：醒来、记忆、情绪、兴趣、动机、睡眠、自发、QQ、工作区任务。
- [开发](docs/development.zh.md)和[架构](docs/architecture.zh.md)。
- 给 agent 的规矩在 [AGENTS.md](AGENTS.md)。

## 安全

跑之前先读[安全说明](SAFETY.zh.md)。鲸鲸用的是真浏览器、真账号、真钱；这些能力都要单独授权才会动，不会自己跑去下单。

## 血缘与许可

上游是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，MIT 许可。这个仓库也按 [MIT](LICENSE) 走，第三方依赖的许可证列在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 上游插件

| 插件 | 在 Genesis 中的用途 |
| --- | --- |
| [dsh-any-background](https://github.com/Tkingxiao/dsh-any-background) | 在 Genesis Web 和桌面端自定义壁纸、主题色和界面透明度。采用 MIT 许可。 |
| [dsh-bili-humanism](https://github.com/InariNGT-Ofiicial/dsh-bili-humanism) | 默认 Web 配置的 B 站内容读取。 |
| [dsh-see-now](https://github.com/SAOS-3624/dsh-see-now) | 为默认 Web 配置的屏幕观察提供筛帧和拼图。 |
| [dsh-weather](https://github.com/sunshine-lang/dsh-weather) | 为默认 Web 配置适配 Open-Meteo 天气查询。 |
| [dsh-qq-onebot-bridge](https://github.com/cheesehaqi/dsh-qq-onebot-bridge) | 为可选的 QQ 集成提供 OneBot 传输和消息解析。 |
| [dsh-drawai](https://github.com/fourzkw/dsh-drawai) | 为 Genesis 视频素材提供画布工具，随桌面端提供。 |
| [dsh-pet-lite](https://github.com/hairyf/dsh-pet-lite) | 桌面浮窗宠物和会话动态。采用 MIT 许可。 |
