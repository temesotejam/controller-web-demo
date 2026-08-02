const DEADZONE = 0.08;
const TRIGGER_DEADZONE = 0.05;
const PROPULSION_STEP = 5;

const state = {
  connected: false,
  enabled: false,
  emergencyStop: false,
  mode: "manual",
  propulsion: 0,
  leftWing: 0,
  rightWing: 0,
  leftChange: 0,
  rightChange: 0,
  lastAction: "起動",
  controllerName: "Gamepad API待機中",
};

const el = Object.fromEntries([
  "controllerBadge", "armBadge", "controllerName", "enableButton", "disableButton",
  "resetEstopButton", "estopButton", "modeSelect", "leftStickValue", "rightStickValue",
  "l2Value", "r2Value", "leftStickFill", "rightStickFill", "l2Fill", "r2Fill",
  "touchpad", "touchTrace", "gestureResult", "propulsionValue", "propulsionFill",
  "zeroButton", "stateValue", "modeValue", "estopValue", "lastActionValue",
  "simLeft", "simRight", "simL2", "simR2"
].map((id) => [id, document.getElementById(id)]));

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyDeadzone(value, deadzone = DEADZONE) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}

function normalizeTrigger(value) {
  const normalized = clamp(value, 0, 1);
  if (normalized <= TRIGGER_DEADZONE) return 0;
  return (normalized - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE);
}

function getActiveGamepad() {
  const gamepads = navigator.getGamepads?.() ?? [];
  return [...gamepads].find(Boolean) ?? null;
}

function readTrigger(gamepad, buttonIndex, axisFallbackIndex) {
  const button = gamepad.buttons?.[buttonIndex];
  if (button && Number.isFinite(button.value)) return normalizeTrigger(button.value);

  const axis = gamepad.axes?.[axisFallbackIndex];
  if (Number.isFinite(axis)) return normalizeTrigger((axis + 1) / 2);
  return 0;
}

function readGamepad(gamepad) {
  // Standard mapping: axes 1 and 3 are left/right vertical sticks.
  // DualShock/DualSense trigger values are commonly exposed as buttons 6 and 7.
  state.leftWing = applyDeadzone(-(gamepad.axes?.[1] ?? 0));
  state.rightWing = applyDeadzone(-(gamepad.axes?.[3] ?? 0));
  state.leftChange = readTrigger(gamepad, 6, 6);
  state.rightChange = readTrigger(gamepad, 7, 7);
  state.connected = true;
  state.controllerName = gamepad.id || "接続済みコントローラ";
}

function readSimulator() {
  state.leftWing = applyDeadzone(Number(el.simLeft.value));
  state.rightWing = applyDeadzone(Number(el.simRight.value));
  state.leftChange = normalizeTrigger(Number(el.simL2.value));
  state.rightChange = normalizeTrigger(Number(el.simR2.value));
  state.connected = false;
  state.controllerName = "シミュレーター使用中";
}

function inputsAreNeutral() {
  return Math.abs(state.leftWing) < 0.01
    && Math.abs(state.rightWing) < 0.01
    && state.leftChange < 0.01
    && state.rightChange < 0.01;
}

function setEnabled(enabled) {
  if (enabled) {
    if (state.emergencyStop) {
      state.lastAction = "急停止を解除してください";
      return;
    }
    if (!inputsAreNeutral()) {
      state.lastAction = "スティックとトリガーを中立にしてください";
      return;
    }
    state.enabled = true;
    state.lastAction = "コントローラ操作を有効化";
  } else {
    state.enabled = false;
    state.lastAction = "コントローラ操作を無効化";
  }
}

function triggerEmergencyStop(source = "急停止") {
  state.propulsion = 0;
  state.emergencyStop = true;
  state.enabled = false;
  state.lastAction = source;
  el.gestureResult.textContent = "急停止";
  el.gestureResult.classList.add("danger");
  if (navigator.vibrate) navigator.vibrate([100, 60, 180]);
}

function resetEmergencyStop() {
  state.emergencyStop = false;
  state.enabled = false;
  state.lastAction = "急停止を解除（操作は無効）";
  el.gestureResult.textContent = "ジェスチャーなし";
  el.gestureResult.classList.remove("danger");
}

function changePropulsion(delta, source) {
  if (state.emergencyStop) {
    state.lastAction = "急停止中のため推進変更を拒否";
    return;
  }
  state.propulsion = clamp(state.propulsion + delta, 0, 100);
  state.lastAction = `${source}: ${delta > 0 ? "+" : ""}${delta}%`;
  if (navigator.vibrate) navigator.vibrate(25);
}

function setVerticalMeter(element, value) {
  const magnitude = Math.abs(value) * 50;
  element.style.height = `${magnitude}%`;
  element.style.transform = value >= 0 ? "translateY(-100%)" : "translateY(0)";
}

function render() {
  el.controllerName.textContent = state.controllerName;
  el.controllerBadge.textContent = state.connected ? "コントローラ接続中" : "シミュレーター";
  el.controllerBadge.className = `badge ${state.connected ? "badge-on" : "badge-off"}`;

  if (state.emergencyStop) {
    el.armBadge.textContent = "急停止中";
    el.armBadge.className = "badge badge-estop";
  } else if (state.enabled) {
    el.armBadge.textContent = "操作有効";
    el.armBadge.className = "badge badge-armed";
  } else {
    el.armBadge.textContent = "操作無効";
    el.armBadge.className = "badge badge-safe";
  }

  el.leftStickValue.textContent = state.leftWing.toFixed(2);
  el.rightStickValue.textContent = state.rightWing.toFixed(2);
  el.l2Value.textContent = state.leftChange.toFixed(2);
  el.r2Value.textContent = state.rightChange.toFixed(2);
  setVerticalMeter(el.leftStickFill, state.leftWing);
  setVerticalMeter(el.rightStickFill, state.rightWing);
  el.l2Fill.style.width = `${state.leftChange * 100}%`;
  el.r2Fill.style.width = `${state.rightChange * 100}%`;

  el.propulsionValue.textContent = `${state.propulsion}%`;
  el.propulsionFill.style.width = `${state.propulsion}%`;

  el.stateValue.textContent = state.emergencyStop ? "ESTOP" : state.enabled ? "ENABLED" : state.connected ? "DISABLED" : "NO_CONTROLLER / DEMO";
  el.modeValue.textContent = state.mode.toUpperCase();
  el.estopValue.textContent = state.emergencyStop ? "ON" : "OFF";
  el.lastActionValue.textContent = state.lastAction;
  el.resetEstopButton.disabled = !state.emergencyStop;
  el.enableButton.disabled = state.emergencyStop || state.enabled;
  el.disableButton.disabled = !state.enabled;
}

let gestureStart = null;

function localPoint(event) {
  const rect = el.touchpad.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    px: event.clientX - rect.left,
    py: event.clientY - rect.top,
    time: performance.now(),
  };
}

function handleGesture(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const duration = end.time - start.time;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  const startsAtTop = start.y <= 0.2;
  const endsAtBottom = end.y >= 0.8;
  const reachesOppositeSide = (start.x <= 0.35 && end.x >= 0.65) || (start.x >= 0.65 && end.x <= 0.35);
  const diagonalStop = startsAtTop && endsAtBottom && reachesOppositeSide
    && absX >= 0.55 && absY >= 0.6 && duration >= 120 && duration <= 1600;

  if (diagonalStop) {
    triggerEmergencyStop(start.x < end.x ? "左上→右下の対角スワイプ" : "右上→左下の対角スワイプ");
    return;
  }

  const verticalSwipe = absY >= 0.28 && absX <= 0.28 && duration <= 1800;
  if (verticalSwipe && dy < 0) {
    changePropulsion(PROPULSION_STEP, "上スワイプ");
    el.gestureResult.textContent = "上スワイプ +5%";
    el.gestureResult.classList.remove("danger");
  } else if (verticalSwipe && dy > 0) {
    changePropulsion(-PROPULSION_STEP, "下スワイプ");
    el.gestureResult.textContent = "下スワイプ −5%";
    el.gestureResult.classList.remove("danger");
  } else {
    state.lastAction = "ジェスチャー判定なし";
    el.gestureResult.textContent = "判定なし";
    el.gestureResult.classList.remove("danger");
  }
}

el.touchpad.addEventListener("pointerdown", (event) => {
  el.touchpad.setPointerCapture(event.pointerId);
  gestureStart = localPoint(event);
  el.touchTrace.hidden = false;
  el.touchTrace.style.left = `${gestureStart.px}px`;
  el.touchTrace.style.top = `${gestureStart.py}px`;
});

el.touchpad.addEventListener("pointermove", (event) => {
  if (!gestureStart) return;
  const point = localPoint(event);
  el.touchTrace.style.left = `${point.px}px`;
  el.touchTrace.style.top = `${point.py}px`;
});

function finishPointer(event) {
  if (!gestureStart) return;
  const end = localPoint(event);
  handleGesture(gestureStart, end);
  gestureStart = null;
  el.touchTrace.hidden = true;
}

el.touchpad.addEventListener("pointerup", finishPointer);
el.touchpad.addEventListener("pointercancel", () => {
  gestureStart = null;
  el.touchTrace.hidden = true;
});

el.enableButton.addEventListener("click", () => setEnabled(true));
el.disableButton.addEventListener("click", () => setEnabled(false));
el.estopButton.addEventListener("click", () => triggerEmergencyStop("画面の急停止ボタン"));
el.resetEstopButton.addEventListener("click", resetEmergencyStop);
el.zeroButton.addEventListener("click", () => {
  state.propulsion = 0;
  state.lastAction = "推進速度を0%に設定";
});
el.modeSelect.addEventListener("change", (event) => {
  state.mode = event.target.value;
  state.lastAction = `モード変更: ${event.target.selectedOptions[0].textContent}`;
});

document.querySelectorAll("[data-delta]").forEach((button) => {
  button.addEventListener("click", () => changePropulsion(Number(button.dataset.delta), "画面ボタン"));
});

window.addEventListener("gamepadconnected", (event) => {
  state.connected = true;
  state.controllerName = event.gamepad.id;
  state.lastAction = "コントローラ接続";
});

window.addEventListener("gamepaddisconnected", () => {
  state.connected = false;
  state.enabled = false;
  state.leftWing = 0;
  state.rightWing = 0;
  state.leftChange = 0;
  state.rightChange = 0;
  state.lastAction = "コントローラ切断";
});

function frame() {
  const gamepad = getActiveGamepad();
  if (gamepad) readGamepad(gamepad);
  else readSimulator();
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
