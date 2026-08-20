/* U1 存储层：IndexedDB 封装 + 全局设置持久化 + 完整备份/导入。
   一切数据只在本机；完整备份含 API Key,导出文件自己保管。 */
const DB = (() => {
  const NAME = 'mantou-phone', VER = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(NAME, VER);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(d => new Promise((res, rej) => {
      const req = fn(d.transaction('kv', mode).objectStore('kv'));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    }));
  }
  return {
    get: k => tx('readonly', s => s.get(k)),
    set: (k, v) => tx('readwrite', s => s.put(v, k)),
    del: k => tx('readwrite', s => s.delete(k)),
    clear: () => tx('readwrite', s => s.clear()),
    keys: () => tx('readonly', s => s.getAllKeys()),
    async exportAll() {
      const ks = await this.keys(), out = {};
      for (const k of ks) out[k] = await this.get(k);
      return out;
    },
    async importAll(data) {
      await this.clear();
      for (const k of Object.keys(data)) await this.set(k, data[k]);
    }
  };
})();

// 防清扫：向浏览器申请持久存储(iOS 七天清数据的第一道保险，正式形态还要 PWA)
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();

// ── 偏好持久化：昼夜模式 + 每模式记住的装帧(palMem 在 shell.js) ──
const Prefs = {
  save() {
    const theme = document.documentElement.dataset.theme || 'dark';
    return DB.set('prefs.theme', { theme, palMem });
  },
  async restore() {
    const p = await DB.get('prefs.theme');
    if (!p) return;
    if (p.palMem) {
      if (p.palMem.dark) palMem.dark = p.palMem.dark;
      if (p.palMem.light) palMem.light = p.palMem.light;
    }
    setTheme(p.theme || 'dark');
  }
};
// 换肤动作挂持久化(经典脚本全局函数可重绑，inline onclick 自动走新版)
setTheme = (orig => t => { orig(t); Prefs.save(); })(setTheme);
applyPal = (orig => (id, theme, pal) => { orig(id, theme, pal); Prefs.save(); })(applyPal);

// ── 配置字段持久化：所有 [data-k] 输入，改一下存一下 ──
async function bindCfg() {
  for (const el of document.querySelectorAll('[data-k]')) {
    const k = 'cfg.' + el.dataset.k;
    const v = await DB.get(k);
    if (v !== undefined && v !== null) el.value = v;
    el.addEventListener('change', () => DB.set(k, el.value));
  }
}

// ── 完整备份 / 导入 ──
async function backupExport() {
  const payload = { app: 'mantou-phone', ver: 1, exportedAt: new Date().toISOString(), data: await DB.exportAll() };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mantou-phone-backup.json';
  a.click();
  URL.revokeObjectURL(a.href);
}
async function backupImport(file) {
  if (!file) return;
  let j = null;
  try { j = JSON.parse(await file.text()); } catch (e) {}
  if (!j || j.app !== 'mantou-phone' || !j.data) { toast('这不是小手机的备份文件'); return; }
  await DB.importAll(j.data);
  location.reload();
}

// 启动恢复
(async () => {
  try { await Prefs.restore(); } catch (e) { console.error('prefs restore', e); }
  try { await bindCfg(); } catch (e) { console.error('cfg bind', e); }
})();
