// Routes DualSense Bluetooth enhanced input reports into the existing controller UI.
// The WebHID report ID is supplied separately, so these offsets refer to event.data.

const DS_BT_INPUT_REPORT_ID = 0x31;
const DS_BT_INPUT_SIZE = 77;
const DS_HID_INPUT_TIMEOUT_MS = 500;

let latestDualSenseHidControls = null;

function normalizeDualSenseAxis(raw) {
  return Math.max(-1, Math.min(1, (raw - 127.5) / 127.5));
}

function captureDualSenseHidControls(event) {
  if (event.reportId !== DS_BT_INPUT_REPORT_ID || event.data.byteLength !== DS_BT_INPUT_SIZE) return;

  latestDualSenseHidControls = {
    leftWing: applyDeadzone(-normalizeDualSenseAxis(event.data.getUint8(2))),
    rightWing: applyDeadzone(-normalizeDualSenseAxis(event.data.getUint8(4))),
    leftChange: normalizeTrigger(event.data.getUint8(5) / 255),
    rightChange: normalizeTrigger(event.data.getUint8(6) / 255),
    updatedAt: performance.now(),
  };
}

function applyLatestDualSenseHidControls() {
  if (!latestDualSenseHidControls) return false;
  if (performance.now() - latestDualSenseHidControls.updatedAt > DS_HID_INPUT_TIMEOUT_MS) return false;

  state.leftWing = latestDualSenseHidControls.leftWing;
  state.rightWing = latestDualSenseHidControls.rightWing;
  state.leftChange = latestDualSenseHidControls.leftChange;
  state.rightChange = latestDualSenseHidControls.rightChange;
  state.connected = true;
  state.controllerName = "DualSense Wireless Controller（WebHID）";
  return true;
}

// Prefer recent WebHID data over both Gamepad API and the on-screen simulator.
const originalReadGamepadForWebHid = readGamepad;
readGamepad = function readGamepadWithWebHidFallback(gamepad) {
  if (applyLatestDualSenseHidControls()) return;
  originalReadGamepadForWebHid(gamepad);
};

const originalReadSimulatorForWebHid = readSimulator;
readSimulator = function readSimulatorWithWebHidFallback() {
  if (applyLatestDualSenseHidControls()) return;
  originalReadSimulatorForWebHid();
};

// Observe the same input reports already used by the touchpad parser.
const upstreamHandleInputReportForControls = handleInputReport;
handleInputReport = function handleInputReportWithControls(event) {
  upstreamHandleInputReportForControls(event);
  captureDualSenseHidControls(event);
};

const upstreamAttachDeviceForControls = attachDevice;
attachDevice = async function attachDeviceWithControls(device) {
  await upstreamAttachDeviceForControls(device);
  device.removeEventListener("inputreport", upstreamHandleInputReportForControls);
  device.removeEventListener("inputreport", handleInputReport);
  device.addEventListener("inputreport", handleInputReport);
};

// Auto-reconnect may have attached the previous listener before this script loaded.
if (typeof hidDevice !== "undefined" && hidDevice?.opened) {
  hidDevice.removeEventListener("inputreport", upstreamHandleInputReportForControls);
  hidDevice.removeEventListener("inputreport", handleInputReport);
  hidDevice.addEventListener("inputreport", handleInputReport);
}
