/** Type declaration for the pinned JavaScript plugin's mounting entry. */
declare module 'dsh-bili-humanism' {
  /**
   * Mount the upstream tools using already resolved trusted configuration.
   * @param ctx - Cordis owner for tool registrations and upstream storage cleanup.
   * @param config - Trusted paths and budgets with autonomous behavior and platform writes disabled.
   */
  export function apply(ctx: import('@deepseek-ai/cordis').Context, config: {
    dataDir: string
    credentialPath: string
    pythonPath: string
    asrModelPath: string
    maxReadTokens: number
    maxMediaSeconds?: number
    enablePersonalityLearning: false
    enablePostViewingQuestions: false
    enablePersonalityShadow: false
    enableDailyFetching: false
    enableHistoryWrites: false
    enableFavoriteWrites: false
    enableLikeWrites: false
    enableCoinWrites: false
  }): void
}
