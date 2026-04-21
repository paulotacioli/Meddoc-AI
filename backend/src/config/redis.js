const Redis = require('ioredis')

let _redisClient = null

async function connectRedis() {
  _redisClient = new Redis({
    host: '127.0.0.1',
    port: 6379,
    password: 'meddoc123',
    lazyConnect: true,
  })
  _redisClient.on('error', (err) => console.error('Redis error:', err.message))
  await _redisClient.connect()
}

const redisClient = {
  async setEx(key, seconds, value) {
    return _redisClient.set(key, value, 'EX', seconds)
  },
  async get(key) {
    return _redisClient.get(key)
  },
  async del(key) {
    return _redisClient.del(key)
  },
  async set(key, value) {
    return _redisClient.set(key, value)
  },
}

module.exports = { connectRedis, redisClient }