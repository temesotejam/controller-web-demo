# DualSense Bluetooth feature report 0x05

Windows上のWebHIDでDualSenseをBluetooth接続した場合、最初は最小入力レポート`0x01`のみが届くことがあります。この状態では、先頭のスティック・ボタン情報以外がゼロ埋めされ、タッチパッド座標やIMU情報は含まれません。

WebHID接続後に次を実行すると、DualSenseは拡張入力レポート`0x31`の送信を開始します。

```javascript
await device.receiveFeatureReport(0x05);
```

本デモではFeature Report `0x05`の読取りを主な初期化方法とし、CRC付きBluetooth出力レポート`0x31`の送信をフォールバックとして残しています。
