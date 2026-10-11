# 日日記帳
正式網址：https://ts6amos.github.io/travel-ledger/daily/

## 使用方式
1. 電腦與手機都開啟同一網址。
2. 展開「跨裝置同步」，登入旅遊版已註冊的同一 App Email／密碼；尚無帳號則註冊並完成信箱確認。
3. 登入後建立「個人帳本」，按 ＋ 新增收入或支出。
4. 另一裝置登入同一 App 帳號，按「立即同步」。看到「已同步」後核對帳目。
5. Android Chrome 使用安裝／加入主畫面；iPhone Safari 使用分享 → 加入主畫面。

## 功能
多帳本、收入／支出、手動外幣匯率、分類／付款方式／關鍵字搜尋、日期範圍、月預算、
分類占比、每日統計、六個月收支趨勢、自訂分類、JSON 備份及匯入、CSV 匯出、深淺色主題、PWA 離線使用。

收支結餘是期間收入減支出，不是銀行餘額。沒有銀行串接、週期自動記帳或多人邀請。
家庭帳本只是名稱，不會自動分享給其他 Email。不同帳號有各自資料空間。

## 本機帳目移轉
未登入時只存在該瀏覽器。首次登入後的空白雲端帳本是正常現象。
先在設定「備份全部資料 JSON」，再按同步面板的「匯入這台裝置的本機帳目」。
相同 ID／相同內容跳過；相同 ID／不同內容建立副本。不要反覆匯入過期備份。

## 同步與衝突
修改後約 700ms 排程同步，前景約每 15 秒檢查遠端，也可手動同步。
離線保存待同步資料，連線及回到前景後繼續；表單開啟時延後同步。
採上次已同步快照、本機、雲端的三方合併。不同筆新增可合併；
同欄位不同修改或刪除／修改衝突會停止並保留資料。
先匯出兩端備份，再選「採用雲端版本」或「以本機版本取代雲端」。
後者取代此帳號的全部日常帳本，不只是單筆。
登出清除 Session，帳號快取仍保留。共用裝置應登出，清理瀏覽器資料前先同步及備份。

## 資料庫與網站
使用既有 Supabase 專案的 daily_ledgers、daily_ledger_read、daily_ledger_write。
旅遊版的 travel_ledgers 與本版分開。公開設定位於 cloud-config.js，不能填入 Secret 或 service_role Key。
純 HTML／CSS／JavaScript，無編譯步驟，不讀取 NEXT_PUBLIC_* 或 .env。
前端發佈於同一 GitHub Pages 的 daily/ 子目錄。若換 Supabase 專案，執行 supabase/schema.sql 並填新公開設定。
Authentication → URL Configuration 的 Site URL 依實際使用網站設定；此既有專案的驗證信可導回原旅遊網站，確認信箱後再手動開啟日常版登入。
官方：https://supabase.com/docs/guides/auth/redirect-urls

## 備份與更新
定期匯出 JSON。同步不能代替備份。
若快取異常，先下載原始快取，再匯入有效 App 備份恢復。
更新時提升 sw.js 的 CACHE 版本並發布完整檔案。關閉全部日常 App 分頁及已安裝視窗後重開。

## 測試
Node.js 22：node --test daily/tests/*.test.cjs （repository 根目錄）。
可選瀏覽器驗證：npm install --no-save playwright@1.64.0，再 npx playwright install chromium，最後 node daily/tests/ui.cjs。
tests/ui.cjs 使用模擬 Supabase，沒有測試帳目存入正式資料庫。
最後仍需使用你的 App 帳號在手機和電腦完成真實登入／CRUD 同步驗收。
