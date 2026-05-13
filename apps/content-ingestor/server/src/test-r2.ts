// Temporary: test R2 write
export async function testR2Write(bucket: R2Bucket): Promise<string> {
  await bucket.put('test-write.txt', 'hello from content-ingestor ' + Date.now())
  const obj = await bucket.get('test-write.txt')
  if (!obj) return 'FAIL: wrote but could not read back'
  const text = await obj.text()
  await bucket.delete('test-write.txt')
  return 'OK: ' + text
}
