# WebHID implementation notes

DualSenseのタッチ座標は通常のGamepad APIではなく、WebHIDの入力レポートから取得します。

- Sony Vendor ID: `0x054c`
- DualSense Product ID: `0x0ce6`
- USB入力レポート: Report ID `0x01`
- Bluetooth入力レポート: Report ID `0x31`（実験対応）
- タッチ点は1点あたり4バイト
- X/Yは各12ビット
- contactバイトのbit 7が0のとき接触中

`HIDInputReportEvent.data`はReport IDを含まないため、USBではデータ先頭から32バイト、Bluetoothでは34バイトの位置を第1タッチ点として解析します。
