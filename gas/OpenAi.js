// OpenAI API の呼び出し
// スクリプトプロパティ:
//   OPENAI_API_KEY  … API キー（必須。OPENAI_MOCK が true のときは不要）
//   OPENAI_MODEL    … 使うモデル（省略時は DEFAULT_OPENAI_MODEL）
//   OPENAI_MOCK     … true にすると OpenAI を呼ばずにテスト用の文を返す（API キーが無くても動作確認できる）

function isOpenAiMock_() {
  return PropertiesService.getScriptProperties().getProperty('OPENAI_MOCK') === 'true';
}

// 指示文を送り、決めた形（JSON スキーマ）の返事をオブジェクトで受け取る
function requestOpenAiJson_(prompt, schemaName, schema) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OpenAI の API キーが設定されていません（スクリプトプロパティ OPENAI_API_KEY）');
  }

  const payload = {
    model: props.getProperty('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: {
      type: 'json_schema',
      json_schema: { name: schemaName, strict: true, schema: schema },
    },
  };

  const res = UrlFetchApp.fetch(OPENAI_CHAT_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  if (code !== 200) {
    console.error('[OpenAI] status ' + code + ': ' + res.getContentText().slice(0, 300));
    throw new Error(openAiErrorMessage_(code));
  }

  const message = JSON.parse(res.getContentText()).choices[0].message;
  if (message.refusal) throw new Error('AI が作成を断りました: ' + message.refusal);
  return JSON.parse(message.content);
}

function openAiErrorMessage_(code) {
  if (code === 401) return 'OpenAI の API キーが正しくありません（' + code + '）';
  if (code === 429) return 'OpenAI の利用上限に達したか、短時間に送りすぎました。少し待つか、OpenAI の支払い設定を確認してください（' + code + '）';
  if (code >= 500) return 'OpenAI 側で一時的な障害が起きています。少し待ってからやり直してください（' + code + '）';
  return 'OpenAI への依頼に失敗しました（' + code + '）。モデル名などの設定を確認してください';
}
