local keyPrefix, count = unpack(KEYS)

local currentContent = redis.call('get', keyPrefix .. '.content')
currentContent = tonumber(currentContent)
count = tonumber(count)
if currentContent < count then
  return false
else
  redis.call('set', keyPrefix .. '.content', currentContent - count)
  return true
end
