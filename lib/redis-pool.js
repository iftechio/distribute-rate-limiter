const EventEmitter = require('events')

module.exports = class RedisPool extends EventEmitter {
  constructor(minSize, maxSize) {
    super()
    this.minSize = minSize
    this.maxSize = maxSize
    this.connections = []
  }

  getCon() {

  }

  releaseCon() {

  }
}
