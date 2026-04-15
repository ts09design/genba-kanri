# 彩心堂 現場管理アプリ — 開発仕様書

## 1. プロジェクト概要

| 項目 | 内容 |
|------|------|
| **プロジェクト名** | 彩心堂 現場管理（出面管理システム） |
| **オーナー** | 株式会社彩心堂 |
| **業種** | 内装施工業 |
| **利用者** | 彩心堂 社員 3名（全員同じ権限） |
| **対象端末** | iPhone / Google Pixel / iPad / PC |
| **本番URL** | https://ts09design.github.io/genba-kanri/genba-kanri.html |
| **リポジトリ** | https://github.com/ts09design/genba-kanri |

---

## 2. アプリの目的

**紙の出面表をデジタル化する。**

内装施工現場における「誰が何日出たか」を記録・集計し、月末にA4 PDFとして出力できるアプリ。
将来的には3台の端末でリアルタイムにデータを共有することを目指す。

---

## 3. 現在の技術スタック

| 要素 | 技術 |
|------|------|
| **フロントエンド** | 単一HTMLファイル（Vanilla JS, インラインCSS） |
| **フレームワーク** | なし（依存ライブラリゼロ） |
| **データ保存** | localStorage（端末ローカル） |
| **配信** | GitHub Pages（静的ホスティング, 無料） |
| **PWA** | manifest.json + Service Worker（オフラインキャッシュ） |
| **PDF出力** | HTML生成 → window.print() |

**ファイル構成:**
```
genba-kanri/
├── genba-kanri.html    ← メインアプリ（全機能, 約1740行）
├── manifest.json       ← PWAマニフェスト
├── sw.js              ← Service Worker
├── assets/
│   ├── apple-touch-icon.png (180x180)
│   ├── icon-512.png (512x512)
│   └── genba_icon_a.PNG (1024x1024 原本)
├── SPECIFICATION.md    ← この文書
│
│  ※ 以下は旧実装（アーカイブ予定）
├── genba-kanri-app.jsx ← React版プロトタイプ（未使用）
├── App.js             ← Expo版エントリ（未使用）
├── src/               ← Expo版ソース（未使用）
└── package.json       ← Expo依存（未使用）
```

---

## 4. 実装済み機能

### 4.1 現場管理
- 現場の作成・編集・削除
- 現場情報: 現場名, 住所(Googleマップリンク), 元請会社, 元請担当者, 自社担当者, 電話番号(タップ発信), 備考
- 現場一覧: 検索, メンバー数・今月人工の表示

### 4.2 メンバー管理
- メンバーの追加・編集・削除
- カスタムアイコン文字・カラー設定
- ★主要メンバー機能（星トグルで上位ソート）
- **デフォルト登録**: 新規現場に彩心堂4名が自動追加
  - 髙嶋 宏（宏/赤）, 髙嶋 隆一（隆/紫）, 髙嶋 昇（昇/緑）, 佐久間 英二（佐/橙）

### 4.3 カレンダー・出面管理
- 月間カレンダー表示（iOSカレンダー風, 週行+スパンバー）
- 工程イベント: 複数日にまたがる色付きバー（タイトル表示）
- 工程リスト: カレンダー下に当月の工程一覧
- 日ごとの入力:
  - **予定タブ**: 予定人数入力 + メンバー追加（複数同時選択）
  - **実績タブ**: メンバー追加 → 出勤/半日/欠勤の状態切替
  - 「★主要メンバー全員」ワンタップ追加ボタン
  - 工程予定メモ / 作業メモ
- カレンダーセル: 日付(右上) + 工程バー + 予定人数(青文字) or 実績人数(赤丸) + メモドット(橙)
- 日詳細パネル: 左右矢印ナビ + スワイプ対応
- 月ナビ: 前月/翌月 + 今日ボタン

### 4.4 PDF出力
- A4横1枚のレイアウト
- 実績のみ（予定情報は含まない）
- メンバー × 日のマトリクス表（○/△）
- 右パネルにサマリー（月間合計人工 + メンバー別集計）
- ヘッダー: 現場名, 元請会社, 元請担当者, 電話番号, 住所

### 4.5 PWA
- ホーム画面追加でアプリとして動作
- Service Workerによるオフラインキャッシュ
- カスタムアイコン

---

## 5. データモデル

```javascript
// localStorage キー: "genba_sites"
// 値: Site[] (JSON)

Site = {
  id: string,
  name: string,              // 現場名
  address: string,           // 住所
  generalContractor: string, // 元請会社
  gcManager: string,         // 元請担当者
  manager: string,           // 自社担当者
  phone: string,             // 電話番号
  notes: string,             // 備考
  workers: Worker[],         // 登録メンバー
  dayLogs: { [dateKey]: DayLog }, // 日次ログ (dateKey = "YYYY-MM-DD")
  events: Event[],           // 工程イベント
  createdAt: string,         // ISO日時
}

Worker = {
  id: string,
  name: string,
  color: string,     // HEXカラー
  icon: string,      // アイコン文字（空=名前の頭文字）
  starred: boolean,  // 主要メンバーフラグ
}

DayLog = {
  workerStatus: { [workerId]: "present" | "half" | "absent" | "" },
  planWorkers: { [workerId]: "planned" | "" },
  memo: string,              // 作業メモ（実績）
  planMemo: string,          // 工程予定メモ
  plannedHeadcount: number,  // 予定人数
}

Event = {
  id: string,
  title: string,     // 工程名
  start: string,     // 開始日 "YYYY-MM-DD"
  end: string,       // 終了日 "YYYY-MM-DD"
  color: string,     // バー色（6色固定パレット）
}
```

---

## 6. 開発ロードマップ（未実装）

### Phase 1: Firebase Firestore によるデータ共有
**最重要。3人で同じデータをリアルタイム共有する。**

- Firebase Firestore Spark プラン（無料枠）を使用
- データ構造:
  ```
  /teams/{teamId}/sites/{siteId}
  /teams/{teamId}/sites/{siteId}/dayLogs/{dateKey}
  /teams/{teamId}/sites/{siteId}/events/{eventId}
  ```
- リアルタイム同期: `onSnapshot` リスナー
- 簡易アクセス制御: チームID（URL共有）
- localStorage → Firestore への読み書き切替

### Phase 2: オフライン対応 + UI改善
- オフライン時はlocalStorageに書き込み → オンライン復帰時にFirestoreへ同期
- 同期状態インジケーター
- 週間表示（メンバー×日のマトリクス）
- 「今日」ボタンから即入力画面へ

### Phase 3: PDF・レポート強化
- 週間表示のPDF出力
- 作業員別月間集計レポート
- 複数月比較
- 会社ロゴ対応

---

## 7. 重要な制約・方針

| 方針 | 理由 |
|------|------|
| **ランニングコストは実質無料** | GitHub Pages(無料) + Firebase Spark(無料枠)。有料化する可能性があるなら導入しない |
| **PWAで配信** | App Store不要。3人の社内ツールには十分 |
| **単一HTMLファイル** | 依存ライブラリゼロ。保守性・可搬性が最優先 |
| **3人全員同じ権限** | 管理者/一般ユーザーの区別なし |
| **UIはスマホファースト** | 現場でiPhoneから使うのがメイン。PCは補助 |
| **カレンダーUIの視認性** | 日付が常に見える。数字の氾濫を避ける。工程バーはiOSカレンダー風 |

---

## 8. デフォルトメンバー定数

```javascript
const DEFAULT_WORKERS = [
  { id: "saishindo-1", name: "髙嶋 宏",     color: "#DC2626", icon: "宏",  starred: true },
  { id: "saishindo-2", name: "髙嶋 隆一",   color: "#7C3AED", icon: "隆",  starred: true },
  { id: "saishindo-3", name: "髙嶋 昇",     color: "#059669", icon: "昇",  starred: true },
  { id: "saishindo-4", name: "佐久間 英二", color: "#D97706", icon: "佐",  starred: true },
];
```

---

## 9. 開発環境

- **OS**: macOS (Apple Silicon)
- **Node.js**: v20.20.2 (nvm管理)
- **デプロイ**: `git push` → GitHub Pages 自動反映（1-2分）
- **テスト**: ブラウザでの手動確認（自動テストなし）

---

## 10. 開発者への期待

1. **Firebase Firestore の導入経験**があること
2. **PWA / Service Worker** の実務経験
3. **モバイルファーストUI** の設計能力
4. Vanilla JS での開発に抵抗がないこと（React等への移行は検討可だが、シンプルさを優先）
5. 彩心堂のオーナーと直接コミュニケーションし、要望をアプリに反映できること
