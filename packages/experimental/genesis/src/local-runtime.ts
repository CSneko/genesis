/** Host-specific, checksum-pinned runtime archives and shell-free extraction arguments. @module */
import type { Config } from './config.ts'
import { GenesisError } from './error.ts'

/** Resolved deployment values for one supported host. */
export interface LocalRuntime {
  url: string
  sha256: string
  archive: string
  executable: string
  /** Options after the destination directory; native archives retain bin/ and lib/. */
  extractionOptions: string[]
}

/**
 * Select a native CPU runtime without guessing across operating systems or architectures.
 * @param policy - Operator-configurable download sources and checksums.
 * @param platform - Actual host operating system.
 * @param arch - Actual Node host architecture; unsupported combinations fail before downloading.
 * @returns Complete download and extraction values; executable overrides bypass this resolver.
 */
export function resolveLocalRuntime(policy: Config['localDecision'], platform: NodeJS.Platform, arch: string): LocalRuntime {
  if (platform === 'linux' && arch === 'x64') return {
    url: policy.runtimeUrl, sha256: policy.runtimeSha256, archive: 'ollaya-runtime.tar.zst',
    executable: 'bin/ollaya', extractionOptions: [],
  }
  if (platform === 'win32' && arch === 'x64') return {
    url: policy.windowsRuntimeUrl, sha256: policy.windowsRuntimeSha256,
    archive: 'ollaya-runtime-windows-x64.zip', executable: 'bin/ollaya.exe', extractionOptions: [],
  }
  throw new GenesisError('memory-provider', `Automatic local runtime installation does not support ${platform}/${arch}. Configure localDecision.binary with a compatible Ollaya executable on this host.`)
}
