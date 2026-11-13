// WordPress REST API で記事を「下書き」として保存する
// スクリプトプロパティ:
//   WP_BASE_URL      … サイトの URL（例: https://example.com）
//   WP_USERNAME      … 記事保存用の専用ユーザーのユーザー名
//   WP_APP_PASSWORD  … そのユーザーのアプリケーションパスワード
//   WP_MOCK          … true にすると WordPress に送らず、保存できたことにする（WordPress が無くても動作確認できる）

// article: { title, content(HTML), excerpt } → { id, link, editUrl }
function postDraftToWordPress_(article) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('WP_MOCK') === 'true') return mockWpResult_();

  const conf = {
    baseUrl: props.getProperty('WP_BASE_URL'),
    username: props.getProperty('WP_USERNAME'),
    appPassword: props.getProperty('WP_APP_PASSWORD'),
  };
  const missing = ['WP_BASE_URL', 'WP_USERNAME', 'WP_APP_PASSWORD']
    .filter((name, i) => !Object.values(conf)[i]);
  if (missing.length > 0) {
    throw new Error('WordPress の接続設定がありません（スクリプトプロパティ ' + missing.join('・') + '）');
  }

  const req = buildWpDraftRequest_(article, conf, (s) => Utilities.base64Encode(s, Utilities.Charset.UTF_8));
  let res;
  try {
    res = UrlFetchApp.fetch(req.url, req.options);
  } catch (err) {
    throw new Error('WordPress に接続できませんでした。WP_BASE_URL が正しいか確認してください（' + err.message + '）');
  }
  return parseWpDraftResponse_(res.getResponseCode(), res.getContentText(), conf.baseUrl);
}

// 送るリクエストを組み立てる（Apps Script の機能を使わないので、手元の Node.js からも同じものを使える）
function buildWpDraftRequest_(article, conf, encodeBase64) {
  return {
    url: conf.baseUrl.replace(/\/+$/, '') + WP_POSTS_PATH,
    options: {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Basic ' + encodeBase64(conf.username + ':' + conf.appPassword) },
      payload: JSON.stringify({
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        status: 'draft', // 自動では公開しない
      }),
      muteHttpExceptions: true,
    },
  };
}

// 返事を読む。成功なら記事番号と編集画面の URL を返し、失敗なら理由を日本語で投げる
function parseWpDraftResponse_(code, text, baseUrl) {
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    // セキュリティプラグインなどが HTML のページを返すことがある
  }

  if (code === 201 || code === 200) {
    if (!json || !json.id) throw new Error('WordPress から記事番号が返ってきませんでした（' + code + '）');
    return {
      id: json.id,
      link: json.link,
      editUrl: baseUrl.replace(/\/+$/, '') + '/wp-admin/post.php?post=' + json.id + '&action=edit',
    };
  }

  const detail = json && json.code ? ' ' + json.code : '';
  console.error('[WordPress] status ' + code + detail);
  throw new Error(wpErrorMessage_(code) + '（' + code + detail + '）');
}

function wpErrorMessage_(code) {
  if (code === 401) return 'WordPress のユーザー名かアプリケーションパスワードが違います';
  if (code === 403) return '専用ユーザーに記事を作る権限が無いか、セキュリティプラグインに止められました';
  if (code === 404) return 'WP_BASE_URL が違うか、WordPress の REST API が使えない設定になっています';
  if (code >= 500) return 'WordPress のサーバーで一時的なエラーが起きています。少し待ってからやり直してください';
  return 'WordPress への保存に失敗しました';
}

// WP_MOCK = true のときの、保存できたことにする返事
function mockWpResult_() {
  const id = Math.floor(Date.now() / 1000) % 100000;
  return {
    id: id,
    link: 'https://example.com/?p=' + id,
    editUrl: 'https://example.com/wp-admin/post.php?post=' + id + '&action=edit',
  };
}
