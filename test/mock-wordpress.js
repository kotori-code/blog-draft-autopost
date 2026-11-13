// 仮の WordPress（REST API の「投稿の作成」だけをまねる）
// 本物と同じ URL・認証（アプリケーションパスワードの Basic 認証）・返事の形で応える
//
// 単体で起動:  node blog-autopost/test/mock-wordpress.js   → http://127.0.0.1:8787
// ※ この PC の中だけで動く。Google Apps Script からは届かない

const http = require('http');

// 仮のユーザー（アプリケーションパスワードは本物と同じく 4 文字 × 6 組。空白は無視される）
const USERS = {
  'blog-writer': { password: 'abcd efgh ijkl mnop qrst uvwx', canCreatePosts: true }, // 投稿者
  reader: { password: 'abcd efgh ijkl mnop qrst uvwx', canCreatePosts: false }, // 購読者
};

function createMockWordPress() {
  const posts = [];
  let nextId = 101;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const send = (status, body, type = 'application/json; charset=UTF-8') => {
        res.writeHead(status, { 'Content-Type': type });
        res.end(typeof body === 'string' ? body : JSON.stringify(body));
      };
      const wpError = (status, code, message) => send(status, { code, message, data: { status } });
      const base = 'http://' + req.headers.host;

      // テスト用: セキュリティプラグインに止められた / サーバーが落ちている
      if (req.url.startsWith('/blocked/')) return send(403, '<html><body>Access denied by security plugin</body></html>', 'text/html');
      if (req.url.startsWith('/broken/')) return wpError(500, 'internal_server_error', 'サイトに重大なエラーがありました。');

      if (req.url !== '/wp-json/wp/v2/posts') return wpError(404, 'rest_no_route', 'URL とリクエストメソッドに一致するルートが見つかりません。');
      if (req.method !== 'POST') return wpError(404, 'rest_no_route', 'URL とリクエストメソッドに一致するルートが見つかりません。');

      // 認証
      const auth = req.headers.authorization || '';
      if (!auth.startsWith('Basic ')) return wpError(401, 'rest_cannot_create', 'この投稿タイプの投稿を作成する権限がありません。');
      const [username, ...rest] = Buffer.from(auth.slice(6), 'base64').toString('utf8').split(':');
      const password = rest.join(':');
      const user = USERS[username];
      if (!user) return wpError(401, 'invalid_username', '不明なユーザー名です。');
      if (user.password.replace(/\s/g, '') !== password.replace(/\s/g, '')) {
        return wpError(401, 'incorrect_password', '入力したパスワードは正しくありません。');
      }
      if (!user.canCreatePosts) return wpError(403, 'rest_cannot_create', 'この投稿タイプの投稿を作成する権限がありません。');

      // 中身
      let body;
      try {
        body = JSON.parse(raw);
      } catch (err) {
        return wpError(400, 'rest_invalid_json', '無効な JSON 本文が渡されました。');
      }
      if (!body.title && !body.content) return wpError(400, 'empty_content', '内容、タイトル、抜粋が空欄です。');

      const id = nextId++;
      const post = {
        id,
        date: new Date().toISOString(),
        status: body.status || 'draft',
        link: base + '/?p=' + id,
        title: { raw: body.title, rendered: body.title },
        content: { raw: body.content, rendered: body.content },
        excerpt: { raw: body.excerpt, rendered: '<p>' + body.excerpt + '</p>' },
        author: 2,
      };
      posts.push({ post, username, received: body });
      return send(201, post);
    });
  });

  return { server, posts };
}

module.exports = { createMockWordPress, USERS };

if (require.main === module) {
  const { server, posts } = createMockWordPress();
  const port = Number(process.env.PORT) || 8787;
  server.listen(port, '127.0.0.1', () => {
    console.log('仮の WordPress: http://127.0.0.1:' + port + '/wp-json/wp/v2/posts');
    console.log('ユーザー: blog-writer / パスワード: ' + USERS['blog-writer'].password);
  });
  server.on('request', (req) => {
    req.on('end', () => setImmediate(() => console.log(req.method, req.url, '→ 保存済みの下書き', posts.length, '本')));
  });
}
