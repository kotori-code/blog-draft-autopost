// 初回だけ手動で実行する関数: 3 つのシートを作る
// すでに中身があるシートは書き換えない

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const results = [
    setupArticleSheet_(ss),
    setupCommonSheet_(ss),
    setupPromptSheet_(ss),
  ];
  removeEmptyDefaultSheet_(ss);
  setupTriggers();
  ss.setActiveSheet(ss.getSheetByName(SHEET_ARTICLES));
  ss.toast(results.join('\n'), 'シートの準備', 10);
}

// チェックボックスを押したら動くようにする（setupSheets からも呼ばれる）
// 外部の AI を呼ぶので、シンプルトリガー（onEdit）ではなくインストール型トリガーを使う
function setupTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'onEditInstalled')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();
}

// ---------- 記事作成 ----------

function setupArticleSheet_(ss) {
  const sheet = getEmptySheet_(ss, SHEET_ARTICLES);
  if (!sheet) return SHEET_ARTICLES + ': 中身があるので変更しませんでした';

  const lastRow = ARTICLE_ROWS + 1;

  ARTICLE_COLUMNS.forEach((col, i) => {
    const c = i + 1;
    sheet.getRange(1, c).setValue(col.header)
      .setBackground(col.input ? COLORS.inputHeader : COLORS.autoHeader);
    sheet.setColumnWidth(c, col.width);

    const body = sheet.getRange(2, c, ARTICLE_ROWS, 1);
    body.setBackground(col.input ? COLORS.inputCell : COLORS.autoCell);
    if (col.wrap) body.setWrap(true);
    if (col.checkbox) body.insertCheckboxes().setHorizontalAlignment('center');
    if (col.date) body.setNumberFormat('yyyy/mm/dd');
  });

  styleHeader_(sheet.getRange(1, 1, 1, ARTICLE_COLUMNS.length));
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(articleCol_('keyword')); // 作成日・公開日・キーワードは横に動かしても見える
  sheet.getRange(2, 1, ARTICLE_ROWS, ARTICLE_COLUMNS.length).setVerticalAlignment('top');

  // 採用する案: 1〜5 から選ぶ
  sheet.getRange(2, articleCol_('chosenIdea'), ARTICLE_ROWS, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['1', '2', '3', '4', '5'], true)
      .setAllowInvalid(false)
      .build())
    .setHorizontalAlignment('center');

  // ステータス: 決まった値から選ぶ（公開したら手で「公開済」にできる）
  sheet.getRange(2, articleCol_('status'), ARTICLE_ROWS, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(Object.values(STATUS), true)
      .setAllowInvalid(false)
      .build());

  // 自動で書き込む列は、手で直そうとすると警告を出す（ステータスは「公開済」に変えるため除く）
  ARTICLE_COLUMNS.forEach((col, i) => {
    if (col.input || col.key === 'status') return;
    sheet.getRange(1, i + 1, lastRow, 1).protect()
      .setDescription('自動で書き込まれる列: ' + col.header)
      .setWarningOnly(true);
  });

  // 見本の行
  sheet.getRange(2, articleCol_('keyword')).setValue('勤怠管理 クラウド 比較');
  sheet.getRange(2, articleCol_('subKeyword')).setValue('勤怠管理システム 料金、テレワーク 勤怠');
  sheet.getRange(2, articleCol_('memo')).setValue('自社の勤怠管理サービスの導入事例に触れてほしい');
  sheet.getRange(2, articleCol_('status')).setValue(STATUS.NOT_CREATED);

  return SHEET_ARTICLES + ': 作成しました';
}

// ---------- 共通設定 ----------

function setupCommonSheet_(ss) {
  const sheet = getEmptySheet_(ss, SHEET_COMMON);
  if (!sheet) return SHEET_COMMON + ': 中身があるので変更しませんでした';

  const rows = [
    ['項目', '内容（自由に書き換えて OK）', '説明'],
    ['文字数', '2,000〜3,000 字', '記事全体の文字数の目安'],
    ['構成', 'タイトル → 導入 → 見出し（H2）3 つ → まとめ', '記事の組み立て'],
    ['読者', '中小企業の経営者・IT 担当者', 'だれに向けて書くか'],
    ['トーン', 'カジュアルだけど専門的。です・ます調。専門用語には短い説明を添える', '書きぶり。理想記事に合わせて調整する'],
    ['使わない表現', '断定しすぎる表現（「絶対」「必ず」など）、他社名の批判、根拠のない数字', '記事に入れてほしくない言い回し'],
    ['独自性のルール', '自社の視点・独自の切り口・具体例を必ず入れる。他サイトの文章を写さない。長い引用をしない', 'コピペ対策の代わりのルール'],
    [IDEAL_ARTICLE_KEY, '（ここに理想記事の本文を貼り付けてください）', '文体と構成の手本。長くても OK（本文の作成にだけ使います）'],
  ];
  writeSettingTable_(sheet, rows);
  return SHEET_COMMON + ': 作成しました';
}

// ---------- 個別設定 ----------

function setupPromptSheet_(ss) {
  const sheet = getEmptySheet_(ss, SHEET_PROMPTS);
  if (!sheet) return SHEET_PROMPTS + ': 中身があるので変更しませんでした';

  const titlePrompt = [
    'あなたは SEO 記事の編集者です。',
    '次のキーワードで検索する読者に向けて、記事タイトルを 5 案作ってください。',
    '',
    'キーワード: {キーワード}',
    'サブキーワード: {サブキーワード}',
    '補足メモ: {補足メモ}',
    '',
    '条件:',
    '- 32 字前後',
    '- キーワードをなるべく前のほうに入れる',
    '- サブキーワードは、自然に入る案にだけ入れる',
    '- 5 案は切り口を変える（比較・選び方・失敗例・費用・事例 など）',
    '',
    '共通ルール:',
    '{共通設定}',
  ].join('\n');

  const bodyPrompt = [
    'あなたは SEO 記事のライターです。',
    '次のタイトルとキーワードで、ブログ記事の下書きを書いてください。',
    '',
    'タイトル: {タイトル}',
    'キーワード: {キーワード}',
    'サブキーワード: {サブキーワード}',
    '補足メモ: {補足メモ}',
    '',
    '条件:',
    '- 導入では、読者の悩みに共感してから記事で分かることを伝える',
    '- サブキーワードは見出しか本文に自然に入れる',
    '- 見出しごとに具体例を 1 つ以上入れる',
    '- まとめでは、要点を 3 行程度で振り返る',
    '- 検索結果に出る説明文（120 字前後）も作る',
    '',
    '共通ルール:',
    '{共通設定}',
    '',
    '書きぶりの手本（文体と構成だけをまねる。文章は写さない）:',
    '{理想記事}',
  ].join('\n');

  const rows = [
    ['種類', '指示文（自由に書き換えて OK）', '使える差し込み'],
    [PROMPT_KEYS.TITLES, titlePrompt, '{キーワード} {サブキーワード} {補足メモ} {共通設定}'],
    [PROMPT_KEYS.BODY, bodyPrompt, '{タイトル} {キーワード} {サブキーワード} {補足メモ} {共通設定} {理想記事}'],
  ];
  writeSettingTable_(sheet, rows);
  // 反映欄（表の 2 行下から 2 行）のさらに下に注意書きを置く
  sheet.getRange(rows.length + 5, 1, 1, 3).merge()
    .setValue('※ { } で囲んだ言葉は、作成するときに中身へ置き換わります。AI からの返事の形式（タイトル・本文・説明文の分け方）はプログラム側で指定するので、ここに書く必要はありません。')
    .setFontColor(COLORS.note)
    .setWrap(true);
  return SHEET_PROMPTS + ': 作成しました';
}

// ---------- 共通の部品 ----------

// 設定の表（1 行目が見出し）と、その下の「反映」欄を書く
function writeSettingTable_(sheet, rows) {
  sheet.getRange(1, 1, rows.length, 3).setValues(rows)
    .setVerticalAlignment('top')
    .setWrap(true);
  styleHeader_(sheet.getRange(1, 1, 1, 3));
  sheet.getRange(1, 1).setBackground(COLORS.autoHeader);
  sheet.getRange(1, 2).setBackground(COLORS.inputHeader);
  sheet.getRange(1, 3).setBackground(COLORS.autoHeader);
  sheet.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold');
  sheet.getRange(2, 3, rows.length - 1, 1).setFontColor(COLORS.note);
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(2, 520);
  sheet.setColumnWidth(3, 260);
  sheet.setFrozenRows(1);

  // 反映欄: 表との間を 1 行空けて置く
  const applyRow = rows.length + 2;
  sheet.getRange(applyRow, 1, 2, 1).setValues([[APPLY_LABEL], [APPLIED_AT_LABEL]]).setFontWeight('bold');
  sheet.getRange(applyRow, 2).insertCheckboxes();
  sheet.getRange(applyRow + 1, 2).setValue('まだ反映していません')
    .setNumberFormat('yyyy/mm/dd hh:mm')
    .setBackground(COLORS.autoCell);
  sheet.getRange(applyRow, 3).setValue('書き換えたらチェックを入れると、次の作成から使われます')
    .setFontColor(COLORS.note);
}

function styleHeader_(range) {
  range.setFontColor(COLORS.headerText)
    .setFontWeight('bold')
    .setVerticalAlignment('middle')
    .setWrap(true);
}

// 名前のシートを返す。無ければ作る。中身がある場合は null（書き換えない）
function getEmptySheet_(ss, name) {
  const existing = ss.getSheetByName(name);
  if (!existing) return ss.insertSheet(name);
  return existing.getLastRow() === 0 ? existing : null;
}

// 最初からある空の「シート1」を消す（中身があれば残す）
function removeEmptyDefaultSheet_(ss) {
  ['シート1', 'Sheet1'].forEach((name) => {
    const sheet = ss.getSheetByName(name);
    if (sheet && sheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(sheet);
    }
  });
}
