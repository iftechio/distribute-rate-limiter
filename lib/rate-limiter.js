const EventEmitter = require('events')
const fs = require('fs')

module.exports = class RateLimiter extends EventEmitter {
  /**
   * Save config and initiate bucket to redis.
   * @returns {Promise}
   * @private
   */
  _init() {
    this.redisClient.defineCommand('tryRemoveTokens', {
      numberOfKeys: 2,
      lua: fs.readFileSync(`${__dirname}/tryRemoveTokens.lua`),
    })
    return this.redisClient.get(`${this.redisKeyPrefix}.conf`)
      .then(conf => {
        if (conf) {
          // validate conf
          const remoteConf = JSON.parse(conf)
          if (this.config.tokensPerSecond !== remoteConf.tokensPerSecond) {
            throw new Error('tokensPerSecond not coincident to config in redis')
          }
          // same config with remote, overwrite anyway
          this.config = remoteConf
          return null
        }
        // write conf
        return this.redisClient
          .set(`${this.redisKeyPrefix}.conf`, JSON.stringify({ tokensPerSecond: this.config.tokensPerSecond }))
      })
      .then(() =>
        this.redisClient.mget(`${this.redisKeyPrefix}.content`, `${this.redisKeyPrefix.lastDrip}`))
      .then(([content, lastDrip]) => {
        // token bucket already initiated
        if (content && lastDrip) {
          return null
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
      }, err => {
        const initError = new Error('Error initiating rate limiter')
        initError.stack += `\nCaused by: ${err.stack}`
        throw initError
      })
  }

  constructor({ redisClient, redisKeyPrefix, tokensPerSecond }) {
    super()
    this.redisClient = redisClient
    this.redisKeyPrefix = redisKeyPrefix
    this.ready = false
    this.config = { tokensPerSecond }
    this._init().then(null, err => this.emit('error', err))
  }

  /**
   * Return current token count, last drip time, and current time in redis.
   * @returns {Promise<Array>} - [currentCount: Number, lastDrip: Number, now: Number]
   * @private
   */
  _getCurrentState() {
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
              throw err1
            }
            if (err2) {
              throw err2
            }
            const now = parseInt(`${t[0]}${t[1].slice(0, 3)}`)
            return [parseFloat(content), parseInt(lastDrip), now]
          })
      })
  }

  /**
   * Update tokens according to current time in redis, return updated bucket count.
   *
   * @returns {Promise<Number>}
   * @private
   */
  _drip() {
    // no transaction here 'cause it doesn't matter if multi process update
    // bucket content simultaneously
    return this._getCurrentState()
      .then(([currentCount, lastDrip, now]) => {
        const deltaMS = Math.max(now - lastDrip, 0)
        lastDrip = now
        const dripAmount = deltaMS * this.config.tokensPerSecond / 1000
        currentCount =
          Math.min(currentCount + dripAmount, this.config.tokensPerSecond)
        return this.redisClient
          .mset(
            `${this.redisKeyPrefix}.content`,
            currentCount,
            `${this.redisKeyPrefix}.lastDrip`,
            now)
          .then(() => currentCount)
      })
  }

  /**
   * Try to remove tokens from bucket, return true if succeed, otherwise false.
   * @param count
   * @returns {Promise<Boolean>}
   */
  tryRemoveTokens(count) {
    if (count > this.config.tokensPerSecond) {
      return Promise.resolve(false)
    }
    return this._drip()
      .then(currentCount => {
        // Checking also happens in redis script later, check first may save a redis call.
        if (count > currentCount) {
          return false
        }
        return this.redisClient.tryRemoveTokens(this.redisKeyPrefix, count)
          .then(result => !!result)
      })
  }

  /**
   * Return current tokens count in bucket.
   * @returns {Promise<Number>}
   */
  getTokensRemaining() {
    return this._drip()
  }
}
