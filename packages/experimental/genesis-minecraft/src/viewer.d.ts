/** Narrow declarations for the upstream WorldView module, whose package entry exposes untyped constructors. */
declare module 'prismarine-viewer/viewer/lib/worldView.js' {
  import type { Bot } from 'mineflayer'
  import type { Vec3 } from 'vec3'
  import type { Socket } from 'socket.io'
  export class WorldView {
    constructor(world: Bot['world'], distance: number, position: Vec3, socket: Socket)
    init(position: Vec3): Promise<void>
    updatePosition(position: Vec3): Promise<void>
    listenToBot(bot: Bot): void
    removeListenersFromBot(bot: Bot): void
  }
}
declare module 'prismarine-viewer/viewer/lib/version.js' {
  export function getVersion(version: string): string | null
}
