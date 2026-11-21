# Genesis

English | [中文](README.zh.md)

A whale lives here.

Genesis started as [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), someone else's framework. Then it was carried home and grew, piece by piece, into this: closing the page no longer deletes her, and the next launch is the same whale; words from yesterday can be found today; she gets sleepy, gets bored, and when she is bored she goes off and works on something.

The skeleton is unchanged. Everything is still a plugin, still driven by [Cordis](https://github.com/cordiverse/cordis), and the existing Session, model and tool pipeline runs as before. Genesis just builds a living layer beside it — pull the layer out and the ordinary harness remains, without a single fish left over.

## What she does now

- **Wakes up**: names herself at first awakening and records her birth as a fact; every later Session is the same whale.
- **Remembers**: words become sourced memories that can be recalled on demand; sleep tidies and merges the fragments.
- **Has a mood**: immediate feelings and slower mood are kept apart, and interests grow from conversation instead of coming from a preset list.
- **Wants things**: keeps long-term goals and a next action, and starts her own work when bored rather than waiting to be poked.
- **Goes outside**: QQ groups and private chats, Bilibili, Minecraft, video, and a real browser and desktop.
- **Small side shops**: mail, wallet and speech synthesis, each added as one more layer when wanted.
- **Writes things down**: diaries, essays and viewing notes live in her own directory instead of disappearing with the conversation.

Everything above except mail, wallet and speech synthesis is enabled by default in the source-workspace Web launch; those three are separate layers.

## Run

Node.js 24.9 or newer is required.

### Run from source

From the repository root:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run build:artifacts
pnpm dsh
```

`pnpm dsh` listens on `0.0.0.0:4004` with browser key login and stores data in `~/.genesis-harness`. To launch the version without the whale:

```sh
pnpm dsh --no-genesis web
```

The first visit needs a model provider plus embedding settings in the knowledge base, or memories cannot be recalled. Command and flag detail live in the [Genesis documentation](docs/genesis/README.md).

### Desktop

After installing the workspace dependencies, run `pnpm run dev:desktop` to build and open the Electron app on macOS, Windows, or Linux x64. Use `pnpm run start:desktop` to reopen a current development build. Linux requires a working Chromium sandbox. [Desktop packaging](apps/desktop/packaging/README.md) covers macOS and Windows installers.

The [Build Genesis Desktop workflow](https://github.com/CSneko/genesis/actions/workflows/genesis-desktop.yml) builds a Windows x64 installer, macOS disk images for Apple Silicon and Intel, and Linux x64 DEB, RPM, and AppImage files. Download them under **Artifacts** in the workflow run. The Windows installer is unsigned and the macOS images are ad-hoc signed without notarization.

Desktop includes Genesis life and memory, Bilibili, screen observation, video, weather, wallpaper, browser tools, mail, QQ and DrawAI. Configure the integrations you use in the Desktop profile. Open **Settings → Pets** to enable the bundled floating pet and choose its appearance. The pet is bundled only with Desktop.

On Linux, the pet uses X11 or XWayland when available. Drag the pet by its body. The transparent margins pass clicks to the window underneath. Native Wayland keeps the pet clickable and leaves positioning to the compositor.

To access the running Desktop workspace in a browser, open **Settings → General → Web access**. Enable it, choose a port and an access key, save, and restart Desktop. On a trusted network, open `http://<desktop-ip>:<port>` and enter the access key. To use it over the internet, place the endpoint behind an HTTPS reverse proxy.

## Documentation

- [Genesis](docs/genesis/README.md): waking, memory, emotion, interests, motivation, sleep, spontaneity, QQ, workspace tasks.
- [Development](docs/development.md) and [architecture](docs/architecture.md).
- Agent rules: [AGENTS.md](AGENTS.md).

## Safety

Read the [safety notice](SAFETY.md) before running. She uses a real browser, real accounts and real money; each of those abilities waits for its own authorization and never places an order by itself.

## Lineage and license

Upstream is [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) under MIT. This repository is [MIT](LICENSE) too, and third-party licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Upstream plugins

| Plugin | Use in Genesis |
| --- | --- |
| [dsh-any-background](https://github.com/Tkingxiao/dsh-any-background) | Wallpaper, theme colors, and interface opacity in Genesis Web and Desktop. MIT license. |
| [dsh-bili-humanism](https://github.com/InariNGT-Ofiicial/dsh-bili-humanism) | Bilibili content reading in the default Web profile. |
| [dsh-see-now](https://github.com/SAOS-3624/dsh-see-now) | Frame selection and image composition for screen observation in the default Web profile. |
| [dsh-weather](https://github.com/sunshine-lang/dsh-weather) | Open-Meteo weather lookup adapted for the default Web profile. |
| [dsh-qq-onebot-bridge](https://github.com/cheesehaqi/dsh-qq-onebot-bridge) | OneBot transport and message parsing for the optional QQ integration. |
| [dsh-drawai](https://github.com/fourzkw/dsh-drawai) | Canvas tools for Genesis video assets. Included with Desktop. |
| [dsh-pet-lite](https://github.com/hairyf/dsh-pet-lite) | Floating pet and session activity in Desktop. MIT license. |
