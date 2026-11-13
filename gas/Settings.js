// 「共通設定」「個別設定」の読み込みと「反映」
// 作成に使うのは「反映」を押した時点の内容（書きかけの設定が途中で使われないようにするため）
// まだ一度も反映していないシートは、今の内容をそのまま使う

// 「反映する」にチェックが入ったとき: 今の内容を控えのシートに写す
function applySettings_(sheet, applyRow) {
  const ss = sheet.getParent();
  const name = sheet.getName();
  const items = readSettingTable_(sheet);
  if (items.length === 0) throw new Error(name + ' に設定がありません');

  const applied = getAppliedSheet_(ss);
  const kept = applied.getLastRow() > 0
    ? applied.getRange(1, 1, applied.getLastRow(), 3).getValues().filter((r) => r[0] !== name)
    : [];
  const rows = kept.concat(items.map((item) => [name, item.key, item.value]));
  applied.clearContents();
  applied.getRange(1, 1, rows.length, 3).setValues(rows);

  sheet.getRange(applyRow, 2).setValue(false);
  sheet.getRange(applyRow + 1, 2).setValue(new Date());
  ss.toast(name + ' を反映しました。次の作成から使われます', '反映', 5);
}

// 作成に使う設定を { 項目名: 内容 } で返す
function getSettings_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const applied = ss.getSheetByName(SHEET_APPLIED);
  if (applied && applied.getLastRow() > 0) {
    const rows = applied.getRange(1, 1, applied.getLastRow(), 3).getValues()
      .filter((r) => r[0] === sheetName);
    if (rows.length > 0) return toMap_(rows.map((r) => ({ key: r[1], value: r[2] })));
  }
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('「' + sheetName + '」シートがありません。setupSheets を実行してください');
  return toMap_(readSettingTable_(sheet));
}

// 指示文を組み立てる。{ } の差し込みを中身に置き換える
function buildPrompt_(promptKey, values) {
  const template = getSettings_(SHEET_PROMPTS)[promptKey];
  if (!template) throw new Error('「個別設定」に「' + promptKey + '」の指示文がありません');

  const common = getSettings_(SHEET_COMMON);
  const all = Object.assign({
    共通設定: Object.keys(common)
      .filter((key) => key !== IDEAL_ARTICLE_KEY)
      .map((key) => '- ' + key + ': ' + common[key])
      .join('\n'),
    理想記事: common[IDEAL_ARTICLE_KEY] || '',
  }, values);

  return String(template).replace(/\{([^{}]+)\}/g, (match, name) => {
    if (!(name in all)) return match; // 知らない差し込みはそのまま残す
    const value = String(all[name]).trim();
    return value || '（なし）';
  });
}

// ---------- 内部 ----------

// 2 行目から、A 列が空になるまでを設定として読む（その下の「反映」欄は読まない）
function readSettingTable_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const items = [];
  const rows = sheet.getRange(2, 1, last - 1, 2).getValues();
  for (const [key, value] of rows) {
    if (key === '') break;
    items.push({ key: String(key), value: value });
  }
  return items;
}

function toMap_(items) {
  const map = {};
  items.forEach((item) => { map[item.key] = item.value; });
  return map;
}

function getAppliedSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET_APPLIED);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_APPLIED);
    sheet.hideSheet();
  }
  return sheet;
}
