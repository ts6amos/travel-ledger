# 驗證紀錄

- 原始版本：a21b4df（旅費記帳）。
- JavaScript 語法檢查：通過。
- `node --test tests/*.test.cjs`：12 項通過。
- 涵蓋三方合併、兩裝置新增／修改／刪除、離線重開、版本衝突重試、請求途中新增、衝突處理、帳號快取分離、網路錯誤與編輯表單期間暫停同步。
- 2026-10-04：已填入使用者提供的 Supabase Project URL 與公開 publishable key。
- 實際 API 檢查：公開金鑰可取得 Auth settings；Email 登入啟用、允許註冊、要求信箱驗證。
- 未登入呼叫 ledger_read 回傳 HTTP 401 / permission denied，符合權限限制。
- 使用者提供的 SQL 驗證截圖顯示 travel_ledgers、ledger_read、ledger_write 皆存在。
- 模擬測試不代表真實登入或跨裝置驗收；真實帳號登入、讀寫、離線補同步及裝置畫面仍需依 CLOUD_SETUP.md 驗收。
- 未使用管理員私密金鑰，亦未讀取或變更使用者的既有雲端帳目。
