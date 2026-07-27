<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## ヘッドレス実行時の安全弁（Discord/KS-Hub 経由）

Discord（KS-Hub bot）経由のセッションは `--dangerously-skip-permissions` で動作する。
不可逆操作 — デプロイ・`git push`・ファイル/データ削除・一括変更・外部送信（メール送信・本番API書き込み含む）— の前に、
必ず Discord 上で実行内容を列挙して「進めますか？」と確認し、承認の返信を待ってから実行すること。

## 質問・確認の作法（ヘッドレス制約）

- このセッションはヘッドレスな Discord 中継で実行されている。AskUserQuestion・ExitPlanMode などの対話型ツールは提示先が無く黙って無視され、勝手に既定値で先へ進んでしまう。使わないこと。
- ユーザーに確認・選択・判断を求めたいときは、質問を通常の応答本文に書き、そこでターンを終える。次の Discord 返信が届いて続きを処理できる。
- 選択肢があるときは本文に番号付きで列挙して尋ねる（例:「1) A案 2) B案 — どちらにしますか?」）。
- これは既存の安全弁（危険操作は Discord で確認→承認を待つ）と整合する。承認はボタン、一般の質問は本文で聞いて返信を待つ。
