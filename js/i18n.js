/**
 * Two-language string table. Elements carry data-i18n / data-i18n-attr and are
 * refreshed in place when the language changes.
 */

const STRINGS = {
  'zh-Hant': {
    'app.name': '決策板',
    'app.tagline': '揀唔到？就交畀重力。',
    'setup.eyebrow': '第一步 · 立題',
    'board.eyebrow': '第二步 · 落珠',
    'fair.eyebrow': '機制',
    'history.eyebrow': '紀錄',
    'setup.question': '題目（可以留空）',
    'setup.questionPlaceholder': '例如：今晚食咩好？',
    'setup.options': '選項',
    'setup.optionPlaceholder': '第 {n} 個選項',
    'setup.add': '＋ 加多一個',
    'setup.remove': '刪除呢個選項',
    'setup.start': '整塊板出嚟',
    'setup.errorTooFew': '最少要填 2 個選項。',
    'setup.errorDuplicate': '有選項重複咗，改一改先。',
    'setup.hint': '2 至 5 個選項都得。',
    'board.drop': '落珠',
    'board.charging': '準備…',
    'board.dropping': '落珠中…',
    'board.edit': '← 改選項',
    'board.share': '分享',
    'board.shared': '連結已複製',
    'board.shareFailed': '複製唔到，請自行複製網址',
    'board.skip': '㩒一下塊板可以跳過',
    'result.heading': '判定',
    'result.retry': '重來',
    'result.retryBody': '珠仔跌咗落「重來」格，再落多次啦。',
    'result.again': '再落一次',
    'result.dropAgain': '再落一次',
    'result.close': '收埋',
    'fair.title': '點解呢塊板係公平？',
    'fair.body':
      '每個分叉都係真正 50 / 50（用 crypto.getRandomValues，唔係 Math.random）。' +
      '同真實嘅高爾頓板唔同，呢度啲通道分叉之後唔會再匯合，所以每條路徑機率完全一樣，' +
      '選項之間可以精確平分。「重來」格用嚟食走除唔盡嘅餘數；' +
      '兩個選項嗰陣就特登保留佢，等塊板好似實物一樣有三個結局。',
    'fair.tableOption': '選項',
    'fair.tableChance': '機率',
    'fair.retry': '重來',
    'fair.exits': '{n} 個出口 · {d} 層分叉',
    'history.title': '之前嘅決定',
    'history.empty': '仲未有紀錄。',
    'history.clear': '清除紀錄',
    'history.retryLabel': '重來',
    'nav.theme': '外觀',
    'nav.themeRitual': '黑曜',
    'nav.themeIvory': '象牙',
    'nav.themeSwitch': '轉做「{name}」外觀',
    'nav.lang': '語言',
    'nav.fair': '公平說明',
    'nav.history': '紀錄',
    'nav.close': '閂',
    'a11y.resultAnnounce': '結果：{label}',
    'a11y.retryAnnounce': '結果：重來一次',
    'update.ready': '有新版本，㩒一下更新',
  },
  en: {
    'app.name': 'Decision Board',
    'app.tagline': "Can't decide? Let gravity answer.",
    'setup.eyebrow': 'Step one · The question',
    'board.eyebrow': 'Step two · The drop',
    'fair.eyebrow': 'Mechanism',
    'history.eyebrow': 'Record',
    'setup.question': 'Question (optional)',
    'setup.questionPlaceholder': 'e.g. Where should we eat tonight?',
    'setup.options': 'Options',
    'setup.optionPlaceholder': 'Option {n}',
    'setup.add': '+ Add another',
    'setup.remove': 'Remove this option',
    'setup.start': 'Build the board',
    'setup.errorTooFew': 'Please fill in at least 2 options.',
    'setup.errorDuplicate': 'Two options are identical — change one.',
    'setup.hint': 'Anywhere from 2 to 5 options.',
    'board.drop': 'Release',
    'board.charging': 'Steady…',
    'board.dropping': 'Falling…',
    'board.edit': '← Edit options',
    'board.share': 'Share',
    'board.shared': 'Link copied',
    'board.shareFailed': "Couldn't copy — copy the address bar instead",
    'board.skip': 'Tap the board to skip',
    'result.heading': 'Verdict',
    'result.retry': 'Go again',
    'result.retryBody': 'The ball landed in the retry slot. Release another one.',
    'result.again': 'Again',
    'result.dropAgain': 'Drop again',
    'result.close': 'Dismiss',
    'fair.title': 'Why this board is fair',
    'fair.body':
      'Every fork is a true 50/50, drawn from crypto.getRandomValues rather than ' +
      'Math.random. Unlike a real Galton board the channels never merge again after ' +
      'a split, so every path is equally likely and the exits divide exactly evenly ' +
      'between your options. The retry slot absorbs whatever will not divide evenly — ' +
      'and with two options it is kept on purpose, so the board has the same three ' +
      'outcomes as the physical one.',
    'fair.tableOption': 'Option',
    'fair.tableChance': 'Chance',
    'fair.retry': 'Retry',
    'fair.exits': '{n} exits · {d} rows of forks',
    'history.title': 'Past decisions',
    'history.empty': 'Nothing yet.',
    'history.clear': 'Clear history',
    'history.retryLabel': 'Retry',
    'nav.theme': 'Theme',
    'nav.themeRitual': 'Ritual',
    'nav.themeIvory': 'Ivory',
    'nav.themeSwitch': 'Switch to the {name} theme',
    'nav.fair': 'Fairness',
    'nav.history': 'History',
    'nav.lang': 'Language',
    'nav.close': 'Close',
    'a11y.resultAnnounce': 'Result: {label}',
    'a11y.retryAnnounce': 'Result: go again',
    'update.ready': 'New version available — tap to update',
  },
};

export const LANGS = Object.keys(STRINGS);

let current = 'zh-Hant';

export function setLang(lang) {
  current = STRINGS[lang] ? lang : 'zh-Hant';
  document.documentElement.lang = current;
  applyTranslations();
  return current;
}

export function getLang() {
  return current;
}

export function detectLang() {
  const nav = (navigator.languages || [navigator.language || 'en']).join(',').toLowerCase();
  return /zh|yue|hk|tw|mo/.test(nav) ? 'zh-Hant' : 'en';
}

/** @param {string} key @param {Record<string, string|number>} [vars] */
export function t(key, vars) {
  let value = STRINGS[current][key] ?? STRINGS['zh-Hant'][key] ?? key;
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

/** Refresh every element tagged with data-i18n within `root`. */
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.dataset.i18nAttr.split(',')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  }
}
