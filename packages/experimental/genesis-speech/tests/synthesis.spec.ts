/** Signed provider links retain their query while all requests use TLS. @module */
import { afterEach, expect, it, vi } from 'vitest'
import { synthesize } from '../src/synthesis.ts'

afterEach(() => { vi.unstubAllGlobals() })

it('upgrades HTTP audio links without forwarding credentials and rejects embedded URL credentials', async () => {
  const route = { endpoint: 'https://speech.invalid/synthesize', model: 'cosyvoice-v3.5-plus', voice: 'custom-voice',
    keyEnv: 'SPEECH_FIXTURE_KEY', maxTextChars: 100, maxAudioBytes: 1024, timeoutMs: 1000, rate: 0.85, instruction: '请用温柔开心的语气说话。' }
  const wav = Buffer.from('RIFF0000WAVE')
  const signedPath = '/generated.wav?Expires=123&Signature=a%2Fb%2Bc%3D&OSSAccessKeyId=fixture'
  let returnedUrl = `http://audio.invalid${signedPath}`
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url) === route.endpoint) {
      expect(JSON.parse(String(init?.body)).input).toMatchObject({ rate: 0.85, instruction: route.instruction })
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer fixture-secret' })
      return Response.json({ output: { finish_reason: 'stop', audio: { url: returnedUrl } } })
    }
    expect(String(url)).toBe(`https://audio.invalid${signedPath}`)
    expect(init?.headers).toBeUndefined()
    expect(init?.redirect).toBe('error')
    return new Response(wav)
  })
  vi.stubGlobal('fetch', fetcher)
  const signal = new AbortController().signal
  expect((await synthesize(route, '你好', 'fixture-secret', signal)).data).toEqual(wav)
  expect(fetcher).toHaveBeenCalledTimes(2)
  await expect(synthesize({ ...route, rate: 0.1 }, '你好', 'fixture-secret', signal)).rejects.toMatchObject({ code: 'configuration' })
  await expect(synthesize({ ...route, instruction: '好'.repeat(51) }, '你好', 'fixture-secret', signal)).rejects.toMatchObject({ code: 'configuration' })
  expect(fetcher).toHaveBeenCalledTimes(2)
  returnedUrl = 'https://user:password@audio.invalid/generated.wav'
  await expect(synthesize(route, '你好', 'fixture-secret', signal)).rejects.toMatchObject({ code: 'provider' })
  expect(fetcher).toHaveBeenCalledTimes(3)
  await expect(synthesize({ ...route, endpoint: 'http://speech.invalid/synthesize' }, '你好', 'fixture-secret', signal))
    .rejects.toMatchObject({ code: 'configuration' })
  expect(fetcher).toHaveBeenCalledTimes(3)
})
