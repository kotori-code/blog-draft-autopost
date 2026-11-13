// 「タイトル5案を作成」: キーワードからタイトル案を 5 つ作り、「タイトル案」列に書く

const TITLE_SCHEMA = {
  type: 'object',
  properties: {
    titles: { type: 'array', items: { type: 'string' } },
  },
  required: ['titles'],
  additionalProperties: false,
};

function generateTitlesForRow_(sheet, row) {
  const cell = (key) => sheet.getRange(row, articleCol_(key));
  const status = cell('status').getValue();

  // 本文まで作った記事は、タイトル案を作り直さない（作成済の情報を消さないため）
  if (status === STATUS.CREATED || status === STATUS.PUBLISHED) {
    cell('makeTitles').setValue(false);
    sheet.getParent().toast(row + ' 行目は「' + status + '」なので、タイトル案は作り直しません', 'タイトル案', 8);
    return;
  }

  const keyword = String(cell('keyword').getValue()).trim();
  if (!keyword) {
    cell('makeTitles').setValue(false);
    cell('status').setValue(STATUS.ERROR);
    cell('error').setValue('キーワードが空です');
    return;
  }

  cell('status').setValue(STATUS.WORKING);
  cell('error').setValue('');
  SpreadsheetApp.flush(); // 「作成中」をすぐ画面に出す

  try {
    const titles = isOpenAiMock_()
      ? mockTitles_(keyword)
      : requestTitles_(keyword, cell('subKeyword').getValue(), cell('memo').getValue());

    cell('titleIdeas').setValue(titles.map((t, i) => (i + 1) + '. ' + t).join('\n'));
    cell('chosenIdea').setValue(''); // 案が変わったので、前に選んだ番号は消す
    cell('status').setValue(STATUS.TITLE_READY);
  } catch (err) {
    console.error('[Titles] ' + row + ' 行目: ' + err.message);
    cell('status').setValue(STATUS.ERROR);
    cell('error').setValue(err.message);
  } finally {
    cell('makeTitles').setValue(false);
  }
}

function requestTitles_(keyword, subKeyword, memo) {
  const prompt = buildPrompt_(PROMPT_KEYS.TITLES, {
    キーワード: keyword,
    サブキーワード: subKeyword,
    補足メモ: memo,
  });
  const result = requestOpenAiJson_(prompt, 'title_ideas', TITLE_SCHEMA);
  const titles = (result.titles || []).map((t) => String(t).trim()).filter((t) => t);
  if (titles.length < TITLE_COUNT) {
    throw new Error('タイトル案が ' + titles.length + ' 案しか返ってきませんでした。もう一度チェックを入れてください');
  }
  return titles.slice(0, TITLE_COUNT);
}

// OPENAI_MOCK = true のときのテスト用タイトル
function mockTitles_(keyword) {
  return ['比較', '選び方', '失敗例', '費用', '導入事例'].map((angle) =>
    '【テスト】' + keyword + 'の' + angle);
}
