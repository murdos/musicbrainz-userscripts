// ==UserScript==
// @name         网易云音乐 → MusicBrainz
// @name:en      NetEase Cloud Music to MusicBrainz
// @namespace    netease_importer
// @version      1.0.0
// @description  在网易云音乐专辑页提取专辑/艺术家/发行日期/厂牌/曲目表，预填 MusicBrainz 发布编辑器；并在 MusicBrainz 发行页把封面补传上去（网易云 / QQ音乐 可选）
// @description:en  Extract album, artists, release date, label and full tracklist from a NetEase Cloud Music album page and pre-fill the MusicBrainz release editor. Also adds cover art on MusicBrainz release pages (NetEase / QQ Music).
// @author       S3608362
// @match        https://music.163.com/album*
// @match        https://musicbrainz.org/release/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @license      MIT
// ==/UserScript==

/*
 * 注意：本脚本刻意不加 @noframes —— 网易云专辑页的真实内容在内层 iframe 里
 * （外层壳 #/album?id=N，内层 /album?id=N），加了 @noframes 就完全不工作。
 *
 * 下面带 ★ 的注释都是踩过的坑，改代码前先读。
 */

(function () {
  'use strict';

  const CFG = {
    /*
     * Release↔URL 关系类型 ID（musicbrainz.org/relationship/<uuid> 可查）：
     *   980 = streaming page（"can be streamed at"）
     *   85  = free streaming（"can be streamed for free at"）
     * 别填 286 —— 那是 Allmusic，与流媒体无关。
     * 选 980 而非 85：MB 文档把 Spotify 归为 free streaming，网易云同为 freemium，
     * 按文档该用 85；但网易云大量曲目要 VIP，写 "for free" 是不准确的断言。
     */
    LINK_TYPE: 980,

    // 网易云是中国平台，在它上面那条发行按 CN 记。留空字符串则不填这一项。
    DEFAULT_COUNTRY: 'CN',

    // 曲目类型优先用网易云自己的标注（实测取值：专辑/Single/EP/精选集），
    // 识别不了时才按曲目数+总时长推断。
    PREFER_NETEASE_TYPE: true,
    EP_MAX_TRACKS: 6,
    EP_MAX_MS: 30 * 60 * 1000,

    /*
     * ★ 必须固定按 UTC+8 解析发行时间，不能依赖访客本机时区。
     * 网易云的 publishTime 是「北京时间 00:00」的绝对时间戳 ——
     * 实测多张专辑对 86400000 取模恒等于 57600000（= 16:00 UTC）。
     * 若用本地时区，UTC 及以西的访客会看到日期整体差一天。
     */
    NETEASE_TZ_OFFSET_MS: 8 * 3600 * 1000,

    ANCHOR_TIMEOUT_MS: 8000,
    // 备选挂载点，按优先级排列；全都找不到就退化成右下角浮动按钮
    ANCHORS: ['.m-info .cnt h2', '.m-info .cnt', '.m-info', '#content-operation', '.m-info .head'],

    MB_API: 'https://musicbrainz.org/ws/2',
    // MB 建议平均不超过 1 请求/秒，两次查询之间留间隔
    MB_LOOKUP_GAP_MS: 1100,
    /*
     * ★ 连续请求会被 MB 以 HTTP 503 拒绝（body 写着 "currently busy"），必须退避重试。
     * 不重试的话，`json.artists || []` 会把 503 的错误响应当成「搜索无结果」，
     * 于是把限流静默误判成「MusicBrainz 里没有这个艺术家」。
     */
    MB_RETRY_ATTEMPTS: 3,
    MB_RETRY_DELAY_MS: 1500,

    COVER_KEY_PREFIX: 'nm2mb:cover:',
  };

  const SCRIPT_NAME = 'NetEase Cloud Music → MusicBrainz';
  // 从 GM_info 读，避免 @version 与这里各写一份、改一处忘一处
  const SCRIPT_VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version)
    ? GM_info.script.version
    : '1.0.0';

  // 网易云的专辑 type -> MB release group 主类型（可附带 secondary type）
  const NETEASE_TYPE_MAP = {
    '专辑': { primary: 'Album' },
    'Single': { primary: 'Single' },
    'EP': { primary: 'EP' },
    '精选集': { primary: 'Album', secondary: ['Compilation'] },
  };

  // 网易云的 subType -> MB secondary type。
  // 实测取值只有 录音室版 / 现场版 / Remix，录音室版没有对应的附加类型。
  // 字符串已对着 MB 数据核实过（Live / Compilation / Remix / Soundtrack）。
  const NETEASE_SUBTYPE_MAP = {
    '现场版': 'Live',
    'Remix': 'Remix',
  };

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */

  // GM 存储包装：非油猴环境（如单测）下静默降级，不影响主流程
  const store = {
    get(key) {
      try { return typeof GM_getValue === 'function' ? GM_getValue(key, null) : null; }
      catch (e) { return null; }
    },
    set(key, value) {
      try { if (typeof GM_setValue === 'function') GM_setValue(key, value); }
      catch (e) {}
    },
  };

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  // ★ UI 一律放进 shadow root，否则宿主页面的 CSS 会把按钮挤变形；
  //   反过来，往 body 直接 append 的元素拿不到这里的样式（踩过：封面面板曾经
  //   因为没有 shadow root 而变成无样式裸 div，掉到页面最底下，看着像没生效）
  function createHost(id) {
    const host = el('div');
    host.id = id;
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    return { host, root };
  }

  function formatDuration(ms) {
    const total = Math.round(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Lucene 特殊字符转义，否则厂牌名里的引号/斜杠会破坏 MB 查询
  function escapeLucene(s) {
    return String(s).replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\|)/g, '\\$1');
  }

  /* ------------------------------------------------------------------ *
   * 网易云：取数与归一化
   * ------------------------------------------------------------------ */

  /*
   * 只处理内层真实专辑文档（pathname 为 /album）。
   * 外层壳是 music.163.com/#/album?id=N，pathname 为 /，交给内层处理即可 ——
   * 内层每次切专辑都会真实导航，脚本自然重跑，不必监听 hash。
   */
  function getAlbumId() {
    if (!/^\/album\/?$/.test(location.pathname)) return null;
    const sources = [location.search];
    const q = location.hash.indexOf('?');
    if (q >= 0) sources.push(location.hash.slice(q));
    for (const s of sources) {
      const id = new URLSearchParams(s).get('id');
      if (id && /^\d+$/.test(id)) return id;
    }
    return null;
  }

  /*
   * 数据走接口而不是抓 DOM：桌面版专辑页未登录时是登录墙
   * （只返回 #album-empty-login 占位，DOM 里没有 .m-info），
   * 而该接口匿名可用，且直接给出毫秒时长、曲目号、碟号、发行时间戳、厂牌。
   */
  async function fetchAlbum(id) {
    const res = await fetch(`/api/album/${id}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`接口返回 HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 200 || !json.album) throw new Error(`接口返回 code=${json.code}`);
    return json.album;
  }

  function parsePublishDate(ts) {
    if (typeof ts !== 'number' || !(ts > 0)) return null;
    const d = new Date(ts + CFG.NETEASE_TZ_OFFSET_MS);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  }

  function toMs(v) {
    return typeof v === 'number' && v > 0 ? Math.round(v) : null;
  }

  function inferReleaseType(trackCount, totalLengthMs) {
    if (trackCount === 1) return 'Single';
    if (trackCount <= CFG.EP_MAX_TRACKS) {
      return totalLengthMs > 0 && totalLengthMs < CFG.EP_MAX_MS ? 'EP' : 'Album';
    }
    return 'Album';
  }

  function buildRelease(album, id) {
    const list = album.artists && album.artists.length
      ? album.artists
      : (album.artist ? [album.artist] : []);
    const artists = list.map(x => (x && x.name ? String(x.name).trim() : '')).filter(Boolean);

    /*
     * ★ 接口不保证按曲序返回（实测首个元素就是 no:2），必须自己按 disc -> no 排。
     * 直接信任数组顺序会把整张专辑的曲序打乱。
     */
    const songs = (album.songs || []).slice().sort((x, y) => {
      const dx = parseInt(x.disc, 10) || 1;
      const dy = parseInt(y.disc, 10) || 1;
      return dx !== dy ? dx - dy : (x.no || 0) - (y.no || 0);
    });

    const byDisc = new Map();
    for (const s of songs) {
      const dn = parseInt(s.disc, 10) || 1;
      if (!byDisc.has(dn)) byDisc.set(dn, []);
      byDisc.get(dn).push({
        neteaseNo: s.no,
        title: String(s.name || '').trim(),
        lengthMs: toMs(s.duration),
        // 每曲自己的艺术家，可能与专辑整体不同（合唱曲）
        artists: Array.isArray(s.artists)
          ? s.artists.map(a => (a && a.name ? String(a.name).trim() : '')).filter(Boolean)
          : [],
      });
    }

    const warnings = [];
    const mediums = [];
    const trackArtists = new Set();
    let trackCount = 0;
    let totalLengthMs = 0;

    for (const dn of Array.from(byDisc.keys()).sort((a, b) => a - b)) {
      const rows = byDisc.get(dn);

      /*
       * ★ 网易云会静默丢弃「不可用」的曲目，但保留原始曲目号 —— 缺口就是线索。
       * 实测《神的游戏》返回 9 首、编号 2–10（缺第 1 首〈玫瑰色的你〉）；
       * 《Original》size 报 40，编号却是 1–22/24–32/34–42（缺 23、33）。
       * 注意 size 只等于返回条数，不是专辑真实曲目数。
       * 不提示缺口的话，会往 MusicBrainz 提交一张残缺专辑。
       *
       * 用集合差集找缺口，别逐位比对序号 —— 整碟平移时后者会把每一首都报成缺口。
       */
      const maxNo = rows.reduce((m, r) => Math.max(m, r.neteaseNo || 0), 0);
      const actual = new Set(rows.map(r => r.neteaseNo));
      const missing = [];
      for (let i = 1; i <= maxNo; i++) if (!actual.has(i)) missing.push(i);
      if (missing.length) {
        warnings.push(
          `第 ${dn} 碟缺 ${missing.length} 首（曲目号 ${missing.join(', ')}）——` +
          `网易云未提供，可能因版权下架，导入后请手动补齐`
        );
      }

      // MB 的曲序由下标决定，这里顺次编号
      const tracks = rows.map((r, i) => {
        trackCount++;
        if (r.lengthMs) totalLengthMs += r.lengthMs;
        r.artists.forEach(a => trackArtists.add(a));
        return {
          number: i + 1,
          neteaseNo: r.neteaseNo,
          title: r.title,
          lengthMs: r.lengthMs,
          artists: r.artists,
        };
      });

      mediums.push({ discNumber: dn, format: 'Digital Media', tracks });
    }

    const inferredType = inferReleaseType(trackCount, totalLengthMs);
    const mapped = NETEASE_TYPE_MAP[String(album.type || '').trim()] || null;
    const useNetease = CFG.PREFER_NETEASE_TYPE && mapped;

    const secondaryTypes = [];
    if (useNetease && mapped.secondary) secondaryTypes.push(...mapped.secondary);
    const subMapped = NETEASE_SUBTYPE_MAP[String(album.subType || '').trim()];
    if (subMapped && !secondaryTypes.includes(subMapped)) secondaryTypes.push(subMapped);

    return {
      albumId: id,
      sourceUrl: `https://music.163.com/#/album?id=${id}`,
      title: String(album.name || '').trim(),
      artists,
      artistCredit: artists.join(' & '),
      // 只把专辑 credit 之外的曲目艺术家单独拿去查，省一次请求
      trackArtists: Array.from(trackArtists).filter(n => !artists.includes(n)),
      date: parsePublishDate(album.publishTime),
      label: String(album.company || '').trim() || null,
      // 去掉 ?param= 之类的裁剪参数，取原图
      cover: album.picUrl ? String(album.picUrl).split('?')[0] : null,
      releaseType: useNetease ? mapped.primary : inferredType,
      secondaryTypes,
      typeSource: useNetease ? 'netease' : 'inferred',
      neteaseType: album.type || null,
      neteaseSubType: album.subType || null,
      trackCount,
      totalLengthMs,
      warnings,
      mediums,
    };
  }

  /* ------------------------------------------------------------------ *
   * MusicBrainz 查询
   * ------------------------------------------------------------------ */

  function normalizeName(s) {
    return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /*
   * ★ 在搜索结果里找精确匹配（含别名），找不到返回 null —— 绝不能取第一条。
   * MB 搜索是模糊的，而且对中文尤其不可靠：实测查「猛犸文化」时
   * score 100 返回的是 Music Nation。
   *
   * 别名匹配是刚需而非锦上添花：网易云写简体「张悬」，MB 正名是繁体「張懸」，
   * 不比别名就永远匹配不上，白白丢掉 MBID。
   */
  function findExactMatch(entities, wanted) {
    const target = normalizeName(wanted);
    if (!target) return null;
    let aliasHit = null;
    for (const e of entities || []) {
      if (normalizeName(e.name) === target) return { entity: e, via: 'name' };
      if (!aliasHit && (e.aliases || []).some(a => normalizeName(a.name) === target)) {
        aliasHit = { entity: e, via: 'alias' };
      }
    }
    return aliasHit;
  }

  async function mbSearch(entity, query) {
    const url = `${CFG.MB_API}/${entity}?query=${encodeURIComponent(query)}&fmt=json&limit=25`;
    let lastErr = null;

    for (let attempt = 0; attempt < CFG.MB_RETRY_ATTEMPTS; attempt++) {
      if (attempt) await sleep(CFG.MB_RETRY_DELAY_MS);

      let res;
      try {
        res = await fetch(url, { headers: { Accept: 'application/json' } });
      } catch (err) {
        lastErr = err;
        continue;
      }

      // 见 CFG.MB_RETRY_ATTEMPTS 的说明：503 必须重试，不能当成「没找到」
      if (res.status === 503) {
        lastErr = new Error(`MusicBrainz 服务繁忙（HTTP 503），已重试 ${attempt + 1} 次`);
        continue;
      }
      if (!res.ok) throw new Error(`MusicBrainz ${entity} 查询返回 HTTP ${res.status}`);

      const json = await res.json();
      return json[entity === 'label' ? 'labels' : 'artists'] || [];
    }

    throw lastErr || new Error('MusicBrainz 查询失败');
  }

  async function lookupMusicBrainz(data) {
    const result = { label: null, labelError: null, artists: new Map(), artistError: null };

    if (data.label) {
      try {
        const hits = await mbSearch('label', `label:"${escapeLucene(data.label)}"`);
        result.label = findExactMatch(hits, data.label);
      } catch (err) {
        result.labelError = String(err.message || err);
      }
    }

    // 专辑艺术家 + 只在曲目上出现的艺术家，合并成一次查询，避免撞限流
    const allArtists = data.artists.concat(data.trackArtists || []);
    if (allArtists.length) {
      await sleep(CFG.MB_LOOKUP_GAP_MS);
      try {
        const q = 'artist:(' + allArtists.map(n => `"${escapeLucene(n)}"`).join(' OR ') + ')';
        const hits = await mbSearch('artist', q);
        for (const name of allArtists) result.artists.set(name, findExactMatch(hits, name));
      } catch (err) {
        result.artistError = String(err.message || err);
      }
    }

    return result;
  }

  /*
   * 提交前查重用的搜索链接。
   *
   * ★ 两个坑：
   *   1. 不要拼 `release:"X" AND artist:"Y"` 这种高级语法 —— 会跳到 MB 的高级搜索，
   *      而且只要其中一个词在 MB 里不存在，整条查询必然 0 结果。
   *   2. 艺术家只能用「在 MB 里确实匹配到」的规范名。
   *      曾经直接拿网易云的第一位艺术家拼查询，那位恰好在 MB 里没有，
   *      于是查重链接永远返回 No results —— 功能看着在，实际是死的。
   * 一个艺术家都没匹配上时就只按标题查，宁可查宽也不能查不到。
   */
  function buildSearchUrl(data, lookup) {
    const parts = [];
    if (data.title) parts.push(data.title);
    const hit = data.artists.map(n => lookup && lookup.artists.get(n)).find(Boolean);
    if (hit) parts.push(hit.entity.name);
    const q = parts.join(' ').trim() || data.title;
    return `https://musicbrainz.org/search?query=${encodeURIComponent(q)}&type=release`;
  }

  /* ------------------------------------------------------------------ *
   * 表单 Seeding
   * ------------------------------------------------------------------ */

  /*
   * 写一组 artist credit 参数。prefix 为空 = 专辑整体，形如 'mediums.0.track.1.' = 单曲。
   *
   * ★ 三个字段都要填，这是读 MusicBrainz 服务端源码确认的：
   *   name        = 源站上的署名字样
   *   artist.name = MB 规范名（供编辑器检索定位）
   *   mbid        = 只有它合法时服务端才会给该艺术家赋值、编辑器里那个字段才会变绿
   * 另外 MB 完全支持多艺术家 credit（参见《Watch the Throne》），不是「只能写一个」。
   */
  function addArtistCredit(add, prefix, names, lookup) {
    names.forEach((name, i) => {
      const hit = lookup && lookup.artists.get(name);
      add(`${prefix}artist_credit.names.${i}.name`, name);
      add(`${prefix}artist_credit.names.${i}.artist.name`, hit ? hit.entity.name : name);
      if (hit) add(`${prefix}artist_credit.names.${i}.mbid`, hit.entity.id);
      if (i < names.length - 1) add(`${prefix}artist_credit.names.${i}.join_phrase`, ' & ');
    });
  }

  // ★ 不要再把 artist credit 抽成带前缀的公共函数 —— 它的 prefix 本身已经包含
  //   "artist_credit."，调用处若再拼一次会生成 xxx.artist_credit.artist_credit.names.0.name
  //   这种非法字段，MB 会按 unknown field 报错。
  function buildSeedForm(data, lookup) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://musicbrainz.org/release/add';
    form.target = '_blank';
    form.style.display = 'none';

    const add = (name, value) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };

    add('name', data.title);
    addArtistCredit(add, '', data.artists, lookup);

    // type 允许给多次：一次主类型，其余是 secondary type
    add('type', data.releaseType);
    data.secondaryTypes.forEach(st => add('type', st));

    add('status', 'official');   // 小写 token，见 seeding 文档
    add('packaging', 'none');    // 服务端按 lower(name) 匹配，对应封装类型 "None"

    if (data.date) {
      add('events.0.date.year', String(data.date.year));
      if (data.date.month) add('events.0.date.month', String(data.date.month));
      if (data.date.day) add('events.0.date.day', String(data.date.day));
    }
    if (CFG.DEFAULT_COUNTRY) add('events.0.country', CFG.DEFAULT_COUNTRY);

    /*
     * ★ 厂牌只有精确命中 MB 才填。
     * 只填名称而不带 mbid，编辑器会报 "You haven't selected a label for “X”."，
     * 因为未解析的厂牌在它看来是错误状态。查不到就整个不填，
     * 名称写进编辑备注，信息不丢，但不会让编辑页一打开就顶着一条红字。
     *
     * 注意这和「找不到的艺术家」处理不同：厂牌留空是正常状态，
     * 而 artist credit 少一个人就是数据错误，所以艺术家那边宁可留红让人补。
     */
    if (data.label && lookup && lookup.label) {
      add('labels.0.mbid', lookup.label.entity.id);
      add('labels.0.name', lookup.label.entity.name);
    }

    data.mediums.forEach((medium, mi) => {
      add(`mediums.${mi}.format`, medium.format);
      medium.tracks.forEach((track, ti) => {
        const p = `mediums.${mi}.track.${ti}.`;
        add(`${p}number`, String(track.number));
        add(`${p}name`, track.title);
        if (track.lengthMs) add(`${p}length`, String(track.lengthMs));

        // 曲目艺术家只在和专辑整体不同时才写 —— MB 的规矩是相同就继承专辑 credit
        if (track.artists.length && track.artists.join(' & ') !== data.artistCredit) {
          addArtistCredit(add, p, track.artists, lookup);
        }
      });
    });

    add('urls.0.url', data.sourceUrl);
    add('urls.0.link_type', String(CFG.LINK_TYPE));

    // 编辑备注：正文 + 「–」分隔线 + 工具署名（MB 用户脚本社区的惯例）
    const blocks = ['Imported from NetEase Cloud Music via Userscript'];
    if (data.label && !(lookup && lookup.label)) {
      blocks.push(`源站厂牌：${data.label}（MusicBrainz 中无此厂牌，未预填）`);
    }
    if (data.warnings.length) blocks.push('⚠ ' + data.warnings.join('\n⚠ '));
    blocks.push(`${SCRIPT_NAME} v${SCRIPT_VERSION}`);
    add('edit_note', blocks.join('\n\n–\n'));

    return form;
  }

  function submitToMusicBrainz(data, lookup) {
    const form = buildSeedForm(data, lookup);
    document.body.appendChild(form);
    form.submit();
    setTimeout(() => form.remove(), 2000);
  }

  /* ------------------------------------------------------------------ *
   * 样式
   * ------------------------------------------------------------------ */

  const CSS = `
    .wrap {
      display: inline-flex; align-items: center; gap: 8px;
      font: 12px/1.5 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #333;
    }
    .wrap.card {
      background: #fff; padding: 8px 10px; border-radius: 10px;
      box-shadow: 0 4px 18px rgba(0,0,0,.18);
    }
    button {
      font: inherit; cursor: pointer; border: 0; border-radius: 6px;
      padding: 6px 12px; background: #c20c0c; color: #fff; white-space: nowrap;
    }
    button:hover { background: #a30a0a; }
    button:disabled { background: #bbb; cursor: default; }
    .meta { color: #888; white-space: nowrap; }
    .warn { color: #e08a00; cursor: help; white-space: nowrap; }

    .panel {
      position: fixed; right: 24px; bottom: 24px; z-index: 2147483000;
      width: 340px; max-height: 78vh; overflow: auto;
      background: #fff; border-radius: 10px; padding: 14px 16px;
      box-shadow: 0 8px 30px rgba(0,0,0,.26);
      font: 12px/1.7 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #333;
    }
    .panel h4 { margin: 0 0 10px; font-size: 13px; }
    .panel .head { display: flex; gap: 10px; margin-bottom: 10px; }
    .panel .head img { width: 56px; height: 56px; border-radius: 6px; object-fit: cover; flex: none; }
    .panel .head .t { font-size: 13px; font-weight: 600; word-break: break-all; }
    .panel .head .s { color: #888; }
    dl { margin: 0 0 8px; display: grid; grid-template-columns: 44px 1fr; gap: 2px 8px; }
    dt { color: #888; }
    dd { margin: 0; word-break: break-all; }
    .artists { margin: 0 0 8px; padding-left: 44px; }
    .artists .row { display: flex; align-items: baseline; gap: 6px; }
    .mark { flex: none; width: 12px; }
    .mark.ok { color: #1a9c4a; }
    .mark.miss { color: #c00; font-weight: 700; }
    .tag { color: #888; }
    .mb { color: #1a9c4a; text-decoration: none; border-bottom: 1px dotted #1a9c4a; }
    .notes { margin: 8px 0; padding: 8px 10px; border-radius: 6px; background: #fff8e8; color: #8a6a00; }
    .notes.err { background: #fdecec; color: #a33; }
    .notes.bad { background: #fdecec; color: #b00; border-left: 3px solid #c00; }
    .notes.bad b { color: #c00; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 10px; }
    .ghost { background: transparent; color: #666; }

    .cover-panel {
      position: fixed; right: 24px; bottom: 24px; z-index: 2147483000;
      background: #fff; border-radius: 10px; padding: 12px 14px;
      box-shadow: 0 6px 24px rgba(0,0,0,.24); max-width: 440px;
      font: 12px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #333;
    }
    .cover-panel h5 { margin: 0 0 8px; font-size: 12px; color: #666; }
    .cover-grid { display: flex; gap: 12px; flex-wrap: wrap; }
    .cover-card { width: 118px; text-align: center; }
    .cover-card img { width: 118px; height: 118px; object-fit: cover; border-radius: 6px; background: #f2f2f2; }
    .cover-card .info { color: #888; margin: 4px 0; word-break: break-all; }
    .cover-card a { margin-left: 8px; }
    .hint { color: #888; }
  `;

  /* ------------------------------------------------------------------ *
   * 网易云侧 UI
   * ------------------------------------------------------------------ */

  function locateAnchor() {
    for (const sel of CFG.ANCHORS) {
      const node = document.querySelector(sel);
      if (node && node.parentNode) return { mode: 'after', node };
    }
    return { mode: 'floating', node: null };
  }

  // 页面内容可能是异步渲染的，等一会儿；等不到就用浮动按钮兜底
  function waitForAnchor() {
    return new Promise(resolve => {
      const first = locateAnchor();
      if (first.mode !== 'floating') return resolve(first);
      const deadline = Date.now() + CFG.ANCHOR_TIMEOUT_MS;
      const timer = setInterval(() => {
        const hit = locateAnchor();
        if (hit.mode !== 'floating' || Date.now() > deadline) {
          clearInterval(timer);
          resolve(hit);
        }
      }, 250);
    });
  }

  function mountFloating(host, root) {
    host.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483000;';
    root.querySelector('.wrap').classList.add('card');
    if (host.parentNode !== document.body) document.body.appendChild(host);
  }

  // 挂载只有这一条路径，避免「先插入再 appendChild」把节点搬走
  function mount(host, root, anchor) {
    if (anchor.mode === 'after') anchor.node.parentNode.insertBefore(host, anchor.node.nextSibling);
    else mountFloating(host, root);
  }

  function mbLink(entityType, entity) {
    const a = el('a', 'mb', entity.name);
    a.href = `https://musicbrainz.org/${entityType}/${entity.id}`;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.title = `在 MusicBrainz 中查看（MBID ${entity.id}）`;
    return a;
  }

  // 核对面板：先查 MusicBrainz，把查到的/没查到的都摆出来让人过目
  function openReview(root, data, ensureLookup) {
    const existing = root.querySelector('.panel');
    if (existing) existing.remove();

    const panel = el('div', 'panel');
    panel.appendChild(el('h4', null, '导入至 MusicBrainz — 请核对'));

    const head = el('div', 'head');
    if (data.cover) {
      const img = document.createElement('img');
      img.src = data.cover;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      head.appendChild(img);
    }
    const headText = el('div');
    headText.appendChild(el('div', 't', data.title));
    const bits = [`${data.trackCount} 首`];
    if (data.totalLengthMs) bits.push(formatDuration(data.totalLengthMs));
    headText.appendChild(el('div', 's', bits.join(' · ')));
    head.appendChild(headText);
    panel.appendChild(head);

    const loading = el('div', 'tag', '正在查询 MusicBrainz…');
    panel.appendChild(loading);

    const body = el('div');
    panel.appendChild(body);

    const actions = el('div', 'actions');
    const cancel = el('button', 'ghost', '取消');
    cancel.type = 'button';
    cancel.addEventListener('click', () => panel.remove());
    const go = el('button', null, '确认导入');
    go.type = 'button';
    go.disabled = true;
    actions.append(cancel, go);
    panel.appendChild(actions);

    root.appendChild(panel);

    (async () => {
      let lookup;
      try {
        lookup = await ensureLookup();
      } catch (err) {
        lookup = { label: null, artists: new Map(), fatal: String(err.message || err) };
      }
      if (!panel.isConnected) return;   // 查询期间用户已经取消了
      loading.remove();

      const dl = el('dl');
      const row = (k, v) => { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); };

      let typeText = data.typeSource === 'netease'
        ? `${data.releaseType}（网易云标注${data.neteaseSubType ? '，' + data.neteaseSubType : ''}）`
        : `${data.releaseType}（按曲目数推断）`;
      if (data.secondaryTypes.length) typeText += ` ＋ ${data.secondaryTypes.join(' ＋ ')}`;
      row('类型', typeText);

      if (data.date) {
        row('发行', [data.date.year, data.date.month, data.date.day]
          .filter(Boolean).map((n, i) => i === 0 ? String(n) : String(n).padStart(2, '0')).join('-'));
      }

      const labelDd = el('dd');
      if (!data.label) {
        labelDd.appendChild(el('span', 'tag', '（网易云未提供）'));
      } else if (lookup.label) {
        labelDd.appendChild(mbLink('label', lookup.label.entity));
        labelDd.appendChild(el('span', 'tag', lookup.label.via === 'alias' ? '　已按别名匹配' : '　已匹配'));
      } else {
        labelDd.appendChild(document.createTextNode(data.label + '　'));
        labelDd.appendChild(el('span', 'tag', '未找到，不预填（名称已记入编辑备注）'));
      }
      dl.appendChild(el('dt', null, '厂牌'));
      dl.appendChild(labelDd);

      dl.appendChild(el('dt', null, '曲目'));
      const lengthText = data.totalLengthMs ? ` · ${formatDuration(data.totalLengthMs)}` : '';
      dl.appendChild(el('dd', null, `${data.trackCount} 首${lengthText}`));
      body.appendChild(dl);

      const artistBox = el('div', 'artists');
      data.artists.forEach(name => {
        const hit = lookup.artists.get(name);
        const line = el('div', 'row');
        line.appendChild(el('span', 'mark ' + (hit ? 'ok' : 'miss'), hit ? '✓' : '✕'));
        if (hit) {
          line.appendChild(mbLink('artist', hit.entity));
          if (hit.via === 'alias') line.appendChild(el('span', 'tag', '　按别名匹配'));
        } else {
          line.appendChild(document.createTextNode(name));
          line.appendChild(el('span', 'tag', '　MusicBrainz 里没有'));
        }
        artistBox.appendChild(line);
      });
      body.appendChild(artistBox);

      const checkLine = el('div');
      checkLine.appendChild(el('span', 'tag', '导入前建议先查重：'));
      const checkLink = el('a', 'mb', '在 MusicBrainz 搜索这张专辑');
      checkLink.href = buildSearchUrl(data, lookup);
      checkLink.target = '_blank';
      checkLink.rel = 'noreferrer';
      checkLine.appendChild(checkLink);
      body.appendChild(checkLine);

      if (lookup.fatal || lookup.labelError || lookup.artistError) {
        body.appendChild(el('div', 'notes err',
          'MusicBrainz 查询失败：' + (lookup.fatal || lookup.labelError || lookup.artistError)
          + '。将只按名称填入。'));
      }

      /*
       * ★ 找不到的艺术家不做剔除，宁可让 MB 编辑器报红。
       * 剔掉之后 credit 在编辑器里是一片绿、毫无提示，很容易被直接提交 ——
       * 那等于往 MusicBrainz 写了一份少了人的 credit。
       * 红字本身就是 MB 在拦你，是想要的行为。
       */
      const missedArtists = data.artists.filter(n => !lookup.artists.get(n));
      if (missedArtists.length) {
        const box = el('div', 'notes bad');
        box.appendChild(el('b', null, `⚠ ${missedArtists.join('、')} 在 MusicBrainz 中不存在。`));
        box.appendChild(el('div', null,
          '提交后编辑器会把这些字段标红。到 MusicBrainz 里把这个艺术家建好，再回来重新导入一次即可。'));
        body.appendChild(box);
      }
      if (data.warnings.length) {
        body.appendChild(el('div', 'notes', '⚠ ' + data.warnings.join('\n⚠ ')));
      }

      go.disabled = false;
      go.addEventListener('click', () => {
        panel.remove();
        submitToMusicBrainz(data, lookup);
      });
    })();
  }

  function render(data) {
    const { host, root } = createHost('nm2mb-host');
    const wrap = el('div', 'wrap');

    const button = el('button', null, '导入至 MusicBrainz');
    button.type = 'button';

    const bits = [`${data.trackCount} 首`];
    if (data.totalLengthMs) bits.push(formatDuration(data.totalLengthMs));
    bits.push(data.releaseType);
    const meta = el('span', 'meta', bits.join(' · '));
    wrap.append(button, meta);

    if (data.warnings.length) {
      const warn = el('span', 'warn', `⚠ 缺 ${data.warnings.length} 处曲目`);
      warn.title = data.warnings.join('\n');
      wrap.appendChild(warn);
    }
    root.appendChild(wrap);

    // 查询结果缓存，取消后再点不重复打接口
    let cached = null;
    let pending = null;
    const ensureLookup = () => {
      if (cached) return Promise.resolve(cached);
      if (!pending) {
        pending = lookupMusicBrainz(data)
          .catch(err => ({ label: null, artists: new Map(), fatal: String(err.message || err) }))
          .then(result => { cached = result; pending = null; return result; });
      }
      return pending;
    };

    button.addEventListener('click', () => openReview(root, data, ensureLookup));
    return { host, root };
  }

  function renderError(message) {
    const { host, root } = createHost('nm2mb-host');
    const wrap = el('div', 'wrap');
    const button = el('button', null, 'MusicBrainz 导入不可用');
    button.type = 'button';
    button.disabled = true;
    const meta = el('span', 'warn', message);
    meta.title = message;
    wrap.append(button, meta);
    root.appendChild(wrap);
    return { host, root };
  }

  async function start(albumId) {
    const old = document.getElementById('nm2mb-host');
    if (old) old.remove();

    let view;
    try {
      const album = await fetchAlbum(albumId);
      const data = buildRelease(album, albumId);
      console.log('[网易云→MusicBrainz] 解析结果', data);
      /*
       * 封面直链顺手存进 GM 存储，供 MusicBrainz 页面用。
       * 为什么要绕这一道：网易云图床放了 CORS（图片能跨域取），
       * 但接口没放（从 MB 页面调 music.163.com/api 会 NetworkError），
       * 所以在 MB 页面无法反查封面，只能由这一侧带过去。
       */
      if (data.cover) {
        store.set(CFG.COVER_KEY_PREFIX + albumId, {
          cover: data.cover,
          title: data.title,
          artists: data.artists,
        });
      }
      view = render(data);
    } catch (err) {
      console.error('[网易云→MusicBrainz]', err);
      view = renderError(String(err && err.message ? err.message : err));
    }
    const anchor = await waitForAnchor();
    mount(view.host, view.root, anchor);
  }

  /* ------------------------------------------------------------------ *
   * MusicBrainz 侧：封面补传
   * ------------------------------------------------------------------ */

  function getReleaseMbid() {
    const m = location.pathname.match(/^\/release\/([0-9a-f-]{36})/i);
    return m ? m[1] : null;
  }

  async function findNeteaseAlbumId(mbid) {
    const res = await fetch(`${CFG.MB_API}/release/${mbid}?inc=url-rels&fmt=json`);
    if (!res.ok) return null;
    const json = await res.json();
    for (const rel of json.relations || []) {
      const m = String((rel.url && rel.url.resource) || '')
        .match(/music\.163\.com\/(?:#\/)?album\?id=(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  /*
   * ★ 跨域请求必须走 GM_xmlhttpRequest —— 它有 @grant 所以不受 CORS 限制。
   * QQ 音乐的搜索接口、y.qq.com 的图床都靠它取；
   * 网易云的图床反而放了 CORS，普通 fetch 就够。
   */
  function gmRequest(opts) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('缺少 GM_xmlhttpRequest 权限，请在油猴里允许'));
        return;
      }
      GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url: opts.url,
        headers: opts.headers,
        responseType: opts.responseType,
        timeout: 15000,
        onload: res => (res.status >= 200 && res.status < 300)
          ? resolve(res)
          : reject(new Error(`HTTP ${res.status}`)),
        onerror: () => reject(new Error('网络错误')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  async function fetchBlob(url, viaGM) {
    if (!viaGM) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    }
    const res = await gmRequest({ url, responseType: 'blob' });
    return res.response;
  }

  /*
   * ★ 必须把 MIME 归一化：网易云图床返回的 Content-Type 是 "image/jpg"，
   * 这不是合法 MIME（正确写法 image/jpeg）。MusicBrainz 服务端按声明类型
   * 决定扩展名，查不到会直接拒绝上传（界面上只显示 "Error uploading image"）。
   */
  const MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/x-png': 'image/png' };
  const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };

  function fileFromBlob(blob) {
    const raw = String((blob && blob.type) || '').toLowerCase().split(';')[0].trim();
    const type = MIME_ALIASES[raw] || (MIME_EXT[raw] ? raw : 'image/jpeg');
    return new File([blob], `cover.${MIME_EXT[type] || 'jpg'}`, { type, lastModified: Date.now() });
  }

  // 把 File 塞进 <input type=file>，让 MB 自己的上传控件接管
  function attachFile(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // 兼容旧版存的裸字符串（那时只存封面直链）
  function readStash(albumId) {
    const v = store.get(CFG.COVER_KEY_PREFIX + albumId);
    if (!v) return null;
    if (typeof v === 'string') return { cover: v, title: null, artists: [] };
    return { cover: v.cover || null, title: v.title || null, artists: v.artists || [] };
  }

  /* QQ 音乐：搜索接口不放 CORS，必须走 GM_xmlhttpRequest，并带 Referer */
  const QQ_HEADERS = { Referer: 'https://y.qq.com/' };

  function qqCoverUrl(albumMid, size) {
    return `https://y.qq.com/music/photo_new/T002R${size}x${size}M000${albumMid}.jpg`;
  }

  async function qqFindAlbums(title, artists) {
    const kw = [title].concat((artists || []).slice(0, 2)).join(' ');
    const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=20&w='
      + encodeURIComponent(kw);
    const res = await gmRequest({ url, headers: QQ_HEADERS });
    let json = {};
    try { json = JSON.parse(res.responseText || '{}'); } catch (e) { return []; }
    const list = (json.data && json.data.song && json.data.song.list) || [];

    // 只认专辑名与网易云完全一致的 —— 宁可少给一张，也不给一张对不上封面的图
    const want = normalizeName(title);
    const seen = new Map();
    for (const song of list) {
      const mid = song.albummid;
      if (!mid || seen.has(mid)) continue;
      const name = String(song.albumname || '').trim();
      if (!want || normalizeName(name) !== want) continue;
      seen.set(mid, { source: 'QQ音乐', cover: qqCoverUrl(mid, 800), viaGM: true });
    }
    return Array.from(seen.values()).slice(0, 3);
  }

  function coverItems(stash, qqItems) {
    const items = [];
    if (stash && stash.cover) items.push({ source: '网易云', cover: stash.cover, viaGM: false });
    (qqItems || []).forEach(it => items.push(it));
    return items;
  }

  function renderCoverPanel(items, albumId, qqError) {
    const { host, root } = createHost('nm2mb-cover');

    const panel = el('div', 'cover-panel');
    root.appendChild(panel);

    if (!items.length) {
      panel.appendChild(el('h5', null, '网易云封面'));
      const line = el('div');
      const open = el('a', 'mb', '先打开这张专辑');
      open.href = `https://music.163.com/#/album?id=${albumId}`;
      open.target = '_blank';
      open.rel = 'noreferrer';
      line.appendChild(open);
      line.appendChild(el('span', 'hint', '脚本会在那一页把封面存下来；回来刷新本页即可'));
      panel.appendChild(line);
      panel.appendChild(el('div', 'tag', `v${SCRIPT_VERSION}`));
      document.body.appendChild(host);
      return;
    }

    panel.appendChild(el('h5', null, '选择封面来源'));
    const grid = el('div', 'cover-grid');
    items.forEach(item => {
      const card = el('div', 'cover-card');
      const img = document.createElement('img');
      img.src = item.cover;
      img.alt = item.source;
      img.referrerPolicy = 'no-referrer';
      card.appendChild(img);

      // 分辨率要等图片真正加载完才知道 —— 标出来的是实际能拿到的尺寸，不是硬编码
      const info = el('div', 'info', item.source);
      card.appendChild(info);
      img.addEventListener('load', () => {
        info.textContent = `${item.source} ${img.naturalWidth}×${img.naturalHeight}`;
      });

      const use = el('button', null, '用这张');
      use.type = 'button';
      const hint = el('div', 'info', '');
      use.addEventListener('click', async () => {
        const input = document.querySelector('input[type=file]');
        if (!input) {
          hint.textContent = '请先点上面的 Add cover art';
          return;
        }
        use.disabled = true;
        hint.textContent = '下载中…';
        try {
          const blob = await fetchBlob(item.cover, item.viaGM);
          const file = fileFromBlob(blob);
          attachFile(input, file);
          hint.textContent = `已放入 ${file.name}（${Math.round(file.size / 1024)} KB）`;
        } catch (err) {
          hint.textContent = String(err.message || err);
        } finally {
          use.disabled = false;
        }
      });

      const dl = el('a', 'mb', '下载');
      dl.href = item.cover;
      dl.target = '_blank';
      dl.rel = 'noreferrer';
      card.append(use, dl, hint);
      grid.appendChild(card);
    });
    panel.appendChild(grid);

    if (qqError) panel.appendChild(el('div', 'hint', `QQ音乐查询失败：${qqError}`));
    panel.appendChild(el('div', 'tag', `v${SCRIPT_VERSION}`));
    document.body.appendChild(host);
  }

  async function bootMusicBrainz() {
    const mbid = getReleaseMbid();
    if (!mbid || document.getElementById('nm2mb-cover')) return;

    let albumId = null;
    try {
      albumId = await findNeteaseAlbumId(mbid);
    } catch (e) {
      return;
    }
    if (!albumId) return;   // 这条发行没关联网易云，不打扰

    const stash = readStash(albumId);
    let qqItems = [];
    let qqError = null;
    if (stash && stash.title) {
      try {
        qqItems = await qqFindAlbums(stash.title, stash.artists);
      } catch (err) {
        qqError = String(err.message || err);
      }
    }
    renderCoverPanel(coverItems(stash, qqItems), albumId, qqError);
  }

  /* ------------------------------------------------------------------ *
   * 启动
   * ------------------------------------------------------------------ */

  if (/^https?:\/\/musicbrainz\.org\//.test(location.href)) {
    bootMusicBrainz();
  } else {
    const albumId = getAlbumId();
    if (albumId && !document.getElementById('nm2mb-host')) start(albumId);
  }
})();
