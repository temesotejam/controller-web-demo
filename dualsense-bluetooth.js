// Enables the DualSense full Bluetooth input report (0x31) over WebHID.
// Reading feature report 0x05 is the primary mode switch. A valid 0x31 output
// report is retained as a fallback for environments that still remain in 0x01 mode.

const DS_BT_OUTPUT_REPORT_ID = 0x31;
const DS_BT_OUTPUT_PAYLOAD_SIZE = 77;
const DS_BT_CRC_OFFSET = 73;
const DS_OUTPUT_CRC32_SEED = 0xa2;
const DS_BT_ENABLE_FEATURE_REPORT_ID = 0x05;

let dsBtOutputSequence = 1;
let dsBtEnhancedInputSeen = false;

function createBluetoothModeStatusUi() {
  const connectButton = document.getElementById("hidConnectButton");
  if (!connectButton || document.getElementById("hidBluetoothModeStatus")) return;

  const status = document.createElement("p");
  status.id = "hidBluetoothModeStatus";
  status.className = "hint";
  status.textContent = "Bluetooth拡張入力：未初期化";
  connectButton.insertAdjacentElement("afterend", status);
}

function setBluetoothModeStatus(text, isError = false) {
  createBluetoothModeStatusUi();
  const status = document.getElementById("hidBluetoothModeStatus");
  if (!status) return;
  status.textContent = `Bluetooth拡張入力：${text}`;
  status.style.color = isError ? "#fb7185" : "";
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const dsBtCrc32Table = makeCrc32Table();

function computeDualSenseBluetoothCrc(payload) {
  let crc = 0xffffffff;
  const update = (byte) => {
    crc = dsBtCrc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  };

  update(DS_OUTPUT_CRC32_SEED);
  update(DS_BT_OUTPUT_REPORT_ID);
  for (let i = 0; i < DS_BT_CRC_OFFSET; i += 1) update(payload[i]);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildBluetoothEnableReport() {
  const payload = new Uint8Array(DS_BT_OUTPUT_PAYLOAD_SIZE);
  payload[0] = (dsBtOutputSequence & 0x0f) << 4;
  dsBtOutputSequence = (dsBtOutputSequence + 1) & 0x0f;
  payload[1] = 0x10;
  payload[2] = 0x03;

  const crc = computeDualSenseBluetoothCrc(payload);
  new DataView(payload.buffer).setUint32(DS_BT_CRC_OFFSET, crc, true);
  return payload;
}

async function readDualSenseEnableFeatureReport(device) {
  if (!device?.opened) return false;

  setBluetoothModeStatus("Feature Report 0x05読取中…");
  try {
    const report = await device.receiveFeatureReport(DS_BT_ENABLE_FEATURE_REPORT_ID);
    setBluetoothModeStatus(`Feature Report 0x05読取成功（${report.byteLength} bytes）、0x31入力待機中`);
    return true;
  } catch (error) {
    console.error("Failed to read DualSense feature report 0x05", error);
    setBluetoothModeStatus(`Feature Report 0x05読取失敗: ${error.message}`, true);
    return false;
  }
}

async function sendDualSenseBluetoothFallbackReport(device) {
  if (!device?.opened) return false;

  try {
    await device.sendReport(DS_BT_OUTPUT_REPORT_ID, buildBluetoothEnableReport());
    return true;
  } catch (error) {
    console.error("Failed to send DualSense Bluetooth fallback report", error);
    return false;
  }
}

async function enableDualSenseBluetoothEnhancedInput(device) {
  const featureRead = await readDualSenseEnableFeatureReport(device);

  // Keep the output-report path as a fallback. It is harmless when 0x31 input
  // has already started and helps on some firmware/host combinations.
  const fallbackSent = await sendDualSenseBluetoothFallbackReport(device);
  if (!featureRead && fallbackSent) {
    setBluetoothModeStatus("0x31フォールバック送信済み、入力待機中");
  } else if (!featureRead && !fallbackSent) {
    setBluetoothModeStatus("初期化に失敗しました", true);
  }
  return featureRead || fallbackSent;
}

createBluetoothModeStatusUi();

// Do not interpret Windows' zero-padded minimal Bluetooth 0x01 report as touch data.
// In the 0x31 Bluetooth input payload, touch point 0 starts at byte 33.
const originalTouchOffsetForReport = touchOffsetForReport;
touchOffsetForReport = function patchedTouchOffsetForReport(reportId, view) {
  if (reportId === 0x31 && view.byteLength === 77) return 33;
  if (reportId === 0x01 && view.byteLength === 63) return 32;
  return null;
};

const originalHandleInputReport = handleInputReport;
handleInputReport = function enhancedHandleInputReport(event) {
  originalHandleInputReport(event);

  if (event.reportId === 0x31 && event.data.byteLength === 77) {
    if (!dsBtEnhancedInputSeen) {
      dsBtEnhancedInputSeen = true;
      setBluetoothModeStatus("0x31拡張入力を受信中");
    }
  } else if (event.reportId === 0x01 && event.data.byteLength === 77 && !dsBtEnhancedInputSeen) {
    setBluetoothModeStatus("最小0x01入力のまま（WebHIDを再接続してください）", true);
  }
};

const originalAttachDevice = attachDevice;
attachDevice = async function enhancedAttachDevice(device) {
  await originalAttachDevice(device);

  device.removeEventListener("inputreport", originalHandleInputReport);
  device.removeEventListener("inputreport", handleInputReport);
  device.addEventListener("inputreport", handleInputReport);

  dsBtEnhancedInputSeen = false;
  await enableDualSenseBluetoothEnhancedInput(device);
};

// Auto-reconnect may have completed before this script executed.
if (typeof hidDevice !== "undefined" && hidDevice?.opened) {
  hidDevice.removeEventListener("inputreport", originalHandleInputReport);
  hidDevice.removeEventListener("inputreport", handleInputReport);
  hidDevice.addEventListener("inputreport", handleInputReport);
  dsBtEnhancedInputSeen = false;
  enableDualSenseBluetoothEnhancedInput(hidDevice).catch(console.error);
}
