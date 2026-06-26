/**
 * 上传 Release Assets 到 GitHub
 * 用法: node _upload_release.mjs <版本号> [--create]
 *   --create  创建新 Release（而非更新已有）
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TOKEN = fs.readFileSync('scripts/.release_token', 'utf-8').trim();
const REPO = 'ht182400-creator/easyagent';
const RELEASE_DIR = 'packages/desktop/release';

const rawVersion = process.argv[2];
const createNew = process.argv.includes('--create');

if (!rawVersion) {
  console.error('用法: node _upload_release.mjs <版本号> [--create]');
  process.exit(1);
}

// 统一处理 v 前缀
const version = rawVersion.replace(/^v/, '');
const tagName = `v${version}`;

function ghApi(endpoint, method = 'GET', body = null) {
  const args = ['-s', '-H', `Authorization: token ${TOKEN}`, '-H', 'Accept: application/vnd.github.v3+json'];
  if (method !== 'GET') args.push('-X', method);
  if (body) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
  args.push(endpoint);
  const result = execSync(`curl ${args.join(' ')}`, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(result);
}

function uploadAsset(uploadUrl, filePath, fileName, contentType) {
  const url = uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);
  const result = execSync(
    `curl -s -H "Authorization: token ${TOKEN}" -H "Content-Type: ${contentType}" --data-binary "@${filePath}" "${url}"`,
    { encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024 }
  );
  return JSON.parse(result);
}

async function main() {
  // 1. 获取或创建 Release
  let release;
  if (createNew) {
    console.log(`创建 Release: ${tagName}...`);
    release = ghApi(`https://api.github.com/repos/${REPO}/releases`, 'POST', {
      tag_name: tagName,
      name: tagName,
      body: `EasyAgent ${tagName} 发布\n\n## 变更\n- 移除开发测试用的模拟更新按钮（✔下载/✘失败/◎检查）\n- 完善 Settings useEffect 状态初始化（补充 checking/error/installing 状态处理）\n- 自动更新状态机 + UI 测试覆盖 95 个用例全部通过`,
      draft: false,
      prerelease: false,
      make_latest: "true",
    });
  } else {
    // 获取已有 Release
    console.log(`查找已有 Release: v${version}...`);
    const releases = ghApi(`https://api.github.com/repos/${REPO}/releases?per_page=20`);
    release = releases.find(r => r.tag_name === `v${version}`);
    if (!release) {
      console.error(`未找到 Release v${version}，使用 --create 创建`);
      process.exit(1);
    }
    // 删除旧 assets（如果有）
    if (release.assets.length > 0) {
      console.log(`  删除 ${release.assets.length} 个旧 asset...`);
      for (const asset of release.assets) {
        execSync(`curl -s -X DELETE -H "Authorization: token ${TOKEN}" "${asset.url}"`, { encoding: 'utf-8' });
        console.log(`    ✅ 已删除: ${asset.name}`);
      }
    }
    // 设置标记为 latest
    ghApi(`https://api.github.com/repos/${REPO}/releases/${release.id}`, 'PATCH', { make_latest: 'true' });
  }

  console.log(`Release ID: ${release.id}, Upload URL: ${release.upload_url}`);

  // 2. 上传 assets
  const tagVer = version.replace(/^v/, '');
  const assets = [
    { file: `EasyAgent-${tagVer}-win-x64.exe`, type: 'application/vnd.microsoft.portable-executable' },
    { file: `EasyAgent-${tagVer}-win-x64.exe.blockmap`, type: 'application/octet-stream' },
    { file: 'latest.yml', type: 'application/x-yaml' },
  ];

  for (const { file, type } of assets) {
    const filePath = path.join(RELEASE_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  ⚠️  跳过（文件不存在）: ${file}`);
      continue;
    }
    const sizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(1);
    process.stdout.write(`  上传: ${file} (${sizeMB} MB)... `);
    try {
      const result = uploadAsset(release.upload_url, filePath, file, type);
      console.log(result.state === 'uploaded' ? `✅ ${result.browser_download_url}` : `❌ ${JSON.stringify(result)}`);
    } catch (err) {
      console.log(`❌ ${err.message}`);
    }
  }

  console.log('\n✅ 上传完成');
}

main().catch(err => {
  console.error('❌ 失败:', err.message);
  process.exit(1);
});
