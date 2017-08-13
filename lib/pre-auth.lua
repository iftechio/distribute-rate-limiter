local keyPrefix, count, capacity = unpack(KEYS)
count = tonumber(count)
capacity = tonumber(capacity)
local currentContent, currentPreAuth = unpack(redis.call('mget', keyPrefix .. '.content', keyPrefix .. '.preAuth'))
currentContent = tonumber(currentContent)
if not currentPreAuth then
  redis.call('set', keyPrefix .. '.preAuth', 0, 'EX', 5)
  currentPreAuth = '0'
end
currentPreAuth = tonumber(currentPreAuth)
if currentContent > currentPreAuth + count or (currentContent == capacity and currentPreAuth == 0) then
  redis.call('incrbyfloat', keyPrefix .. '.preAuth', count)
  return true
else
  return false
end

