/**
 * GitHub Release 创建 + 上传 (写 PS1 文件执行)
 * 用法: node _release.mjs <版本号> [--create]
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TOKEN = fs.readFileSync('scripts/.release_token', 'utf-8').trim();
const REPO = 'ht182400-creator/easyagent';
const RELEASE_DIR = 'packages/desktop/release';

const rawVersion = process.argv[2];
const createNew = process.argv.includes('--create');
if (!rawVersion) { console.error('用法: node _release.mjs <版本号> [--create]'); process.exit(1); }

const version = rawVersion.replace(/^v/, '');
const tagName = `v${version}`;

/** 写并执行 PS1，返回 JSON */
function runPs(psCode) {
  const psFile = '_tmp.ps1';
  fs.writeFileSync(psFile, psCode, 'utf-8');
  try {
    const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File _tmp.ps1`, {
      encoding: 'utf-8', maxBuffer: 200 * 1024 * 1024,
    });
    fs.unlinkSync(psFile);
    // 清理可能的 BOM 或空白
    return result.trim();
  } catch (e) {
    fs.unlinkSync(psFile);
    console.error('PS Error:', e.stdout?.toString() || e.message);
    throw e;
  }
}

/** 调 GitHub API */
function ghApi(endpoint, method, body = null) {
  let ps = `$token = '${TOKEN}'\n`;
  ps += `$headers = @{ Authorization = "token $token"; Accept = "application/vnd.github.v3+json" }\n`;
  ps += `$uri = '${endpoint}'\n`;
  if (body) {
    const bodyStr = JSON.stringify(body);
    ps += `$body = '${bodyStr.replace(/'/g, "''")}'\n`;
    ps += `$r = Invoke-RestMethod -Uri $uri -Method ${method} -Headers $headers -ContentType 'application/json' -Body $body\n`;
  } else {
    ps += `$r = Invoke-RestMethod -Uri $uri -Method ${method} -Headers $headers\n`;
  }
  ps += `$r | ConvertTo-Json -Depth 10 -Compress\n`;
  const result = runPs(ps);
  return JSON.parse(result);
}

/** 上传 asset */
function uploadAsset(uploadUrl, filePath, fileName, contentType) {
  const absPath = path.resolve(filePath);
  const url = uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);
  let ps = `$token = '${TOKEN}'\n`;
  ps += `$headers = @{ Authorization = "token $token"; "Content-Type" = "${contentType}" }\n`;
  ps += `$uri = '${url}'\n`;
  ps += `$body = [System.IO.File]::ReadAllBytes('${absPath.replace(/\\/g, '\\\\')}')\n`;
  ps += `$r = Invoke-RestMethod -Uri $uri -Method POST -Headers $headers -Body $body\n`;
  ps += `$r | ConvertTo-Json -Depth 5 -Compress\n`;
  return JSON.parse(runPs(ps));
}

async function main() {
  let release;

  if (createNew) {
    console.log(`创建 Release: ${tagName}...`);
    release = ghApi(`https://api.github.com/repos/${REPO}/releases`, 'POST', {
      tag_name: tagName,
      name: tagName,
      body: `EasyAgent ${tagName} - verify auto-update flow (checking → downloading → downloaded)`,
      draft: false,
      prerelease: false,
      make_latest: "true",
    });
  } else {
    console.log(`查找已有 Release: ${tagName}...`);
    const releases = ghApi(`https://api.github.com/repos/${REPO}/releases?per_page=20`, 'GET');
    release = releases.find(r => r.tag_name === tagName);
    if (!release) { console.error(`未找到 Release ${tagName}`); process.exit(1); }

    if (release.assets && release.assets.length > 0) {
      console.log(`  删除 ${release.assets.length} 个旧 asset...`);
      for (const asset of release.assets) {
        ghApi(asset.url, 'DELETE');
        console.log(`    ✅ 已删除: ${asset.name}`);
      }
    }
    ghApi(`https://api.github.com/repos/${REPO}/releases/${release.id}`, 'PATCH', { make_latest: "true" });
  }

  console.log(`Release ID: ${release.id}`);

  const assets = [
    { file: `EasyAgent-${version}-win-x64.exe`, type: 'application/vnd.microsoft.portable-executable' },
    { file: `EasyAgent-${version}-win-x64.exe.blockmap`, type: 'application/octet-stream' },
    { file: 'latest.yml', type: 'application/x-yaml' },
  ];

  for (const { file, type } of assets) {
    const fp = path.join(RELEASE_DIR, file);
    if (!fs.existsSync(fp)) { console.log(`  ⚠️  跳过（文件不存在）: ${file}`); continue; }
    const sizeMB = (fs.statSync(fp).size / (1024 * 1024)).toFixed(1);
    process.stdout.write(`  上传: ${file} (${sizeMB} MB)... `);
    try {
      const result = uploadAsset(release.upload_url, fp, file, type);
      console.log(result.state === 'uploaded' ? `✅` : `❌ ${JSON.stringify(result)}`);
    } catch (err) {
      console.log(`❌ ${err.message}`);
    }
  }

  console.log(`\n✅ ${tagName} 发布完成`);
}

main().catch(err => {
  console.error('❌ 失败:', err.message);
  process.exit(1);
});
