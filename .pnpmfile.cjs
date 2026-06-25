/**
 * pnpm hooks — 阻止 better-sqlite3 的 prebuild-install 覆盖编译产物
 * 
 * better-sqlite3 的 package.json 中有 "install": "prebuild-install || ..."
 * 每次 pnpm install 都会触发这个脚本，从 npm registry 下载预编译的 .node 
 * 文件覆盖我们 node-gyp 手动编译的版本。
 * 
 * 此 hook 删除 better-sqlite3 的 install 脚本，改为完全手动管理。
 */
module.exports = {
  hooks: {
    readPackage(pkg) {
      // pkg 可能为 null/undefined（workspace root、link 依赖等场景）
      if (!pkg) return pkg;
      
      if (pkg.name === 'better-sqlite3' && pkg.scripts) {
        // 阻止 prebuild-install 覆盖手动编译的 .node 文件
        delete pkg.scripts.install;
        // 仅首次命中时输出（避免刷屏），之后 pkg.scripts.install 已删除
        // 不再 console.log，减少 pnpm 输出噪音
      }
      return pkg;
    }
  }
};
