// Enables the DualSense full Bluetooth input report (0x31) over WebHID.
// WebHID sendReport() receives the report ID separately, so the payload is 77 bytes.

const DS_BT_OUTPUT_REPORT_ID = 0x31;
const DS_BT_OUTPUT_PAYLOAD_SIZE = 77;
const DS_BT_CRC_OFFSET = 73;
const DS_OUTPUT_CRC32_SEED = 0xa2;

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
  // Linux hid-playstation signs: seed 0xA2 + report ID 0x31 + payload before CRC.
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

  // Bluetooth header: sequence/tag followed by the 47-byte common output block.
  payload[0] = (dsBtOutputSequence & 0x0f) << 4;
  dsBtOutputSequence = (dsBtOutputSequence + 1) & 0x0f;
  payload[1] = 0x10;

  // Mark compatible vibration/haptics fields as valid while commanding zero output.
  // Sending a valid Bluetooth output report switches DualSense from minimal 0x01 input
  // to the full 0x31 input report containing motion and touchpad data.
  payload[2] = 0x03;

  const crc = computeDualSenseBluetoothCrc(payload);
  const view = new DataView(payload.buffer);
  view.setUint32(DS_BT_CRC_OFFSET, crc, true);
  return payload;
}

async function enableDualSenseBluetoothEnhancedInput(device) {
  if (!device?.opened) return false;

  setBluetoothModeStatus("初期化レポート送信中…");
  try {
    const payload = buildBluetoothEnableReport();
    await device.sendReport(DS_BT_OUTPUT_REPORT_ID, payload);
    setBluetoothModeStatus("初期化送信済み、0x31入力待機中");
    return true;
  } catch (error) {
    console.error("Failed to enable DualSense Bluetooth enhanced input", error);
    setBluetoothModeStatus(`送信失敗: ${error.message}`, true);
    return false;
  }
}

createBluetoothModeStatusUi();

// Do not interpret Windows' zero-padded minimal Bluetooth 0x01 report as touch data.
const originalTouchOffsetForReport = touchOffsetForReport;
touchOffsetForReport = function patchedTouchOffsetForReport(reportId, view) {
  if (reportId === 0x31 && view.byteLength === 77) return 34;
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
    setBluetoothModeStatus("最小0x01入力のまま（再初期化してください）", true);
  }
};

const originalAttachDevice = attachDevice;
attachDevice = async function enhancedAttachDevice(device) {
  await originalAttachDevice(device);

  // Replace a listener installed before this patch loaded, if necessary.
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
  enableDualSenseBluetoothEnhancedInput(hidDevice).catch(console.error);
}
