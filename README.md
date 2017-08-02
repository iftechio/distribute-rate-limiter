# distribute-rate-limiter
A rate limiter share token bucket across processes, use redis as share storage.

## Usage
```js
const Redis = require('ioredis')
const RateLimiter = require('distribute-rate-limiter')
const rateLimiter = new RateLimiter({redisClient: new Redis, redisKeyPrefix: 'rate-limiter', tokensPerSecond: 10})
rateLimiter.getTokensRemaining().then(count => console.log(count)) // 10
rateLimiter.tryRemoveTokens(10).then(result => console.log(result)) // true
rateLimiter.tryRemoveTokens(100).then(result => console.log(result)) // false
```

## Why redis script instead of watch/exec?
Because normally we use only one redis connection/client in a node process, that means before `exec`, we can only `watch` once(`exec` will `unwatch` every key watched before), which result in transactions have to be executed sequentially.
