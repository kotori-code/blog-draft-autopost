// シートが編集されたときの受け口（インストール型トリガーから呼ばれる。setupTriggers で登録）
// 名前を onEdit にするとシンプルトリガーとしても動いて二重に実行されるので、別の名前にしている

function onEditInstalled(e) {
  const range = e.range;
  const sheet = range.getSheet();
  const name = sheet.getName();
  try {
    if (name === SHEET_ARTICLES) {
      handleArticleEdit_(sheet, range);
    } else if (name === SHEET_COMMON || name === SHEET_PROMPTS) {
      handleSettingEdit_(sheet, range);
    }
  } catch (err) {
    console.error('[onEdit] ' + name + ': ' + err.message);
    sheet.getParent().toast(err.message, 'エラー', 10);
  }
}

// 「記事作成」シート: チェックボックスとステータスの変更を見る
function handleArticleEdit_(sheet, range) {
  rowsOf_(range).forEach((row) => {
    if (row < 2) return;
    if (editedColumn_(range, 'makeTitles') && sheet.getRange(row, articleCol_('makeTitles')).getValue() === true) {
      withLock_(() => generateTitlesForRow_(sheet, row));
    }
    if (editedColumn_(range, 'makeBody') && sheet.getRange(row, articleCol_('makeBody')).getValue() === true) {
      withLock_(() => generateBodyForRow_(sheet, row));
    }
    if (editedColumn_(range, 'status')) {
      fillPublishedAt_(sheet, row);
    }
  });
}

// 「共通設定」「個別設定」シート: 「反映する」にチェックが入ったら反映
function handleSettingEdit_(sheet, range) {
  if (range.getColumn() > 2 || range.getLastColumn() < 2) return;
  rowsOf_(range).forEach((row) => {
    const isApplyRow = sheet.getRange(row, 1).getValue() === APPLY_LABEL;
    if (isApplyRow && sheet.getRange(row, 2).getValue() === true) {
      withLock_(() => applySettings_(sheet, row));
    }
  });
}

// ステータスを手で「公開済」にしたら、公開日を入れる（すでに入っていれば変えない）
function fillPublishedAt_(sheet, row) {
  const status = sheet.getRange(row, articleCol_('status')).getValue();
  const publishedAt = sheet.getRange(row, articleCol_('publishedAt'));
  if (status === STATUS.PUBLISHED && !publishedAt.getValue()) {
    publishedAt.setValue(new Date());
  }
}

// ---------- 共通の部品 ----------

function rowsOf_(range) {
  const rows = [];
  for (let r = range.getRow(); r <= range.getLastRow(); r++) rows.push(r);
  return rows;
}

function editedColumn_(range, key) {
  const col = articleCol_(key);
  return range.getColumn() <= col && col <= range.getLastColumn();
}

// 同時に何件もチェックされても、1 件ずつ順番に処理する
function withLock_(fn) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5 * 60 * 1000)) {
    throw new Error('ほかの処理が終わらないため、実行できませんでした。少し待ってからもう一度チェックを入れてください');
  }
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}
