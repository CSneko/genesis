/** Standard Client props for Genesis UI components rendered outside the slot runtime. */
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { allowAllAccess } from '@deepseek-ai/dsh-client-test-runtime'
import type {} from '../src/client/mount.ts'

const unusedHook = () => { throw new Error('unused Client hook') }
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const useSessionStatus: GlobalStandardProps['useSessionStatus'] = selector => selector(new Map())

export const globalProps: GlobalStandardProps = {
  ...allowAllAccess,
  usePanelInfo,
  useContextMenu: unusedHook,
  useRemoteAccess: allowAllAccess.useRemoteAccess,
  useSessions: unusedHook as never,
  useSessionStatus,
  useSessionRetainInfo: unusedHook as never,
  useSessionAccess: allowAllAccess.useSessionAccess,
  useWorkspaceAccess: allowAllAccess.useWorkspaceAccess,
  useWorkspaces: unusedHook as never,
  useResource: unusedHook as never,
}
