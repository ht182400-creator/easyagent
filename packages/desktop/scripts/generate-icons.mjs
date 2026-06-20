/**
 * 图标生成脚本 - 将AI生成的1024x1024图标转换为多平台格式
 * 依赖: sharp
 * 用法: node scripts/generate-icons.mjs
 */
import sharp from 'sharp';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

/** 查找AI生成的源图标 */
function findSourceImage() {
  const files = readdirSync(assetsDir);
  // 找到最新的AI生成图标
  const sourceFile = files.find(f => f.startsWith('A_professional_app_icon') && f.endsWith('.png'));
  if (!sourceFile) {
    throw new Error('未找到AI生成的源图标，请先运行 image_gen 生成图标');
  }
  return join(assetsDir, sourceFile);
}

/**
 * 生成简单ICO文件（PNG格式嵌入）
 * ICO格式: ICO头部 + 目录条目 + PNG数据
 */
async function generateICO(pngBuffer, size, outputPath) {
  // 使用sharp调整到目标尺寸的PNG
  const resizedPng = await sharp(pngBuffer).resize(size, size).png().toBuffer();

  // ICO 头部 (6 bytes)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // 保留字段，必须为0
  header.writeUInt16LE(1, 2);      // 类型: 1 = ICO
  header.writeUInt16LE(1, 4);      // 图片数量: 1

  // 目录条目 (16 bytes)
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);  // 宽度 (0 = 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1);  // 高度 (0 = 256)
  entry.writeUInt8(0, 2);            // 调色板颜色数
  entry.writeUInt8(0, 3);            // 保留
  entry.writeUInt16LE(1, 4);         // 色平面
  entry.writeUInt16LE(32, 6);        // 位深度
  entry.writeUInt32LE(resizedPng.length, 8);  // 图片数据大小
  entry.writeUInt32LE(22, 12);       // 图片数据偏移 (6 + 16 = 22)

  const icoBuffer = Buffer.concat([header, entry, resizedPng]);

  const { writeFileSync } = await import('node:fs');
  writeFileSync(outputPath, icoBuffer);
  console.log(`  ✅ ${outputPath} (${(icoBuffer.length / 1024).toFixed(1)}KB)`);
}

async function main() {
  console.log('🖼️  开始生成应用图标...\n');

  const sourcePath = findSourceImage();
  console.log(`  源文件: ${sourcePath}\n`);

  const pngBuffer = await sharp(sourcePath).toBuffer();

  // 1. icon.png - Linux (512x512)
  await sharp(pngBuffer)
    .resize(512, 512)
    .png()
    .toFile(join(assetsDir, 'icon.png'));
  const pngStat = (await import('node:fs')).statSync(join(assetsDir, 'icon.png'));
  console.log(`  ✅ icon.png (${(pngStat.size / 1024).toFixed(1)}KB) - Linux`);

  // 2. icon.ico - Windows (多种尺寸)
  await generateICO(pngBuffer, 256, join(assetsDir, 'icon.ico'));

  // 3. tray-icon.png - 系统托盘 (16x16)
  await sharp(pngBuffer)
    .resize(16, 16)
    .png()
    .toFile(join(assetsDir, 'tray-icon.png'));
  const trayStat = (await import('node:fs')).statSync(join(assetsDir, 'tray-icon.png'));
  console.log(`  ✅ tray-icon.png (${trayStat.size} bytes) - 系统托盘`);

  // 4. icon.icns - macOS (使用PNG包装，macOS可接受)
  // 创建一个带有正确扩展名的高分辨率PNG作为macOS图标
  // electron-builder支持使用PNG作为macOS图标
  await sharp(pngBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(join(assetsDir, 'icon.icns'));
  const icnsStat = (await import('node:fs')).statSync(join(assetsDir, 'icon.icns'));
  console.log(`  ✅ icon.icns (${(icnsStat.size / 1024).toFixed(1)}KB) - macOS (PNG格式)`);

  // 清理临时AI生成文件（保留用于参考）
  console.log(`\n📝 源文件保留: ${sourcePath}`);
  console.log('🎉 图标生成完成！');
}

main().catch(err => {
  console.error('❌ 图标生成失败:', err.message);
  process.exit(1);
});
