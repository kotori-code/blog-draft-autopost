// WordPress への下書き送信テスト（WordPress が無くても実行できる）
// gas/ の Apps Script のコードをそのまま読み込み、同じリクエストを仮の WordPress に実際に送る
//
// 実行: node blog-autopost/test/send-draft-test.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createMockWordPress, USERS } = require('./mock-wordpress');

// Apps Script のファイルを読み込む（使うのは Apps Script の機能に頼らない関数だけ）
const gasDir = path.join(__dirname, '..', 'gas');
const gas = vm.createContext({ console: { error: () => {} } });
['Config.js', 'Body.js', 'WordPress.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(path.join(gasDir, file), 'utf8'), gas, { filename: file });
});

const encodeBase64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// Apps Script の UrlFetchApp.fetch(url, options) と同じ指定を、Node.js の fetch で送る
async function sendLikeUrlFetchApp(req) {
  const o = req.options;
  const res = await fetch(req.url, {
    method: o.method.toUpperCase(),
    headers: Object.assign({ 'Content-Type': o.contentType }, o.headers),
    body: o.payload,
  });
  return { code: res.status, text: await res.text() };
}

async function main() {
  const { server, posts } = createMockWordPress();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const password = USERS['blog-writer'].password;

  // 送る記事（テスト用の記事を、本番と同じ変換で HTML にする）
  const title = '勤怠管理 クラウド 比較｜失敗しない選び方 3 つのポイント';
  const article = gas.mockArticle_(title, '勤怠管理 クラウド 比較');
  const draft = { title, content: gas.articleToHtml_(article), excerpt: article.excerpt };

  const cases = [
    { name: '正しい設定', conf: { baseUrl: base, username: 'blog-writer', appPassword: password }, expect: 'ok' },
    { name: 'パスワード違い', conf: { baseUrl: base, username: 'blog-writer', appPassword: 'wrong pass' }, expect: 401 },
    { name: '権限の無いユーザー', conf: { baseUrl: base, username: 'reader', appPassword: password }, expect: 403 },
    { name: 'URL 違い', conf: { baseUrl: base + '/wordpress', username: 'blog-writer', appPassword: password }, expect: 404 },
    { name: 'セキュリティプラグインが止めた', conf: { baseUrl: base + '/blocked', username: 'blog-writer', appPassword: password }, expect: 403 },
    { name: 'サーバーのエラー', conf: { baseUrl: base + '/broken', username: 'blog-writer', appPassword: password }, expect: 500 },
  ];

  let failed = 0;
  for (const c of cases) {
    const req = gas.buildWpDraftRequest_(draft, c.conf, encodeBase64);
    const res = await sendLikeUrlFetchApp(req);
    let outcome;
    let line;
    try {
      const result = gas.parseWpDraftResponse_(res.code, res.text, c.conf.baseUrl);
      outcome = 'ok';
      line = '記事番号 ' + result.id + ' / シートに書く URL: ' + result.editUrl;
    } catch (err) {
      outcome = res.code;
      line = 'シートに書くエラー: ' + err.message;
    }
    const pass = outcome === c.expect;
    if (!pass) failed++;
    console.log((pass ? '✔' : '✘') + ' ' + c.name + '（' + res.code + '）\n    ' + line);
  }

  // 正しい設定で送った 1 本の中身を確かめる
  console.log('\n仮の WordPress に保存された下書き: ' + posts.length + ' 本');
  if (posts.length === 1) {
    const { received, username } = posts[0];
    const checks = [
      ['status が draft（公開されない）', received.status === 'draft'],
      ['タイトルが届いている', received.title === title],
      ['見出し（h2）が 4 つ（3 つ + まとめ）', (received.content.match(/<h2>/g) || []).length === 4],
      ['説明文（excerpt）が届いている', !!received.excerpt],
      ['専用ユーザーで送っている', username === 'blog-writer'],
    ];
    checks.forEach(([label, ok]) => {
      if (!ok) failed++;
      console.log('  ' + (ok ? '✔' : '✘') + ' ' + label);
    });

    const outFile = path.join(__dirname, 'output', 'received-draft.json');
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(received, null, 2));
    console.log('  届いた中身: ' + outFile);
  } else {
    failed++;
  }

  server.close();
  console.log(failed === 0 ? '\nすべて成功しました' : '\n失敗: ' + failed + ' 件');
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
