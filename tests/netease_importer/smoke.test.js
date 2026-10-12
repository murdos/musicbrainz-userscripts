/*
 * 冒烟测试：用桩 DOM 在 Node 里跑真实的 userscript 文件。
 *   node test/smoke.js
 *
 * 覆盖三条路径：网易云专辑页 -> 核对面板 -> seeding 表单；MusicBrainz 发行页 -> 封面面板。
 * 不追求覆盖率，只求「改坏了能立刻发现」。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'netease_importer.user.js'), 'utf8');

/* ---------- 假的网易云接口响应（结构照真实接口裁出来，字段名必须对） ---------- */
const ALBUM = {
  code: 200,
  album: {
    id: 1, name: '测试专辑', type: '专辑', subType: '现场版',
    company: '测试厂牌', publishTime: 1344528000000,
    picUrl: 'https://p2.music.126.net/x/cover.jpg?param=130y130',
    artists: [{ name: '某歌手' }],
    songs: [
      // 故意打乱顺序，且缺 no:1 —— 顺带验证排序与缺口检测
      { no: 3, disc: '01', name: '第三首', duration: 200000, artists: [{ name: '某歌手' }] },
      { no: 2, disc: '01', name: '第二首', duration: 180000, artists: [{ name: '某歌手' }] },
    ],
  },
};
const MB_LABEL = { labels: [{ id: 'lab-1', name: '测试厂牌', aliases: [] }] };
const MB_ARTIST = { artists: [{ id: 'art-1', name: '某歌手', aliases: [] }] };

/* ---------- 极简 DOM 桩 ---------- */
class Txt {
  constructor(t) { this.textContent = String(t); this.parentNode = null; this.children = []; this._classes = []; }
  get innerText() { return this.textContent; }
}
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = []; this.parentNode = null; this.style = {};
    this._classes = []; this._listeners = {}; this.textContent = ''; this.shadowRoot = null;
    this.classList = {
      add: c => { if (!this._classes.includes(c)) this._classes.push(c); },
      remove: c => { this._classes = this._classes.filter(x => x !== c); },
      contains: c => this._classes.includes(c),
    };
  }
  get className() { return this._classes.join(' '); }
  set className(v) { this._classes = String(v == null ? '' : v).split(/\s+/).filter(Boolean); }
  get isConnected() { let n = this; while (n) { if (n.__root) return true; n = n.parentNode; } return false; }
  _detach(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
  appendChild(c) { if (c.parentNode) c.parentNode._detach(c); c.parentNode = this; this.children.push(c); return c; }
  append(...ns) { ns.forEach(n => this.appendChild(n)); }
  insertBefore(n, ref) {
    if (n.parentNode) n.parentNode._detach(n);
    n.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i >= 0) this.children.splice(i, 0, n); else this.children.push(n);
    return n;
  }
  remove() { if (this.parentNode) { this.parentNode._detach(this); this.parentNode = null; } }
  attachShadow() { const r = new El('#shadow'); r.parentNode = this; this.shadowRoot = r; return r; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  dispatchEvent(e) { (this._listeners[e.type] || []).forEach(fn => fn(e)); return true; }
  getAttribute(k) { return this['_attr_' + k] !== undefined ? this['_attr_' + k] : (this[k] !== undefined ? String(this[k]) : null); }
  setAttribute(k, v) { this['_attr_' + k] = String(v); }
  submit() { SUBMITTED.push(this); }
  click() { (this._listeners.click || []).forEach(fn => fn()); }
  _all(cls) { const out = []; const w = n => { if (n._classes.includes(cls)) out.push(n); n.children.forEach(w); }; this.children.forEach(w); return out; }
  _allTag(t) { const out = []; t = t.toUpperCase(); const w = n => { if (n.tagName === t) out.push(n); n.children.forEach(w); }; this.children.forEach(w); return out; }
  querySelector(s) { return s.startsWith('.') ? (this._all(s.slice(1))[0] || null) : (this._allTag(s)[0] || null); }
  querySelectorAll(s) { return s.startsWith('.') ? this._all(s.slice(1)) : this._allTag(s); }
  get innerText() { let s = this.textContent || ''; this.children.forEach(c => { s += c.innerText; }); return s; }
}
const SUBMITTED = [];
const GM_STORE = new Map();
function findById(n, id) { if (n.id === id) return n; for (const c of n.children) { const h = findById(c, id); if (h) return h; } return null; }

/* ---------- 跑一次脚本 ---------- */
function run({ mode }) {
  SUBMITTED.length = 0;
  const body = new El('body'); body.__root = true;
  const selectors = {};
  let fileInput = null;

  if (mode === 'mb') {
    fileInput = new El('input'); fileInput.type = 'file'; fileInput.files = null;
    body.appendChild(fileInput); selectors['input[type=file]'] = fileInput;
  } else {
    const info = new El('div'); info.className = 'm-info';
    const cnt = new El('div'); cnt.className = 'cnt';
    const h2 = new El('h2'); h2.id = 'album-title'; h2.textContent = '测试专辑';
    cnt.appendChild(h2); info.appendChild(cnt); body.appendChild(info);
    selectors['.m-info .cnt h2'] = h2;
  }

  const sandbox = {
    console, URLSearchParams,
    location: mode === 'mb'
      ? { pathname: '/release/11111111-2222-3333-4444-555555555555', search: '', hash: '', href: 'https://musicbrainz.org/release/11111111-2222-3333-4444-555555555555' }
      : { pathname: '/album', search: '?id=1', hash: '', href: 'https://music.163.com/album?id=1' },
    document: {
      body,
      createElement: t => { const e = new El(t); if (String(t).toLowerCase() === 'img') { e.naturalWidth = 800; e.naturalHeight = 800; } return e; },
      createTextNode: t => new Txt(t),
      getElementById: id => findById(body, id),
      querySelector: s => { const e = selectors[s]; return (e && e.isConnected) ? e : null; },
      querySelectorAll: s => { const e = selectors[s]; return (e && e.isConnected) ? [e] : []; },
    },
    fetch: async url => {
      url = String(url);
      const mk = p => ({ ok: true, status: 200, clone() { return this; }, json: async () => p, blob: async () => ({ type: 'image/jpg', size: 1000 }) });
      if (/ws\/2\/release\/[0-9a-f-]+\?inc=url-rels/.test(url)) return mk({ relations: [{ url: { resource: 'https://music.163.com/#/album?id=1' } }] });
      if (/music\.126\.net/.test(url)) return { ok: true, status: 200, blob: async () => ({ type: 'image/jpg', size: 130018 }) };
      if (/\/api\/album\//.test(url)) return mk(ALBUM);
      if (/ws\/2\/label/.test(url)) return mk(MB_LABEL);
      if (/ws\/2\/artist/.test(url)) return mk(MB_ARTIST);
      throw new Error('未预期的 fetch: ' + url);
    },
    GM_info: { script: { version: '1.0.0' } },
    unsafeWindow: undefined,
    GM_getValue: (k, d) => GM_STORE.has(k) ? GM_STORE.get(k) : (d === undefined ? null : d),
    GM_setValue: (k, v) => { GM_STORE.set(k, v); },
    GM_xmlhttpRequest: o => setTimeout(() => o.onload({ status: 200, responseText: JSON.stringify({ data: { song: { list: [{ albummid: 'AAA', albumname: '测试专辑' }] } } }), response: { type: 'image/jpeg', size: 900 } }), 0),
    DataTransfer: class { constructor() { this.files = { length: 1, _f: null }; this.items = { add: f => { this.files._f = f; } }; } },
    File: class { constructor(parts, name, opts) { this.name = name; this.type = (opts && opts.type) || ''; this.size = (parts[0] && parts[0].size) || 0; } },
    Event: class { constructor(t) { this.type = t; } },
    setTimeout, clearTimeout, setInterval, clearInterval,
    Math, JSON, Map, Set, Array, Object, String, Number, Promise, Error, RegExp, Date,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'userscript.js' });
  return { body, fileInput };
}

const wait = ms => new Promise(r => setTimeout(r, ms));
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) console.log('  ✓ ' + name);
  else { fail++; console.log('  ✗ ' + name + (detail !== undefined ? '  → ' + detail : '')); }
};
const fieldValues = (form, name) => form.querySelectorAll('input').filter(i => i.name === name).map(i => i.value);

/* ---------- 元数据规范检查 ----------
 * 这几条是从一次真实评审意见来的：@grant 不能一行写多个、@match 不能开得太大。 */
function checkMetadata() {
  const header = SRC.slice(0, SRC.indexOf('// ==/UserScript=='));
  const lines = header.split('\n').filter(l => l.startsWith('// @'));
  const field = name => lines.filter(l => l.startsWith(`// @${name} `) || l.startsWith(`// @${name}:`))
    .map(l => l.replace(/^\/\/ @[^\s]+\s+/, ''));

  console.log('\n[元数据规范]');
  const grants = field('grant');
  check('@grant 三项各自独占一行', grants.length === 3, JSON.stringify(grants));
  check('@grant 没有任何一行用 / 或 , 分隔多个 API',
    grants.every(g => !/[\/,]/.test(g)), JSON.stringify(grants));
  // 声明了就要真用，否则权限白要（评审会问）
  check('声明的 @grant 都在代码里用到了',
    grants.every(g => (SRC.match(new RegExp('\\b' + g + '\\b', 'g')) || []).length > 1),
    JSON.stringify(grants));

  const matches = field('match');
  check('@match 已收窄，不是整个站点',
    matches.length > 0 && matches.every(m => !/^https?:\/\/[^/]+\/\*$/.test(m)), JSON.stringify(matches));
  check('@match 覆盖到专辑页与发行页',
    matches.some(m => m.includes('music.163.com/album')) && matches.some(m => m.includes('musicbrainz.org/release')),
    JSON.stringify(matches));

  check('@name 与 @description 都在', field('name').length > 0 && field('description').length > 0);
  check('@namespace 不是私人地址',
    field('namespace').every(n => !/github\.com\/[^/]+$/.test(n)), JSON.stringify(field('namespace')));
  check('@version 是语义化版本',
    field('version').every(v => /^\d+\.\d+\.\d+$/.test(v)), JSON.stringify(field('version')));
}


(async () => {
  checkMetadata();

  console.log('\n[网易云专辑页]');
  {
    const { body } = run({ mode: 'netease' });
    await wait(400);
    const host = findById(body, 'nm2mb-host');
    check('注入了按钮', !!host);
    const root = host && host.shadowRoot;
    check('按钮挂在 shadow root 里', !!root);
    check('摘要正确（2 首 · 6:20 · 专辑）', root.querySelector('.meta').textContent === '2 首 · 6:20 · Album',
      root.querySelector('.meta').textContent);
    check('检出曲目缺口', !!root.querySelector('.warn'));

    root.querySelector('button').click();
    await wait(1500);
    const panel = root.querySelector('.panel');
    check('弹出核对面板', !!panel);
    check('发行日期按 UTC+8 解析为 2012-08-10', /2012-08-10/.test(panel.innerText), panel.innerText.slice(0, 200));
    check('类型含 secondary（现场版 -> Live）', /Live/.test(panel.innerText));
    check('厂牌已匹配', /测试厂牌/.test(panel.innerText));
    check('标记出缺失的曲目号', /曲目号 1\b/.test(panel.innerText));

    panel.querySelector('.actions').children[1].click();
    await wait(50);
    check('提交了表单', SUBMITTED.length === 1);
    const F = SUBMITTED[0];
    check('name 正确', fieldValues(F, 'name')[0] === '测试专辑');
    check('曲目按 no 排序（第二首在前）', fieldValues(F, 'mediums.0.track.0.name')[0] === '第二首',
      fieldValues(F, 'mediums.0.track.0.name')[0]);
    check('时长是毫秒整数', fieldValues(F, 'mediums.0.track.0.length')[0] === '180000');
    check('type 给了两次（Album + Live）', JSON.stringify(fieldValues(F, 'type')) === '["Album","Live"]',
      JSON.stringify(fieldValues(F, 'type')));
    check('artist 三字段齐全',
      fieldValues(F, 'artist_credit.names.0.name')[0] === '某歌手' &&
      fieldValues(F, 'artist_credit.names.0.mbid')[0] === 'art-1');
    check('厂牌带 mbid', fieldValues(F, 'labels.0.mbid')[0] === 'lab-1');
    check('link_type = 980', fieldValues(F, 'urls.0.link_type')[0] === '980');
    check('urls.0.url 是网易云原页', fieldValues(F, 'urls.0.url')[0] === 'https://music.163.com/#/album?id=1');

    const stash = GM_STORE.get('nm2mb:cover:1');
    check('存下了封面信息供 MB 侧使用', !!stash && !!stash.cover, String(stash));
    // 接口返回的 picUrl 带 ?param=130y130，必须剥掉才是原图
    check('封面 URL 已剥掉裁剪参数', !!stash && stash.cover === 'https://p2.music.126.net/x/cover.jpg',
      stash && stash.cover);
    check('封面缓存里带上了标题与艺术家（QQ 搜索要用）',
      !!stash && stash.title === '测试专辑' && JSON.stringify(stash.artists) === '["某歌手"]',
      stash && JSON.stringify(stash));
  }

  console.log('\n[MusicBrainz 发行页]');
  {
    const { body, fileInput } = run({ mode: 'mb' });
    await wait(1200);
    const host = findById(body, 'nm2mb-cover');
    check('显示封面面板', !!host);
    const root = host && host.shadowRoot;
    const cards = root ? root.querySelectorAll('.cover-card') : [];
    check('网易云 + QQ音乐 两张卡片', cards.length === 2, 'cards=' + cards.length);
    const qq = cards.find(c => c.innerText.includes('QQ音乐'));
    const btn = qq && qq.querySelector('button');
    if (btn) {
      btn.dispatchEvent(new Event('click'));
      await wait(300);
      const f = fileInput.files && fileInput.files._f;
      check('封面塞进了 file input', !!f);
      check('MIME 归一化为 image/jpeg', !!f && f.type === 'image/jpeg', f && f.type);
    }
  }

  console.log(fail === 0 ? '\n全部通过 ✅' : `\n${fail} 项失败 ❌`);
  process.exit(fail ? 1 : 0);
})();
