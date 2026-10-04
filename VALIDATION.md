# 驗證紀錄

- 原始版本：a21b4df（旅費記帳）。
- JavaScript 語法檢查：通過。
- `node --test tests/*.test.cjs`：12 項通過。
- 涵蓋三方合併、兩裝置新增／修改／刪除、離線修改後重新啟動、版本衝突重試、請求途中新增、同步衝突、帳號快取分離、網路錯誤與表單編輯期間暫停同步。
- 測試使用模擬 API，未連接實際 Supabase，未執行 schema.sql／verify.sql。資料庫部署後需執行 verify.sql 及 CLOUD_SETUP.md 的驗收步驟。
- 未完成瀏覽器視覺驗證：目前環境的瀏覽器執行檔下載失敗。桌面／平板介面仍需實機核對。
- 修改以獨立分支及 Draft PR 提供；正式網站尚未更新。cloud-config.js 保持空白，不含機密資訊。
