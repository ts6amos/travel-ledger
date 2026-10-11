# 日常版驗證
來源：使用者提供的旅遊版 ZIP，恢復至 GitHub daily/ 子目錄。

既有開發過程通過 18 項 Node 模型／同步測試及 Chromium 本機與模擬 Supabase 瀏覽器測試。
恢復版本必須重新通過 Daily Ledger checks 工作流程，才合併發布。
工作流程包含旅遊版既有測試、日常版模型／同步測試、Chromium 整合測試，以及正式 Supabase 的匿名 RPC 拒絕檢查。
匿名檢查不讀取使用者帳目；不得將其結果當作真實登入完成。

使用者已提供 SQL Editor 的 table_exists／read_exists／write_exists 全部 true。
待實機驗收：真實 Email 密碼登入、兩台裝置新增／修改／刪除、iOS/Android 安裝與離線恢復。
