import fs from 'node:fs/promises';
import path from 'node:path';

const authPath = path.resolve(process.cwd(), 'auth.json');

try {
  await fs.unlink(authPath);
  console.log(`已删除登录态：${authPath}`);
} catch (error) {
  if (error?.code === 'ENOENT') {
    console.log('未找到 auth.json，无需清理。');
  } else {
    throw error;
  }
}
