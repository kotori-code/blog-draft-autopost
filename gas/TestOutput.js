// 記事のテスト作成: 選んだ行で記事を作り、WordPress には送らずに別のスプレッドシートへ書き出す
// 記事の中身・説明文（メタディスクリプション）・トーンを確かめるためのもの。「記事作成」シートの状態は変えない
// スクリプトプロパティ:
//   TEST_OUTPUT_SHEET_URL … 書き出し先のスプレッドシートの URL

const TEST_OUTPUT_SHEET = 'テスト出力';
const TEST_OUTPUT_HEADERS = [
  '実行日時', 'モデル', 'キーワード', 'タイトル',
  '説明文（メタディスクリプション）', '説明文の字数',
  '本文の字数（見出しを除く）', '本文（見出し付き）', '本文（WordPress に送る HTML）',
];

// メニュー「記事作成ツール > 選んだ行で記事をテスト作成」から呼ばれる
function testArticleForActiveRow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const sheet = ss.getActiveSheet();
  const row = sheet.getActiveRange().getRow();
  if (sheet.getName() !== SHEET_ARTICLES || row < 2) {
    ui.alert('「記事作成」シートで、テストしたい行のセルを選んでから実行してください');
    return;
  }

  ss.toast(row + ' 行目の記事を作成しています（1 分ほどかかります）', 'テスト作成', 120);
  try {
    const result = buildTestArticle_(sheet, row);
    const outputUrl = writeTestOutput_(result);
    ss.toast('書き出しました。説明文は ' + result.metaLength + ' 字です', 'テスト作成', 10);
    console.log('[TestOutput] ' + row + ' 行目を書き出しました: ' + outputUrl);
  } catch (err) {
    console.error('[TestOutput] ' + row + ' 行目: ' + err.message);
    ss.toast('', 'テスト作成', 1);
    ui.alert('テスト作成に失敗しました\n\n' + err.message);
  }
}

function buildTestArticle_(sheet, row) {
  const cell = (key) => sheet.getRange(row, articleCol_(key));
  const keyword = String(cell('keyword').getValue()).trim();
  if (!keyword) throw new Error('キーワードが空です');
  const title = chosenTitle_(cell('titleIdeas').getValue(), cell('chosenIdea').getValue());

  const mock = isOpenAiMock_();
  const article = mock
    ? mockArticle_(title, keyword)
    : requestArticle_(title, keyword, cell('subKeyword').getValue(), cell('memo').getValue());

  const bodyText = articleToText_(article);
  const bodyOnly = [article.intro].concat(article.sections.map((s) => s.body), [article.summary]).join('');
  return {
    model: mock
      ? 'テスト用（OPENAI_MOCK）'
      : (PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL),
    keyword: keyword,
    title: title,
    metaDescription: article.metaDescription,
    metaLength: Array.from(article.metaDescription).length,
    bodyLength: Array.from(bodyOnly.replace(/\s/g, '')).length,
    bodyText: bodyText,
    bodyHtml: articleToHtml_(article),
  };
}

// 読みやすいテキストにする（見出しは ## を付ける）
function articleToText_(article) {
  const parts = [article.intro];
  article.sections.forEach((s) => parts.push('## ' + s.heading, s.body));
  parts.push('## ' + (article.summaryHeading || 'まとめ'), article.summary);
  return parts.map((p) => String(p).trim()).join('\n\n');
}

function writeTestOutput_(result) {
  const url = PropertiesService.getScriptProperties().getProperty('TEST_OUTPUT_SHEET_URL');
  if (!url) throw new Error('書き出し先が設定されていません（スクリプトプロパティ TEST_OUTPUT_SHEET_URL に、スプレッドシートの URL を入れてください）');

  let ss;
  try {
    ss = SpreadsheetApp.openByUrl(url);
  } catch (err) {
    throw new Error('書き出し先のスプレッドシートを開けません。URL と、自分に編集権限があるかを確認してください（' + err.message + '）');
  }

  let sheet = ss.getSheetByName(TEST_OUTPUT_SHEET);
  if (!sheet) sheet = ss.insertSheet(TEST_OUTPUT_SHEET, 0);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, TEST_OUTPUT_HEADERS.length).setValues([TEST_OUTPUT_HEADERS])
      .setBackground(COLORS.autoHeader)
      .setFontColor(COLORS.headerText)
      .setFontWeight('bold')
      .setWrap(true);
    sheet.setFrozenRows(1);
    [140, 140, 180, 240, 320, 90, 110, 600, 400].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  }

  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, TEST_OUTPUT_HEADERS.length).setValues([[
    new Date(), result.model, result.keyword, result.title,
    result.metaDescription, result.metaLength,
    result.bodyLength, result.bodyText, result.bodyHtml,
  ]]).setWrap(true).setVerticalAlignment('top');
  sheet.getRange(row, 1).setNumberFormat('yyyy/mm/dd hh:mm');
  if (result.metaLength > META_DESCRIPTION_MAX) {
    sheet.getRange(row, 6).setFontColor('#E5484D').setFontWeight('bold'); // 120 字を超えたら赤字
  }
  return url;
}
