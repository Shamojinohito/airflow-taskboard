<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## ヘッドレス実行時の安全弁（Discord/KS-Hub 経由）

Discord（KS-Hub bot）経由のセッションは `--dangerously-skip-permissions` で動作する。
不可逆操作 — デプロイ・`git push`・ファイル/データ削除・一括変更・外部送信（メール送信・本番API書き込み含む）— の前に、
必ず Discord 上で実行内容を列挙して「進めますか？」と確認し、承認の返信を待ってから実行すること。
