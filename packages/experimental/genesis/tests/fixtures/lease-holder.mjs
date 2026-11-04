/** Independent source fixture; tsx handles GenesisError's parameter properties. */
import { acquireLease } from '../../src/lease.ts'

let release
process.on('disconnect', () => process.exit())
process.on('message', async command => {
  try {
    if (command === 'release') {
      await release?.()
      process.send('released')
      return
    }
    release = await acquireLease(process.argv[2])
    process.send('acquired')
  } catch (error) {
    if (error.code !== 'locked') throw error
    process.send('locked')
  }
})
process.send('ready')
