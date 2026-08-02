// Reads DualSense Bluetooth enhanced reports without replacing the touchpad parser.
// WebHID supplies the report ID separately, so offsets refer to event.data.

const DS_CONTROLS_REPORT_ID = 0x31;
const DS_CONTROLS_REPORT_SIZE = 77;
const DS_CONTROLS_TIMEOUT_MS = 500;

let latestDualSenseControls = null;
let controlsDevice = null;

function normalizeDualSenseAxis(raw) {
  return Math.max(-1, Math.min(1, (raw - 127.5) / 127.5));
}

function handleDualSenseControlsReport(event) {
  if (event.reportId !== DS_CONTROLS_REPORT_ID || event.data.byteLength !== DS_CONTROLS_REPORT_SIZE) return;

  latestDualSenseControls = {
    leftWing: applyDeadzone(-normalizeDualSenseAxis(event.data.getUint8(2))),
    rightWing: applyDeadzone(-normalizeDualSenseAxis(event.data.getUint8(4))),
    leftChange: normalizeTrigger(event.data.getUint8(5) / 255),
    rightChange: normalizeTrigger(event.data.getUint8(6) / 255),
    updatedAt: performance.now(),
  };
}

function bindControlsListener() {
  const current = typeof hidDevice !== "undefined" ? hidDevice : null;
  if (current === controlsDevice) return;

  if (controlsDevice) {
    controlsDevice.removeEventListener("inputreport", handleDualSenseControlsReport);
  }

  controlsDevice = current;
  latestDualSenseControls = null;

  if (controlsDevice?.opened) {
    controlsDevice.addEventListener("inputreport", handleDualSenseControlsReport);
  }
}

function applyLatestDualSenseControls() {
  if (!latestDualSenseControls) return false;
  if (performance.now() - latestDualSenseControls.updatedAt > DS_CONTROLS_TIMEOUT_MS) return false;

  state.leftWing = latestDualSenseControls.leftWing;
  state.rightWing = latestDualSenseControls.rightWing;
  state.leftChange = latestDualSenseControls.leftChange;
  state.rightChange = latestDualSenseControls.rightChange;
  state.connected = true;
  state.controllerName = "DualSense Wireless Controller（WebHID）";
  return true;
}

// Only the app's input-source selection is extended. The WebHID touch listener is left untouched.
const baseReadGamepad = readGamepad;
readGamepad = function readGamepadWithDualSenseHid(gamepad) {
  if (applyLatestDualSenseControls()) return;
  baseReadGamepad(gamepad);
};

const baseReadSimulator = readSimulator;
readSimulator = function readSimulatorWithDualSenseHid() {
  if (applyLatestDualSenseControls()) return;
  baseReadSimulator();
};

// attachDevice can run later or during auto-reconnect, so bind independently.
setInterval(bindControlsListener, 100);
bindControlsListener();
