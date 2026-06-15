import { canMove, createInitialPegs, findHint, formatDuration, isSolved, minimumMoves, moveDisk, pegNames } from "./game.js";
const diskColors = ["#f06449", "#f6ae2d", "#4d9078", "#277da1", "#6d597a", "#43aa8b", "#bc4749", "#355070"];
function requiredElement(selector) {
  const element = document.querySelector(selector);
  if (!element) {
    throw new Error(`Required DOM element is missing: ${selector}`);
  }
  return element;
}
const board = requiredElement("#board");
const diskCountSelect = requiredElement("#diskCount");
const resetButton = requiredElement("#resetButton");
const undoButton = requiredElement("#undoButton");
const hintButton = requiredElement("#hintButton");
const stepButton = requiredElement("#stepButton");
const autoButton = requiredElement("#autoButton");
const autoSpeedSelect = requiredElement("#autoSpeed");
const moveCount = requiredElement("#moveCount");
const minimumMoveCount = requiredElement("#minimumMoves");
const timer = requiredElement("#timer");
const message = requiredElement("#message");
const hintText = requiredElement("#hintText");
const gameState = requiredElement("#gameState");
const logPanel = requiredElement("#logPanel");
const logToggleButton = requiredElement("#logToggleButton");
const logCount = requiredElement("#logCount");
const logList = requiredElement("#logList");
const logEmptyState = requiredElement("#logEmptyState");
const exportLogButton = requiredElement("#exportLogButton");
const operationLabels = {
  move: "移動",
  step: "一手進める",
  auto: "オート再生",
  undo: "戻す"
};
let diskCount = Number(diskCountSelect.value);
let pegs = createInitialPegs(diskCount);
let selectedPeg = null;
let draggedPeg = null;
let moveHistory = [];
let operationLog = [];
let currentHint = null;
let startedAt = null;
let elapsedBeforeStart = 0;
let timerId = null;
let autoplayId = null;
let won = false;
function asPegIndex(value) {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new Error(`Invalid peg index: ${value}`);
  }
  return value;
}
function startTimer() {
  if (startedAt !== null) {
    return;
  }
  startedAt = Date.now();
  timerId = window.setInterval(updateTimer, 250);
}
function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
  }
  if (startedAt !== null) {
    elapsedBeforeStart += Date.now() - startedAt;
  }
  startedAt = null;
  timerId = null;
  updateTimer();
}
function resetTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
  }
  startedAt = null;
  elapsedBeforeStart = 0;
  timerId = null;
  updateTimer();
}
function getElapsed() {
  return elapsedBeforeStart + (startedAt === null ? 0 : Date.now() - startedAt);
}
function updateTimer() {
  timer.textContent = formatDuration(getElapsed());
}
function setMessage(text) {
  message.textContent = text;
}
function describeMove(move) {
  return `${pegNames[move.from]} -> ${pegNames[move.to]}`;
}
function formatElapsedSeconds(milliseconds) {
  return (Math.round(milliseconds / 10) / 100).toFixed(2);
}
function csvEscape(value) {
  const stringValue = String(value);
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}
function renderOperationLog() {
  logList.innerHTML = "";
  logCount.textContent = String(operationLog.length);
  logEmptyState.hidden = operationLog.length > 0;
  exportLogButton.disabled = operationLog.length === 0;
  operationLog.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "log-item";
    const timestamp = document.createElement("span");
    timestamp.className = "log-time";
    timestamp.textContent = entry.timestamp;
    const detail = document.createElement("span");
    detail.className = "log-detail";
    const action = document.createElement("span");
    action.className = "log-action";
    action.textContent = `${operationLabels[entry.action]} ${pegNames[entry.from]} -> ${pegNames[entry.to]}`;
    const meta = document.createElement("span");
    meta.className = "log-meta";
    meta.textContent = `ディスク ${entry.disk} / 手数 ${entry.moveCount}`;
    detail.append(action, meta);
    item.append(timestamp, detail);
    logList.append(item);
  });
  logList.scrollTop = logList.scrollHeight;
}
function recordOperation(action, move) {
  const elapsed = getElapsed();
  operationLog.push({
    sequence: operationLog.length + 1,
    timestamp: formatDuration(elapsed),
    elapsedSeconds: formatElapsedSeconds(elapsed),
    action,
    disk: move.disk,
    from: move.from,
    to: move.to,
    moveCount: moveHistory.length
  });
}
function createLogCsv() {
  const rows = [
    ["index", "timestamp", "timestamp_seconds", "operation", "disk", "from", "to", "move_count"],
    ...operationLog.map((entry) => [
      entry.sequence,
      entry.timestamp,
      entry.elapsedSeconds,
      operationLabels[entry.action],
      entry.disk,
      pegNames[entry.from],
      pegNames[entry.to],
      entry.moveCount
    ])
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
function exportOperationLog() {
  const blob = new Blob([`\uFEFF${createLogCsv()}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `tower-of-hanoi-log-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
function clearHint() {
  currentHint = null;
  hintText.textContent = "";
}
function setHint(move) {
  currentHint = move;
  hintText.textContent = move ? `ヒント: ${describeMove(move)}` : "";
}
function isAutoplaying() {
  return autoplayId !== null;
}
function getAutoplayDelay() {
  return Number(autoSpeedSelect.value);
}
function stopAutoplay(options = {}) {
  if (autoplayId !== null) {
    window.clearInterval(autoplayId);
  }
  autoplayId = null;
  if (options.message) {
    setMessage(options.message);
  }
  if (options.renderView ?? true) {
    render();
  }
}
function resetGame(nextDiskCount = diskCount) {
  stopAutoplay({ renderView: false });
  diskCount = nextDiskCount;
  pegs = createInitialPegs(diskCount);
  selectedPeg = null;
  draggedPeg = null;
  moveHistory = [];
  operationLog = [];
  won = false;
  clearHint();
  resetTimer();
  setMessage("左の塔から右の塔へすべて移動します。");
  render();
}
function applyMove(from, to, options = {}) {
  const moved = moveDisk(pegs, from, to);
  if (!moved) {
    setMessage("その移動はできません。");
    render();
    return false;
  }
  pegs = moved.pegs;
  if (options.record ?? true) {
    moveHistory.push(moved.move);
    startTimer();
    recordOperation(options.action ?? "move", moved.move);
  }
  selectedPeg = null;
  clearHint();
  won = isSolved(pegs, diskCount);
  if (won) {
    stopTimer();
    setMessage(`${moveHistory.length}手で完成しました。`);
  }
  else {
    setMessage(`${describeMove(moved.move)} に移動しました。`);
  }
  render();
  return true;
}
function selectPeg(peg) {
  if (pegs[peg].length === 0) {
    selectedPeg = null;
    setMessage("ディスクのある塔を選んでください。");
  }
  else {
    selectedPeg = peg;
    setMessage(`${pegNames[peg]} を選択中です。`);
  }
  render();
}
function handlePegAction(peg) {
  if (won || isAutoplaying()) {
    return;
  }
  if (selectedPeg === null) {
    selectPeg(peg);
    return;
  }
  if (selectedPeg === peg) {
    selectedPeg = null;
    setMessage("選択を解除しました。");
    render();
    return;
  }
  if (canMove(pegs, selectedPeg, peg)) {
    applyMove(selectedPeg, peg);
    return;
  }
  selectPeg(peg);
}
function undoMove() {
  if (isAutoplaying()) {
    return;
  }
  const lastMove = moveHistory.pop();
  if (!lastMove) {
    setMessage("戻せる手がありません。");
    return;
  }
  const moved = moveDisk(pegs, lastMove.to, lastMove.from);
  if (!moved) {
    moveHistory.push(lastMove);
    setMessage("手を戻せませんでした。");
    return;
  }
  pegs = moved.pegs;
  selectedPeg = null;
  won = false;
  clearHint();
  recordOperation("undo", moved.move);
  if (moveHistory.length === 0) {
    resetTimer();
  }
  else {
    startTimer();
  }
  setMessage(`${describeMove({ from: lastMove.to, to: lastMove.from, disk: lastMove.disk })} に戻しました。`);
  render();
}
function showHint() {
  if (isAutoplaying()) {
    return;
  }
  const hint = findHint(pegs, diskCount);
  if (!hint) {
    setMessage(won ? "完成しています。" : "ヒントを見つけられませんでした。");
    return;
  }
  setHint(hint);
  setMessage(`${pegNames[hint.from]} の一番上を ${pegNames[hint.to]} へ移動します。`);
  render();
}
function stepHint() {
  if (isAutoplaying()) {
    return;
  }
  const hint = currentHint ?? findHint(pegs, diskCount);
  if (!hint) {
    setMessage(won ? "完成しています。" : "進める手がありません。");
    return;
  }
  applyMove(hint.from, hint.to, { action: "step" });
}
function runAutoplayStep() {
  if (won) {
    stopAutoplay({ renderView: false });
    return;
  }
  const hint = findHint(pegs, diskCount);
  if (!hint) {
    stopAutoplay({ message: "進める手がありません。" });
    return;
  }
  applyMove(hint.from, hint.to, { action: "auto" });
  if (won) {
    stopAutoplay({ renderView: true });
  }
}
function startAutoplay() {
  if (won || isAutoplaying()) {
    return;
  }
  selectedPeg = null;
  draggedPeg = null;
  clearHint();
  setMessage("オートプレイ中です。");
  autoplayId = window.setInterval(runAutoplayStep, getAutoplayDelay());
  render();
  runAutoplayStep();
}
function toggleAutoplay() {
  if (isAutoplaying()) {
    stopAutoplay({ message: "オートプレイを停止しました。" });
    return;
  }
  startAutoplay();
}
function restartAutoplayTimer() {
  if (autoplayId === null) {
    return;
  }
  window.clearInterval(autoplayId);
  autoplayId = window.setInterval(runAutoplayStep, getAutoplayDelay());
}
function render() {
  const autoplaying = isAutoplaying();
  board.innerHTML = "";
  moveCount.textContent = String(moveHistory.length);
  minimumMoveCount.textContent = String(minimumMoves(diskCount));
  gameState.textContent = won ? "完成" : autoplaying ? "オートプレイ中" : selectedPeg === null ? "プレイ中" : `${pegNames[selectedPeg]} 選択中`;
  diskCountSelect.disabled = autoplaying;
  undoButton.disabled = autoplaying || moveHistory.length === 0;
  hintButton.disabled = autoplaying || won;
  stepButton.disabled = autoplaying || won;
  autoButton.disabled = won;
  autoButton.textContent = autoplaying ? "停止" : "オート再生";
  renderOperationLog();
  pegs.forEach((pegDisks, rawPegIndex) => {
    const pegIndex = asPegIndex(rawPegIndex);
    const pegElement = document.createElement("button");
    pegElement.type = "button";
    pegElement.className = "peg-zone";
    pegElement.dataset.peg = String(pegIndex);
    pegElement.setAttribute("aria-label", `${pegNames[pegIndex]} の塔`);
    pegElement.style.setProperty("--disk-count", String(diskCount));
    if (selectedPeg === pegIndex) {
      pegElement.classList.add("selected");
    }
    if (currentHint?.from === pegIndex) {
      pegElement.classList.add("hint-from");
    }
    if (currentHint?.to === pegIndex) {
      pegElement.classList.add("hint-to");
    }
    pegElement.addEventListener("click", () => handlePegAction(pegIndex));
    pegElement.addEventListener("dragover", (event) => {
      if (draggedPeg !== null && canMove(pegs, draggedPeg, pegIndex)) {
        event.preventDefault();
      }
    });
    pegElement.addEventListener("drop", (event) => {
      event.preventDefault();
      if (draggedPeg !== null) {
        applyMove(draggedPeg, pegIndex);
      }
      draggedPeg = null;
    });
    const stack = document.createElement("span");
    stack.className = "stack";
    stack.setAttribute("aria-hidden", "true");
    const pole = document.createElement("span");
    pole.className = "pole";
    stack.append(pole);
    const base = document.createElement("span");
    base.className = "base";
    stack.append(base);
    pegDisks.forEach((disk, level) => {
      const diskElement = document.createElement("span");
      const isTopDisk = level === pegDisks.length - 1;
      const width = 28 + (disk / diskCount) * 64;
      diskElement.className = "disk";
      diskElement.style.setProperty("--level", String(level));
      diskElement.style.setProperty("--disk-width", `${width}%`);
      diskElement.style.setProperty("--disk-bottom", `${30 + level * 30}px`);
      diskElement.style.setProperty("--disk-color", diskColors[(disk - 1) % diskColors.length]);
      diskElement.textContent = String(disk);
      diskElement.setAttribute("aria-label", `ディスク ${disk}`);
      diskElement.draggable = isTopDisk && !won && !autoplaying;
      if (isTopDisk) {
        diskElement.classList.add("top-disk");
      }
      if (selectedPeg === pegIndex && isTopDisk) {
        diskElement.classList.add("selected-disk");
      }
      diskElement.addEventListener("dragstart", (event) => {
        if (!isTopDisk || won || autoplaying) {
          event.preventDefault();
          return;
        }
        draggedPeg = pegIndex;
        event.dataTransfer?.setData("text/plain", String(pegIndex));
        event.dataTransfer?.setDragImage(diskElement, diskElement.clientWidth / 2, diskElement.clientHeight / 2);
      });
      diskElement.addEventListener("dragend", () => {
        draggedPeg = null;
      });
      stack.append(diskElement);
    });
    const label = document.createElement("span");
    label.className = "peg-label";
    label.textContent = pegNames[pegIndex];
    pegElement.append(stack, label);
    board.append(pegElement);
  });
}
diskCountSelect.addEventListener("change", () => {
  resetGame(Number(diskCountSelect.value));
});
resetButton.addEventListener("click", () => resetGame());
undoButton.addEventListener("click", undoMove);
hintButton.addEventListener("click", showHint);
stepButton.addEventListener("click", stepHint);
autoButton.addEventListener("click", toggleAutoplay);
autoSpeedSelect.addEventListener("change", restartAutoplayTimer);
logToggleButton.addEventListener("click", () => {
  const collapsed = logPanel.classList.toggle("collapsed");
  logToggleButton.setAttribute("aria-expanded", String(!collapsed));
});
exportLogButton.addEventListener("click", exportOperationLog);
resetGame();
