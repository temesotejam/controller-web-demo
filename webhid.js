const SONY_VENDOR_ID = 0x054c;
const DUALSENSE_PRODUCT_ID = 0x0ce6;
const TOUCH_MAX_X = 1919;
const TOUCH_MAX_Y = 1079;

const hidUi = {
  connect: document.getElementById("hidConnectButton"),
  badge: document.getElementById("hidBadge"),
  device: document.getElementById("hidDeviceName"),
  report: document.getElementById("hidReportValue"),
  state: document.getElementById("hidTouchState"),
  x: document.getElementById("hidTouchX"),
  y: document.getElementById("hidTouchY"),
  marker: document.getElementById("hidTouchMarker"),
  surface: document.getElementById("hidTouchSurface"),
};

let hidDevice = null;
let physicalGestureStart = null;
let previousTouchActive = false;

function updateHidStatus(text, connected = false) {
  hidUi.badge.textContent = text;
  hidUi.badge.className = `badge ${connected ? "badge-on" : "badge-off"}`;
}

function parseTouchPoint(view, offset) {
  if (view.byteLength < offset + 4) return null;
  const contact = view.getUint8(offset);
  const packed = view.getUint8(offset + 2);
  const x = view.getUint8(offset + 1) | ((packed & 0x0f) << 8);
  const y = ((packed & 0xf0) >> 4) | (view.getUint8(offset + 3) << 4);
  return {
    active: (contact & 0x80) === 0,
    id: contact & 0x7f,
    x,
    y,
    nx: Math.min(1, Math.max(0, x / TOUCH_MAX_X)),
    ny: Math.min(1, Math.max(0, y / TOUCH_MAX_Y)),
  };
}

function touchOffsetForReport(reportId, view) {
  // Windows + Bluetoothでは、拡張入力がreportId 0x01 / data 77 bytesとして
  // WebHIDへ渡されることがある。そのためReport IDよりデータ長を優先する。
  if (view.byteLength === 77) return 34;
  if (view.byteLength === 63) return 32;

  // 長さが環境差で変化した場合のフォールバック。
  if (reportId === 0x31 && view.byteLength >= 77) return 34;
  if (reportId === 0x01 && view.byteLength >= 63 && view.byteLength < 77) return 32;
  return null;
}

function showTouch(point) {
  hidUi.state.textContent = point.active ? `接触中（ID ${point.id}）` : "非接触";
  hidUi.x.textContent = point.x.toString();
  hidUi.y.textContent = point.y.toString();
  hidUi.marker.hidden = !point.active;
  if (point.active) {
    hidUi.marker.style.left = `${point.nx * 100}%`;
    hidUi.marker.style.top = `${point.ny * 100}%`;
  }
}

function classifyPhysicalGesture(start, end) {
  const dx = end.nx - start.nx;
  const dy = end.ny - start.ny;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const duration = end.time - start.time;

  const diagonalStop = start.ny <= 0.2
    && end.ny >= 0.8
    && ((start.nx <= 0.35 && end.nx >= 0.65) || (start.nx >= 0.65 && end.nx <= 0.35))
    && absX >= 0.55
    && absY >= 0.6
    && duration >= 120
    && duration <= 1600;

  if (diagonalStop) {
    document.getElementById("estopButton")?.click();
    return;
  }

  const verticalSwipe = absY >= 0.28 && absX <= 0.28 && duration <= 1800;
  if (verticalSwipe && dy < 0) {
    document.querySelector('[data-delta="5"]')?.click();
  } else if (verticalSwipe && dy > 0) {
    document.querySelector('[data-delta="-5"]')?.click();
  }
}

function handlePhysicalTouch(point) {
  const timedPoint = { ...point, time: performance.now() };

  if (point.active && !previousTouchActive) {
    physicalGestureStart = timedPoint;
  } else if (!point.active && previousTouchActive && physicalGestureStart) {
    classifyPhysicalGesture(physicalGestureStart, timedPoint);
    physicalGestureStart = null;
  }

  previousTouchActive = point.active;
}

function handleInputReport(event) {
  const { reportId, data } = event;
  hidUi.report.textContent = `0x${reportId.toString(16).padStart(2, "0")} / ${data.byteLength} bytes`;

  const offset = touchOffsetForReport(reportId, data);
  if (offset === null) {
    hidUi.state.textContent = "未対応レポート";
    return;
  }

  const firstPoint = parseTouchPoint(data, offset);
  if (!firstPoint) return;
  showTouch(firstPoint);
  handlePhysicalTouch(firstPoint);
}

async function attachDevice(device) {
  if (!device.opened) await device.open();
  if (hidDevice) hidDevice.removeEventListener("inputreport", handleInputReport);
  hidDevice = device;
  hidDevice.addEventListener("inputreport", handleInputReport);
  hidUi.device.textContent = device.productName || "DualSense Wireless Controller";
  hidUi.connect.textContent = "WebHIDを再接続";
  updateHidStatus("WebHID接続中", true);
}

async function requestDualSense() {
  if (!("hid" in navigator)) {
    updateHidStatus("WebHID非対応");
    hidUi.device.textContent = "Chrome / Edgeで開いてください";
    return;
  }

  try {
    const devices = await navigator.hid.requestDevice({
      filters: [{ vendorId: SONY_VENDOR_ID, productId: DUALSENSE_PRODUCT_ID }],
    });
    if (devices.length === 0) {
      updateHidStatus("選択されませんでした");
      return;
    }
    await attachDevice(devices[0]);
  } catch (error) {
    console.error(error);
    updateHidStatus("接続失敗");
    hidUi.device.textContent = error.message;
  }
}

async function reconnectPreviouslyAllowedDevice() {
  if (!("hid" in navigator)) {
    updateHidStatus("WebHID非対応");
    hidUi.connect.disabled = true;
    return;
  }

  const devices = await navigator.hid.getDevices();
  const dualSense = devices.find((device) =>
    device.vendorId === SONY_VENDOR_ID && device.productId === DUALSENSE_PRODUCT_ID
  );
  if (dualSense) await attachDevice(dualSense);
}

hidUi.connect.addEventListener("click", requestDualSense);

if ("hid" in navigator) {
  navigator.hid.addEventListener("disconnect", (event) => {
    if (event.device !== hidDevice) return;
    hidDevice = null;
    physicalGestureStart = null;
    previousTouchActive = false;
    hidUi.marker.hidden = true;
    hidUi.device.textContent = "未接続";
    hidUi.state.textContent = "待機中";
    updateHidStatus("WebHID未接続");
  });
}

reconnectPreviouslyAllowedDevice().catch(console.error);
