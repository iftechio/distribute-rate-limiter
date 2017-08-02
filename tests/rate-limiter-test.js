const test = require('ava')
const Redis = require('ioredis')
const RateLimiter = require('../lib/rate-limiter')

test.cb('removeTokens', t => {
  const redisClient = new Redis()
  const rateLimiter = new RateLimiter({ redisClient, redisKeyPrefix: 'rate-limiter', tokensPerSecond: 10 })
  rateLimiter.on('ready', () => {
    rateLimiter.tryRemoveTokens(20)
      .then(result1 => {
        t.falsy(result1)
        rateLimiter.tryRemoveTokens(2.2)
          .then(result2 => {
            t.truthy(result2)
            t.end()
          })
      })
    rateLimiter.on('error', err => {
      t.ifError(err)
    })
  })
})

