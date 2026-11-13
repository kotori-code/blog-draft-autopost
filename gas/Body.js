// 「本文を作成」: 採用したタイトルで記事を作り、WordPress に下書きとして保存して、結果をシートに書く

const ARTICLE_SCHEMA = {
  type: 'object',
  properties: {
    intro: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['heading', 'body'],
        additionalProperties: false,
      },
    },
    summaryHeading: { type: 'string' },
    summary: { type: 'string' },
    excerpt: { type: 'string' },
  },
  required: ['intro', 'sections', 'summaryHeading', 'summary', 'excerpt'],
  additionalProperties: false,
};

// 返事の形はプログラム側で決める（「個別設定」の指示文の後ろに付け足す）
const ARTICLE_FORMAT_NOTE = [
  '',
  '（返事の形式）',
  '- intro: 導入の文章',
  '- sections: 見出しをちょうど ' + SECTION_COUNT + ' つ。heading は見出し、body はその本文',
  '- summaryHeading: まとめの見出し。「まとめ：」で始め、記事の主張を短く入れる（例: まとめ：〇〇が悪いのではなく、△△の問題）',
  '- summary: まとめの文章（見出しは summaryHeading に書き、ここには入れない）',
  '- excerpt: 検索結果に出る説明文（120 字前後）',
  '- 段落と段落の間は空行を入れる。箇条書きは行頭に「- 」を付ける',
  '- HTML のタグや Markdown の記号（# や **）は使わない',
].join('\n');

function generateBodyForRow_(sheet, row) {
  const cell = (key) => sheet.getRange(row, articleCol_(key));
  const status = cell('status').getValue();

  // 二重投稿を防ぐ: 下書きを作った行はやり直さない
  if (status === STATUS.CREATED || status === STATUS.PUBLISHED) {
    cell('makeBody').setValue(false);
    sheet.getParent().toast(row + ' 行目は「' + status + '」なので、本文は作り直しません', '本文', 8);
    return;
  }

  cell('status').setValue(STATUS.WORKING);
  cell('error').setValue('');
  SpreadsheetApp.flush(); // 「作成中」をすぐ画面に出す

  try {
    const keyword = String(cell('keyword').getValue()).trim();
    if (!keyword) throw new Error('キーワードが空です');
    const title = chosenTitle_(cell('titleIdeas').getValue(), cell('chosenIdea').getValue());

    const article = isOpenAiMock_()
      ? mockArticle_(title, keyword)
      : requestArticle_(title, keyword, cell('subKeyword').getValue(), cell('memo').getValue());

    const result = postDraftToWordPress_({
      title: title,
      content: articleToHtml_(article),
      excerpt: article.excerpt,
    });

    cell('title').setValue(title);
    cell('url').setValue(result.editUrl);
    cell('createdAt').setValue(new Date());
    cell('status').setValue(STATUS.CREATED);
  } catch (err) {
    console.error('[Body] ' + row + ' 行目: ' + err.message);
    cell('status').setValue(STATUS.ERROR);
    cell('error').setValue(err.message);
  } finally {
    cell('makeBody').setValue(false);
  }
}

// 「タイトル案」の中から、「採用する案」の番号のタイトルを取り出す
function chosenTitle_(ideasText, chosen) {
  const n = Number(chosen);
  if (!n) throw new Error('「採用する案（1〜5）」で、使うタイトルの番号を選んでください');
  const titles = String(ideasText).split('\n')
    .map((line) => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter((line) => line);
  if (!titles[n - 1]) {
    throw new Error('タイトル案の ' + n + ' 番が見つかりません。先に「タイトル5案を作成」を実行してください');
  }
  return titles[n - 1];
}

function requestArticle_(title, keyword, subKeyword, memo) {
  const prompt = buildPrompt_(PROMPT_KEYS.BODY, {
    タイトル: title,
    キーワード: keyword,
    サブキーワード: subKeyword,
    補足メモ: memo,
  }) + '\n' + ARTICLE_FORMAT_NOTE;

  const article = requestOpenAiJson_(prompt, 'article', ARTICLE_SCHEMA);
  if (!article.sections || article.sections.length !== SECTION_COUNT) {
    const count = article.sections ? article.sections.length : 0;
    throw new Error('見出しが ' + count + ' つで返ってきました（' + SECTION_COUNT + ' つの予定）。もう一度チェックを入れてください');
  }
  return article;
}

// 記事を WordPress の本文（HTML）にする: 導入 → 見出し×3 → まとめ
function articleToHtml_(article) {
  const parts = [textToHtml_(article.intro)];
  article.sections.forEach((section) => {
    parts.push('<h2>' + escapeHtml_(section.heading) + '</h2>');
    parts.push(textToHtml_(section.body));
  });
  parts.push('<h2>' + escapeHtml_(article.summaryHeading || 'まとめ') + '</h2>');
  parts.push(textToHtml_(article.summary));
  return parts.join('\n');
}

// 空行で段落に分ける。行頭が「- 」の行が続く段落は箇条書きにする
function textToHtml_(text) {
  return String(text || '').split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim());
      if (lines.every((line) => /^[-・]\s*/.test(line))) {
        const items = lines.map((line) => '<li>' + escapeHtml_(line.replace(/^[-・]\s*/, '')) + '</li>');
        return '<ul>\n' + items.join('\n') + '\n</ul>';
      }
      return '<p>' + lines.map(escapeHtml_).join('<br>') + '</p>';
    })
    .join('\n');
}

function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// OPENAI_MOCK = true のときのテスト用の記事
function mockArticle_(title, keyword) {
  return {
    intro: '【テスト】「' + keyword + '」についての導入です。\n\nこの記事で分かることを紹介します。',
    sections: [1, 2, 3].map((n) => ({
      heading: '【テスト】見出し ' + n,
      body: '見出し ' + n + ' の本文です。\n\n- ポイント A\n- ポイント B',
    })),
    summaryHeading: 'まとめ：【テスト】まとめの見出し',
    summary: '【テスト】「' + title + '」のまとめです。',
    excerpt: '【テスト】' + keyword + 'についての説明文です。',
  };
}
