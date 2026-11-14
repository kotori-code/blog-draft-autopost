// シート名・列・色など、ファイルをまたいで使う定数

const SHEET_ARTICLES = '記事作成';
const SHEET_COMMON = '共通設定';
const SHEET_PROMPTS = '個別設定';
const SHEET_APPLIED = '反映済みの設定'; // 「反映」を押した時点の設定の控え（非表示）

// 色（シートの見出しで使う）
const COLORS = {
  inputHeader: '#2271B1', // 担当者様が入力・操作する列
  autoHeader: '#6B6B6B', // 自動で書き込まれる列
  headerText: '#FFFFFF',
  inputCell: '#FFFFFF',
  autoCell: '#F3F3F3',
  note: '#6B6B6B',
};

// 記事の状態
const STATUS = {
  NOT_CREATED: '未作成',
  TITLE_READY: 'タイトル案あり',
  WORKING: '作成中',
  CREATED: '作成済',
  ERROR: 'エラー',
  PUBLISHED: '公開済',
};

// 「記事作成」シートの列（並び順 = シートの列順）
// input: true は担当者様が入力・操作する列
const ARTICLE_COLUMNS = [
  { key: 'createdAt', header: '作成日', width: 100, date: true },
  { key: 'publishedAt', header: '公開日', width: 100, date: true },
  { key: 'keyword', header: 'キーワード', width: 200, input: true },
  { key: 'subKeyword', header: 'サブキーワード', width: 200, input: true, wrap: true },
  { key: 'memo', header: '補足メモ（任意）', width: 220, input: true, wrap: true },
  { key: 'makeTitles', header: 'タイトル5案を作成', width: 110, input: true, checkbox: true },
  { key: 'titleIdeas', header: 'タイトル案', width: 360, wrap: true },
  { key: 'chosenIdea', header: '採用する案（1〜5）', width: 120, input: true },
  { key: 'makeBody', header: '本文を作成', width: 90, input: true, checkbox: true },
  { key: 'status', header: 'ステータス', width: 110 },
  { key: 'title', header: 'タイトル', width: 260, wrap: true },
  { key: 'url', header: 'WordPress URL', width: 220 },
  { key: 'error', header: 'エラー内容', width: 240, wrap: true },
  { key: 'metaDescription', header: '説明文（120 字以内）', width: 300, wrap: true },
];

// 列番号（1 始まり）を返す。例: articleCol_('keyword') → 3
function articleCol_(key) {
  const index = ARTICLE_COLUMNS.findIndex((col) => col.key === key);
  if (index < 0) throw new Error('[Config] 列が見つかりません: ' + key);
  return index + 1;
}

// 「記事作成」シートで入力欄を用意する行数
const ARTICLE_ROWS = 100;

// 「共通設定」「個別設定」シートの「反映」欄（A 列の見出し）
const APPLY_LABEL = '反映する（チェックを入れる）';
const APPLIED_AT_LABEL = '最後に反映した日時';

// 設定の項目名（シートの A 列と同じ文字）
const IDEAL_ARTICLE_KEY = '理想記事（手本）'; // 長いので本文生成のときだけ使う
const PROMPT_KEYS = {
  TITLES: 'タイトル生成',
  BODY: '本文生成',
};

// OpenAI
const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
// テストで gpt-4.1-mini と比べ、字数・指示の守り方が十分だったモデル（1 本 約 7 円の試算）
const DEFAULT_OPENAI_MODEL = 'gpt-6.1-sol'; // スクリプトプロパティ OPENAI_MODEL で変更できる
const TITLE_COUNT = 5;
const SECTION_COUNT = 3; // 見出し（H2）の数
const META_DESCRIPTION_MAX = 120; // 説明文（メタディスクリプション）の上限の字数

// WordPress
const WP_POSTS_PATH = '/wp-json/wp/v2/posts';
