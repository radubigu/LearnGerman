import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Publish only web assets. Project documentation and local data stay outside dist.
async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const item of await readdir(source, { withFileTypes: true })) {
    if (item.isDirectory()) await copyTree(join(source, item.name), join(destination, item.name));
    else if (item.isFile()) await copyFile(join(source, item.name), join(destination, item.name));
  }
}
await copyTree('web', 'dist');
console.log('Static app built in dist/.');
