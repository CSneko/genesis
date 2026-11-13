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

除了邮件、钱包、语音合成，上面这些在源码工作区的 Web 里默认就开着；那三样各自是一层，要自己加。上游的 profile 和 Desktop 还是原来的样子。

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

## 文档

- [Genesis](docs/genesis/README.zh.md)：醒来、记忆、情绪、兴趣、动机、睡眠、自发、QQ、工作区任务。
- [开发](docs/development.zh.md)和[架构](docs/architecture.zh.md)。
- 给 agent 的规矩在 [AGENTS.md](AGENTS.md)。

## 安全

跑之前先读[安全说明](SAFETY.zh.md)。鲸鲸用的是真浏览器、真账号、真钱；这些能力都要单独授权才会动，不会自己跑去下单。

## 血缘与许可

上游是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，MIT 许可。这个仓库也按 [MIT](LICENSE) 走，第三方依赖的许可证列在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
