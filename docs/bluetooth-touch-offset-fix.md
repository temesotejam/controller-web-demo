# Bluetooth touch offset fix

Windows + Bluetooth接続のDualSenseでは、WebHIDが入力を`reportId = 0x01`、`data.byteLength = 77`として渡す場合があります。

この組み合わせはUSB形式ではなくBluetooth拡張形式として扱い、タッチ点をoffset 34から解析します。判定ではReport IDよりデータ長を優先します。
