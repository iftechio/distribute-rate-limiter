const EventEmitter = require('events')
const fs = require('fs')

module.exports = class RateLimiter extends EventEmitter {
  _init() {
    this.redisClient.defineCommand('tryRemoveTokens', {
      numberOfKeys: 2,
      lua: fs.readFileSync(`${__dirname}/tryRemoveTokens.lua`),
    })
    this.redisClient.get(`${this.redisKeyPrefix}.conf`)
      .then(conf => {
        if (conf) {
          // validate conf
          try {
            const remoteConf = JSON.parse(conf)
            if (this.config.tokensPerSecond !== remoteConf.tokensPerSecond) {
              this.emit('error', new Error('tokensPerSecond not coincident to config in redis'))
            }
            return this.redisClient.mget(`${this.redisKeyPrefix}.content`, `${this.redisKeyPrefix.lastDrip}`)
          } catch (e) {
            this.emit('error', new Error('Error fetching config'))
          }
        }
        // write conf
        return this.redisClient
          .set(`${this.redisKeyPrefix}.conf`, JSON.stringify({ tokensPerSecond: opts.tokensPerSecond }))
          .then(() => null, err => {
            this.emit('error', err)
          })
      })
      .then(bucketContent => {
        // conf ready
        if (bucketContent) {
          return bucketContent
        }
        return this.redisClient
          .mset(
            `${this.redisKeyPrefix}.content`,
            this.config.tokensPerSecond,
            `${this.redisKeyPrefix}.lastDrip`,
            Date.now())
      })
      .then(() => {
        this.emit('ready')
        this.ready = true
      })
  }

  constructor({ redisClient, redisKeyPrefix, tokensPerSecond }) {
    super()
    this.redisClient = redisClient
    this.redisKeyPrefix = redisKeyPrefix
    this.ready = false
    this.config = { tokensPerSecond }
    this._init()
  }

  _getCurrentContent() {
    return Promise.resolve()
      .then(() => {
        if (!this.ready) {
          return new Promise(resolve => {
            this.on('ready', () => resolve())
          })
        }
        return null
      })
      .then(() => {
        return this.redisClient.pipeline()
          .time()
          .mget(`${this.redisKeyPrefix}.content`, `${this.redisKeyPrefix}.lastDrip`)
          .exec()
          .then(([[err1, t], [err2, [content, lastDrip]]]) => {
            if (err1) {
              this.emit('error', err1)
            }
            if (err2) {
              this.emit('error', err2)
            }
            const now = parseInt(`${t[0]}${t[1].slice(0, 3)}`)
            return [parseFloat(content), parseInt(lastDrip), now]
          })
      })
  }

  tryRemoveTokens(count) {
    if (count > this.config.tokensPerSecond) {
      return Promise.resolve(false)
    }
    return this.drip()
      .then(bucketContent => {
        if (count > bucketContent.content) {
          return false
        }
        return this.redisClient.tryRemoveTokens(this.redisKeyPrefix, count)
      })
  }

  getTokensRemaining() {
    return this.drip().then(() => {
      return this._getCurrentContent()
        .then(([currentContent]) => currentContent)
    })
  }

  drip() {
    // no transaction here 'cause it doesn't matter if multi process update
    // bucket content simultaneously
    return this._getCurrentContent()
      .then(([currentContent, lastDrip, now]) => {
        const deltaMS = Math.max(now - lastDrip, 0)
        lastDrip = now
        const dripAmount = deltaMS * this.config.tokensPerSecond / 1000
        currentContent =
          Math.min(currentContent + dripAmount, this.config.tokensPerSecond)
        return this.redisClient
          .mset(
            `${this.redisKeyPrefix}.content`,
            currentContent,
            `${this.redisKeyPrefix}.lastDrip`,
            now)
      })
  }
}
