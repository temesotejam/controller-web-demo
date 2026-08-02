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
let previousBytes = null;
let baselineBytes = null;
let latestBytes = null;

function createDiagnosticsUi() {
  const host = hidUi.surface?.parentElement;
  if (!host || document.getElementById("hidDiagnostics")) return;

  const details = document.createElement("details");
  details.id = "hidDiagnostics";
  details.style.marginTop = "18px";
  details.innerHTML = `
    <summary style="cursor:pointer;font-weight:800">Bluetooth入力の生データ診断</summary>
    <p class="hint">タッチしていない状態で「基準を記録」を押し、その後タッチパッドを触ってください。変化したバイト番号を表示します。</p>
    <div class="quick-controls">
      <button id="hidCaptureBaseline" type="button">基準を記録</button>
      <button id="hidClearBaseline" type="button">基準を消去</button>
      <button id="hidCopyDiagnostics" type="button">診断結果をコピー</button>
    </div>
    <dl class="state-list hid-state-list" style="margin-top:12px">
      <div><dt>直前から変化</dt><dd id="hidChangedPrevious">—</dd></div>
      <div><dt>基準から変化</dt><dd id="hidChangedBaseline">—</dd></div>
      <div><dt>候補オフセット</dt><dd id="hidCandidateOffsets">—</dd></div>
    </dl>
    <p class="hint" style="margin-bottom:6px">全入力データ（番号:16進値）</p>
    <pre id="hidRawBytes" style="white-space:pre-wrap;word-break:break-all;max-height:260px;overflow:auto;padding:12px;border-radius:12px;background:#090c12;border:1px solid rgba(255,255,255,.09);font-size:.76rem;line-height:1.65">待機中</pre>
  `;
  host.appendChild(details);

  document.getElementById("hidCaptureBaseline").addEventListener("click", () => {
    baselineBytes = latestBytes ? new Uint8Array(latestBytes) : null;
    document.getElementById("hidChangedBaseline").textContent = baselineBytes ? "基準を記録しました" : "入力待機中";
  });
  document.getElementById("hidClearBaseline").addEventListener("click", () => {
    baselineBytes = null;
    document.getElementById("hidChangedBaseline").textContent = "—";
  });
  document.getElementById("hidCopyDiagnostics").addEventListener("click", async () => {
    const text = [
      `report=${hidUi.report.textContent}`,
      `previous=${document.getElementById("hidChangedPrevious").textContent}`,
      `baseline=${document.getElementById("hidChangedBaseline").textContent}`,
      `candidates=${document.getElementById("hidCandidateOffsets").textContent}`,
      document.getElementById("hidRawBytes").textContent,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      document.getElementById("hidCopyDiagnostics").textContent = "コピーしました";
      setTimeout(() => { document.getElementById("hidCopyDiagnostics").textContent = "診断結果をコピー"; }, 1200);
    } catch (error) {
      console.error(error);
    }
  });
}

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
  if (view.byteLength === 77) return 34;
  if (view.byteLength === 63) return 32;
  if (reportId === 0x31 && view.byteLength >= 77) return 34;
  if (reportId === 0x01 && view.byteLength >= 63 && view.byteLength < 77) return 32;
  return null;
}

function changedIndexes(current, reference) {
  if (!reference || reference.length !== current.length) return [];
  const changed = [];
  for (let i = 0; i < current.length; i += 1) {
    if (current[i] !== reference[i]) changed.push(`${i}:${reference[i].toString(16).padStart(2, "0")}→${current[i].toString(16).padStart(2, "0")}`);
  }
  return changed;
}

function findTouchCandidates(bytes, changedSet) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const candidates = [];
  for (let offset = 0; offset <= bytes.length - 4; offset += 1) {
    const point = parseTouchPoint(view, offset);
    if (!point || point.x > TOUCH_MAX_X || point.y > TOUCH_MAX_Y) continue;
    const touchesChangedByte = [offset, offset + 1, offset + 2, offset + 3].some((index) => changedSet.has(index));
    if (touchesChangedByte) candidates.push(`${offset}(id=${point.id},${point.active ? "ON" : "OFF"},x=${point.x},y=${point.y})`);
  }
  return candidates.slice(0, 16);
}

function renderDiagnostics(data) {
  createDiagnosticsUi();
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  latestBytes = new Uint8Array(bytes);

  const previousChanges = changedIndexes(bytes, previousBytes);
  const baselineChanges = changedIndexes(bytes, baselineBytes);
  const changedSet = new Set((baselineChanges.length ? baselineChanges : previousChanges).map((item) => Number(item.split(":")[0])));
  const candidates = findTouchCandidates(bytes, changedSet);

  document.getElementById("hidChangedPrevious").textContent = previousBytes
    ? (previousChanges.join(", ") || "変化なし")
    : "初回レポート";
  document.getElementById("hidChangedBaseline").textContent = baselineBytes
    ? (baselineChanges.join(", ") || "変化なし")
    : "基準未記録";
  document.getElementById("hidCandidateOffsets").textContent = candidates.join(" / ") || "候補なし";

  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = Array.from(bytes.slice(i, i + 16))
      .map((value, index) => `${String(i + index).padStart(2, "0")}:${value.toString(16).padStart(2, "0")}`)
      .join("  ");
    lines.push(chunk);
  }
  document.getElementById("hidRawBytes").textContent = lines.join("\n");
  previousBytes = new Uint8Array(bytes);
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
  const diagonalStop = start.ny <= 0.2 && end.ny >= 0.8
    && ((start.nx <= 0.35 && end.nx >= 0.65) || (start.nx >= 0.65 && end.nx <= 0.35))
    && absX >= 0.55 && absY >= 0.6 && duration >= 120 && duration <= 1600;
  if (diagonalStop) {
    document.getElementById("estopButton")?.click();
    return;
  }
  const verticalSwipe = absY >= 0.28 && absX <= 0.28 && duration <= 1800;
  if (verticalSwipe && dy < 0) document.querySelector('[data-delta="5"]')?.click();
  else if (verticalSwipe && dy > 0) document.querySelector('[data-delta="-5"]')?.click();
}

function handlePhysicalTouch(point) {
  const timedPoint = { ...point, time: performance.now() };
  if (point.active && !previousTouchActive) physicalGestureStart = timedPoint;
  else if (!point.active && previousTouchActive && physicalGestureStart) {
    classifyPhysicalGesture(physicalGestureStart, timedPoint);
    physicalGestureStart = null;
  }
  previousTouchActive = point.active;
}

function handleInputReport(event) {
  const { reportId, data } = event;
  hidUi.report.textContent = `0x${reportId.toString(16).padStart(2, "0")} / ${data.byteLength} bytes`;
  renderDiagnostics(data);

  const offset = touchOffsetForReport(reportId, data);
  if (offset === null) {
    hidUi.state.textContent = "未対応レポート（診断データを確認）";
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
  createDiagnosticsUi();
}

async function requestDualSense() {
  if (!("hid" in navigator)) {
    updateHidStatus("WebHID非対応");
    hidUi.device.textContent = "Chrome / Edgeで開いてください";
    return;
  }
  try {
    const devices = await navigator.hid.requestDevice({ filters: [{ vendorId: SONY_VENDOR_ID, productId: DUALSENSE_PRODUCT_ID }] });
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
  const dualSense = devices.find((device) => device.vendorId === SONY_VENDOR_ID && device.productId === DUALSENSE_PRODUCT_ID);
  if (dualSense) await attachDevice(dualSense);
}

hidUi.connect.addEventListener("click", requestDualSense);
createDiagnosticsUi();

if ("hid" in navigator) {
  navigator.hid.addEventListener("disconnect", (event) => {
    if (event.device !== hidDevice) return;
    hidDevice = null;
    physicalGestureStart = null;
    previousTouchActive = false;
    previousBytes = null;
    baselineBytes = null;
    latestBytes = null;
    hidUi.marker.hidden = true;
    hidUi.device.textContent = "未接続";
    hidUi.state.textContent = "待機中";
    updateHidStatus("WebHID未接続");
  });
}

reconnectPreviouslyAllowedDevice().catch(console.error);
