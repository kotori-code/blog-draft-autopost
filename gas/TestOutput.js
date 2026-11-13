// 記事の書き出し: 「本文を作成」で作った記事本文と説明文（メタディスクリプション）を、別のスプレッドシートにも書く
// 記事の中身・トーンを確かめるためのもの（WordPress が無いテスト中でも本文を読める）
// スクリプトプロパティ:
//   TEST_OUTPUT_SHEET_URL … 書き出し先のスプレッドシートの URL（空なら書き出さない）

const TEST_OUTPUT_SHEET = 'テスト出力';
const TEST_OUTPUT_HEADERS = [
  '実行日時', 'モデル', 'キーワード', 'タイトル',
  '説明文（メタディスクリプション）', '説明文の字数',
  '本文の字数（見出しを除く）', '本文（見出し付き）', '本文（WordPress に送る HTML）', 'WordPress URL',
];

function isTestOutputEnabled_() {
  return !!PropertiesService.getScriptProperties().getProperty('TEST_OUTPUT_SHEET_URL');
}

// 「本文を作成」から呼ばれる。書き出し先が設定されていなければ何もしない
function exportArticle_(keyword, title, article, wpUrl) {
  if (!isTestOutputEnabled_()) return;
  const bodyOnly = [article.intro].concat(article.sections.map((s) => s.body), [article.summary]).join('');
  writeTestOutput_({
    model: isOpenAiMock_()
      ? 'テスト用（OPENAI_MOCK）'
      : (PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL),
    keyword: keyword,
    title: title,
    metaDescription: article.metaDescription,
    metaLength: Array.from(article.metaDescription).length,
    bodyLength: Array.from(bodyOnly.replace(/\s/g, '')).length,
    bodyText: articleToText_(article),
    bodyHtml: articleToHtml_(article),
    wpUrl: wpUrl,
  });
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
  let ss;
  try {
    ss = SpreadsheetApp.openByUrl(url);
  } catch (err) {
    throw new Error('書き出し先のスプレッドシートを開けません。TEST_OUTPUT_SHEET_URL と、自分に編集権限があるかを確認してください（' + err.message + '）');
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
    [140, 140, 180, 240, 320, 90, 110, 600, 400, 220].forEach((w, i) => sheet.setColumnWidth(i + 1, w));
  }

  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, TEST_OUTPUT_HEADERS.length).setValues([[
    new Date(), result.model, result.keyword, result.title,
    result.metaDescription, result.metaLength,
    result.bodyLength, result.bodyText, result.bodyHtml, result.wpUrl,
  ]]).setWrap(true).setVerticalAlignment('top');
  sheet.getRange(row, 1).setNumberFormat('yyyy/mm/dd hh:mm');
  if (result.metaLength > META_DESCRIPTION_MAX) {
    sheet.getRange(row, 6).setFontColor('#E5484D').setFontWeight('bold'); // 120 字を超えたら赤字
  }
}
