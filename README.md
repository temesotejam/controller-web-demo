# Controller Web Demo

PS4 / PS5コントローラを使ったスマホ操作系を、ブラウザ上で確認するための静的Webデモです。

このリポジトリでは、通常のGamepad APIだけでは取得しにくいDualSenseの中央タッチパッド座標をWebHIDで直接読み取り、同じBluetooth拡張入力レポートから左右スティックとL2 / R2も取得します。画面上では入力値、タッチ位置、推進速度、モード、操作有効状態、急停止状態を確認できます。

## 目的

最終的には、PS4 / PS5コントローラをスマートフォンへBluetooth接続し、スマートフォンからESP32へWi-Fiで操作値を送る構成を想定しています。

```text
PS4 / PS5コントローラ
        │ Bluetooth
        ▼
スマートフォンまたはPCのブラウザ
        │ Wi-Fi（将来実装）
        ▼
ESP32
```

現在のリポジトリは、そのうちブラウザ側の入力取得、操作UI、ジェスチャー判定を確認するためのデモです。ESP32への送信処理はまだ含んでいません。

## 現在できること

- DualSenseをBluetooth接続してWebHIDから入力を取得
- 左スティックY軸を左翼操作値として表示
- 右スティックY軸を右翼操作値として表示
- L2を左側の変化量として表示
- R2を右側の変化量として表示
- DualSense中央タッチパッドの接触状態、ID、X座標、Y座標を取得
- タッチ位置を緑色のマーカーで表示
- タッチパッドの上スワイプで推進速度を5%増加
- タッチパッドの下スワイプで推進速度を5%低下
- 上端から反対側の下端への対角スワイプで急停止
- コントローラ操作の有効化・無効化
- 手動、安定化手動、試験モードの切り替え
- 急停止状態の表示と解除
- WebHID非対応時に使える画面上の疑似タッチパッド
- コントローラ未接続時の入力シミュレーター
- 受信したHIDレポートの生バイト診断

## 推奨環境

- Windows PC
- Google ChromeまたはMicrosoft Edge
- DualSense Wireless Controller
- DualSenseとPCのBluetooth接続
- GitHub Pagesまたは`localhost`上のページ

WebHIDはセキュアコンテキストでのみ利用できます。GitHub PagesのHTTPSと`localhost`は利用可能です。通常の`file://`で直接`index.html`を開いた場合、WebHIDが使えないことがあります。

## 基本的な使い方

1. WindowsのBluetooth設定でDualSenseを接続します。
2. GitHub Pagesまたはローカルサーバーでデモページを開きます。
3. 「DualSenseへWebHID接続」を押します。
4. デバイス選択画面で`Wireless Controller`を選択します。
5. 入力レポート表示が`0x31 / 77 bytes`になることを確認します。
6. 左右スティック、L2、R2、中央タッチパッドを操作します。
7. スティックとトリガーが中立であることを確認して「コントローラを有効化」を押します。

古いJavaScriptがブラウザに残っている場合は、Windowsでは`Ctrl + F5`で強制再読み込みしてください。

## DualSenseのBluetooth拡張入力を有効にする仕組み

DualSenseをBluetooth接続した直後は、WebHIDへ最小入力レポート`0x01`が届くことがあります。この状態では、スティックや一部ボタンは読めても、中央タッチパッド座標やIMUデータは含まれません。

このデモではWebHID接続後にFeature Report `0x05`を読み取ります。

```javascript
await device.receiveFeatureReport(0x05);
```

これによりDualSenseがBluetooth拡張入力レポート`0x31`を送信し始めます。

```text
接続直後
report ID = 0x01
最小入力のみ

Feature Report 0x05読取り後
report ID = 0x31
payload = 77 bytes
スティック、トリガー、ボタン、IMU、タッチパッドなどを含む
```

Feature Reportによる切り替えが失敗した環境向けに、CRC32付きのBluetooth出力レポート`0x31`を送るフォールバック処理も残しています。

## WebHIDにおけるレポートIDとpayload

WebHIDの`inputreport`イベントでは、レポートIDとpayloadが別々に渡されます。

```javascript
function handleInputReport(event) {
  const reportId = event.reportId;
  const data = event.data;
}
```

Bluetooth拡張入力の場合は次の状態になります。

```text
reportId = 0x31
data.byteLength = 77
```

このREADMEで示すoffsetは、すべて`event.data`の先頭を0とした位置です。HID全体の先頭にあるReport ID `0x31`は含みません。

## 使用しているBluetooth入力offset

### スティックとトリガー

| 入力 | `event.data`のoffset | 生値 | 正規化後 |
|---|---:|---:|---:|
| 左スティックX | 1 | 0〜255 | -1〜1 |
| 左スティックY | 2 | 0〜255 | -1〜1 |
| 右スティックX | 3 | 0〜255 | -1〜1 |
| 右スティックY | 4 | 0〜255 | -1〜1 |
| L2 | 5 | 0〜255 | 0〜1 |
| R2 | 6 | 0〜255 | 0〜1 |

現在のUIでは左右スティックのY軸だけを使用しています。上方向を正として扱うため、Y軸は正規化後に符号を反転しています。

```javascript
normalized = (raw - 127.5) / 127.5;
wingValue = -normalized;
```

スティックにはデッドゾーン`0.08`、トリガーにはデッドゾーン`0.05`を適用しています。

### タッチパッド

Bluetooth拡張入力`0x31 / 77 bytes`では、タッチ点は次の位置にあります。

| タッチ点 | 開始offset | 使用バイト |
|---|---:|---|
| 第1タッチ点 | 33 | 33〜36 |
| 第2タッチ点 | 37 | 37〜40 |

各タッチ点は4バイトです。

```text
byte 0: 接触フラグ + タッチID
byte 1: X下位8bit
byte 2: X上位4bit + Y下位4bit
byte 3: Y上位8bit
```

解析式は次のとおりです。

```javascript
const contact = data.getUint8(offset);
const xLow = data.getUint8(offset + 1);
const packed = data.getUint8(offset + 2);
const yHigh = data.getUint8(offset + 3);

const active = (contact & 0x80) === 0;
const id = contact & 0x7f;
const x = xLow | ((packed & 0x0f) << 8);
const y = ((packed & 0xf0) >> 4) | (yHigh << 4);
```

DualSenseのタッチ座標範囲は、おおよそ次の値として正規化しています。

```text
X: 0〜1919
Y: 0〜1079
```

指を離したあとも最後のX / Y座標はレポート内に残ることがあります。そのため、座標値だけで接触中かどうかを判断せず、必ず先頭バイトのbit 7を確認します。

```text
bit 7 = 0 : 接触中
bit 7 = 1 : 非接触
```

## 入力経路の構成

入力処理は次の順で動きます。

```text
DualSense
   │ Bluetooth HID
   ▼
WebHID inputreport
   ├─ タッチパッド解析
   ├─ スティック解析
   ├─ L2 / R2解析
   └─ 生データ診断
          │
          ▼
共有入力値
          │
          ▼
app.jsの描画ループ
          │
          ▼
画面表示・操作状態・ジェスチャー処理
```

タッチパッド処理とスティック処理は、同じ`0x31`入力レポートを独立したリスナーで受け取ります。互いの関数を上書きしない構成にしているため、片方の処理追加で他方の入力が止まることを避けています。

WebHID入力が直近500 ms以内に届いている場合は、Gamepad APIや画面シミュレーターよりWebHID入力を優先します。

## Gamepad APIとの関係

通常のGamepad APIでもスティックやL2 / R2を取得できることがあります。しかし、ブラウザ、OS、Bluetooth接続状態、WebHIDの使用状況によっては、Gamepad API側の値が更新されない場合があります。

そのため現在の実装では、DualSenseのBluetooth拡張入力が取得できているときは、スティックとトリガーもWebHIDから直接読みます。

```text
優先順位

1. 直近のWebHID入力
2. Gamepad API
3. 画面上の入力シミュレーター
```

## タッチパッドジェスチャー

### 上スワイプ

下から上へ一定距離以上移動すると、推進速度を5%増加します。

```text
条件の目安
縦移動量 >= 0.28
横移動量 <= 0.28
操作時間 <= 1800 ms
```

### 下スワイプ

上から下へ一定距離以上移動すると、推進速度を5%低下します。

### 対角スワイプによる急停止

上端から始め、反対側の下端まで対角に移動すると急停止します。

```text
開始Y <= 0.2
終了Y >= 0.8
左右の反対側へ移動
横移動量 >= 0.55
縦移動量 >= 0.6
操作時間 120〜1600 ms
```

急停止が成立すると次の処理を行います。

- 推進速度を0%にする
- コントローラ操作を無効化する
- 急停止状態をONにする
- 画面表示を急停止状態へ変更する

急停止解除後も、安全のため操作は自動的に有効になりません。スティックとトリガーを中立に戻したあと、あらためて「コントローラを有効化」を押します。

## 操作有効化の安全条件

「コントローラを有効化」を押したとき、次の入力が中立でない場合は有効化しません。

- 左スティックY
- 右スティックY
- L2
- R2

これは接続直後や再接続直後に、意図せず大きな操作値が出ることを防ぐためです。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | UI全体とスクリプト読込み |
| `styles.css` | 画面デザイン |
| `app.js` | 状態管理、Gamepad API、シミュレーター、描画、急停止、疑似タッチパッド |
| `webhid.js` | WebHID接続、入力レポート表示、タッチパッド解析、生データ診断 |
| `dualsense-bluetooth.js` | Feature Report `0x05`、Bluetooth拡張入力開始、CRC付き出力レポートのフォールバック |
| `webhid-controls.js` | `0x31`からスティックとL2 / R2を読み、既存UIへ渡す独立入力経路 |
| `.github/workflows/pages.yml` | GitHub Pages公開用ワークフロー |

## ローカル起動

Pythonがある場合は、リポジトリのルートで次を実行します。

```bash
python -m http.server 8000
```

その後、ChromeまたはEdgeで次を開きます。

```text
http://localhost:8000
```

## 診断表示の見方

WebHIDパネルの診断欄では次を確認できます。

- 現在のReport ID
- payloadのバイト数
- 直前のレポートから変化したoffset
- 記録した基準値から変化したoffset
- 第1タッチ点の接触状態、ID、X、Y
- 第2タッチ点の接触状態、ID、X、Y
- 全77バイトの16進表示

通常動作時は次の表示になります。

```text
report = 0x31 / 77 bytes
Bluetooth拡張入力 = 0x31拡張入力を受信中
```

`0x01 / 77 bytes`と表示され、後半がすべて`00`の場合は、Windowsまたはブラウザが最小レポートを77バイトへゼロ埋めしている状態です。タッチデータとして解析してはいけません。WebHIDを再接続し、Feature Report `0x05`の読取り結果を確認してください。

## トラブルシューティング

### タッチパッドは動くがスティックが動かない

- `Ctrl + F5`で強制再読み込みする
- WebHIDを再接続する
- 入力レポートが`0x31 / 77 bytes`か確認する
- コントローラ名が`DualSense Wireless Controller（WebHID）`になっているか確認する
- ブラウザの開発者ツールでJavaScriptエラーを確認する

### `0x01 / 77 bytes`のまま変わらない

- WebHIDを切断して再接続する
- ページを強制再読み込みする
- Steamなど他のコントローラ利用アプリを終了する
- WindowsのBluetooth設定でDualSenseを一度削除し、再ペアリングする

### WebHIDのデバイス選択画面が出ない

- ChromeまたはEdgeを使う
- HTTPSまたは`localhost`で開く
- ブラウザのサイト権限からHIDデバイス権限を確認する

### 接触していないのに座標が残る

正常です。DualSenseは指を離したあとも最後の座標を保持する場合があります。接触判定は座標ではなく、タッチ点先頭バイトのbit 7で行います。

## 現在の制約

- WebHIDは主にChromium系ブラウザ向けです。
- iPhone / iPadのSafariでは同じWebHID構成をそのまま利用できません。
- Android端末でもブラウザやOSによってWebHID対応状況が異なります。
- 現在はESP32へのWi-Fi送信を実装していません。
- 左右スティックはY軸だけをUIへ反映しています。
- 第2タッチ点は診断表示できますが、ジェスチャー判定は第1タッチ点を使用します。
- DualSenseのファームウェア、OS、ブラウザ更新によりHIDレポートの扱いが変わる可能性があります。

## 今後の予定

- スマートフォンからESP32へのWebSocketまたはUDP送信
- 操作値の送信周期、タイムアウト、ハートビート設計
- コントローラ切断時のフェイルセーフ
- ESP32側の受信確認とACK
- PS4コントローラ向けHIDレポート解析
- モードごとの入力マッピング切り替え
- 実機艇向けの操作量制限、レート制限、急停止信号の二重化

## 補足

DualSenseのUSB Vendor IDは`0x054c`、Product IDは`0x0ce6`です。

このデモは、単に入力値を表示するだけでなく、将来のスマートフォン経由ESP32操作系で必要になる以下の要素を先行確認する目的があります。

- アナログ入力取得
- タッチジェスチャー
- 操作有効化
- モード管理
- 中立確認
- 急停止
- 接続状態表示
- 入力タイムアウト
- 診断用の生データ表示
