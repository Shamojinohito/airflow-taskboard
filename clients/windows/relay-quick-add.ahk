#Requires AutoHotkey v2.0
#SingleInstance Force

; ===================== 設定 =====================
HOTKEY_COMBO := "^Space"  ; Ctrl+Space（変更はここ）
BASE_URL := "https://relay-taskboard.vercel.app"
CONFIG_PATH := A_ScriptDir "\config.ini"
; ================================================

API_KEY := IniRead(CONFIG_PATH, "relay", "api_key", "")
if (API_KEY = "") {
    MsgBox("config.ini の [relay] api_key が未設定です。`nconfig.ini.example をコピーして設定してください。", "Relay Quick Add", "Iconx")
    ExitApp()
}

TraySetIcon("shell32.dll", 265)  ; チェックマーク風アイコン
A_IconTip := "Relay Quick Add (" HOTKEY_COMBO ")"
Hotkey(HOTKEY_COMBO, (*) => ShowBox(""))

ShowBox(prefill) {
    static qaGui := 0
    if IsObject(qaGui) {
        try qaGui.Destroy()
    }
    qaGui := Gui("+AlwaysOnTop -Caption +ToolWindow +Border", "Relay Quick Add")
    qaGui.SetFont("s9 cGray", "Yu Gothic UI")
    qaGui.MarginX := 14
    qaGui.MarginY := 10
    qaGui.AddText(, "Relay に追加 ｜ s=Sales p=Personal b=SecondBrain ｜ due:7/18・due:明日 ｜ !high !low ｜ Esc=閉じる")
    qaGui.SetFont("s12 cDefault", "Yu Gothic UI")
    edit := qaGui.AddEdit("w600 -WantReturn", prefill)
    okBtn := qaGui.AddButton("Default Hidden", "OK")  ; Enter で発火する隠しボタン
    okBtn.OnEvent("Click", (*) => Submit(qaGui, edit.Value))
    qaGui.OnEvent("Escape", (*) => qaGui.Destroy())
    qaGui.Show("AutoSize xCenter y160")
}

Submit(qaGui, text) {
    global API_KEY, BASE_URL
    text := Trim(text)
    qaGui.Destroy()
    if (text = "")
        return
    try {
        req := ComObject("WinHttp.WinHttpRequest.5.1")
        req.Open("POST", BASE_URL "/api/v1/agent/quick-add", false)
        ; WinHTTP は既定で古い TLS を選び、Vercel(TLS1.2+必須)に弾かれて
        ; 「セキュリティで保護されたチャネル」エラー(0x80072F7D)になる。
        ; Option(9)=SecureProtocols で TLS を明示。まず 1.2+1.3、
        ; 1.3 非対応の旧 Windows では例外になるので TLS1.2 単体へフォールバック。
        try {
            req.Option(9) := 0x2800  ; TLS1.2(0x0800) | TLS1.3(0x2000)
        } catch {
            req.Option(9) := 0x0800  ; TLS1.2 のみ（全対応 Windows で有効）
        }
        ; charset=utf-8 指定により WinHttp が UTF-16 文字列を UTF-8 で送信する
        req.SetRequestHeader("Content-Type", "application/json; charset=utf-8")
        req.SetRequestHeader("X-Api-Key", API_KEY)
        req.Send('{"text":' JsonStr(text) ',"source":"windows-ahk"}')
        if (req.Status = 201) {
            TrayTip(ExtractSummary(req.ResponseText), "✓ Relay に追加しました", "Iconi Mute")
        } else {
            TrayTip("HTTP " req.Status " — テキストを保持して再表示します", "Relay 送信失敗", "Iconx")
            ShowBox(text)  ; 入力を消失させない
        }
    } catch as e {
        TrayTip(e.Message " — テキストを保持して再表示します", "Relay 送信エラー", "Iconx")
        ShowBox(text)
    }
}

JsonStr(s) {
    s := StrReplace(s, "\", "\\")
    s := StrReplace(s, '"', '\"')
    s := StrReplace(s, "`r", "\r")
    s := StrReplace(s, "`n", "\n")
    s := StrReplace(s, "`t", "\t")
    return '"' s '"'
}

ExtractSummary(json) {
    ; 通知表示用に summary フィールドだけ取り出す（厳密な JSON パースはしない）
    if RegExMatch(json, '"summary":"([^"]*)"', &m)
        return m[1]
    return "登録完了"
}
