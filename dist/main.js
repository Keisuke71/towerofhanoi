import {
  canMove,
  createInitialPegs,
  findHint,
  formatDuration,
  isSolved,
  minimumMoves,
  moveDisk,
  pegNames
} from "./game.js";

const diskColors = ["#f06449", "#f6ae2d", "#4d9078", "#277da1", "#6d597a", "#43aa8b", "#bc4749", "#355070"];
const board = document.querySelector("#board");
const diskCountSelect = document.querySelector("#diskCount");
const resetButton = document.querySelector("#resetButton");
const undoButton = document.querySelector("#undoButton");
const hintButton = document.querySelector("#hintButton");
const stepButton = document.querySelector("#stepButton");
const moveCount = document.querySelector("#moveCount");
const minimumMoveCount = document.querySelector("#minimumMoves");
const timer = document.querySelector("#timer");
const message = document.querySelector("#message");
const hintText = document.querySelector("#hintText");
const gameState = document.querySelector("#gameState");

if (
  !board ||
  !diskCountSelect ||
  !resetButton ||
  !undoButton ||
  !hintButton ||
  !stepButton ||
  !moveCount ||
  !minimumMoveCount ||
  !timer ||
  !message ||
  !hintText ||
  !gameState
) {
  throw new Error("Required DOM elements are missing");
}

let diskCount = Number(diskCountSelect.value);
let pegs = createInitialPegs(diskCount);
let selectedPeg = null;
let draggedPeg = null;
let moveHistory = [];
let currentHint = null;
let startedAt = null;
let elapsedBeforeStart = 0;
let timerId = null;
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
function clearHint() {
  currentHint = null;
  hintText.textContent = "";
}
function setHint(move) {
  currentHint = move;
  hintText.textContent = move ? `ヒント: ${describeMove(move)}` : "";
}
function resetGame(nextDiskCount = diskCount) {
  diskCount = nextDiskCount;
  pegs = createInitialPegs(diskCount);
  selectedPeg = null;
  draggedPeg = null;
  moveHistory = [];
  won = false;
  clearHint();
  resetTimer();
  setMessage("左の塔から右の塔へすべて移動します。");
  render();
}
function applyMove(from, to, options = { record: true }) {
  const moved = moveDisk(pegs, from, to);
  if (!moved) {
    setMessage("その移動はできません。");
    render();
    return false;
  }
  pegs = moved.pegs;
  if (options.record) {
    moveHistory.push(moved.move);
    startTimer();
  }
  selectedPeg = null;
  clearHint();
  won = isSolved(pegs, diskCount);
  if (won) {
    stopTimer();
    setMessage(`${moveHistory.length}手で完成しました。`);
  } else {
    setMessage(`${describeMove(moved.move)} に移動しました。`);
  }
  render();
  return true;
}
function selectPeg(peg) {
  if (pegs[peg].length === 0) {
    selectedPeg = null;
    setMessage("ディスクのある塔を選んでください。");
  } else {
    selectedPeg = peg;
    setMessage(`${pegNames[peg]} を選択中です。`);
  }
  render();
}
function handlePegAction(peg) {
  if (won) {
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
  if (moveHistory.length === 0) {
    resetTimer();
  } else {
    startTimer();
  }
  setMessage(`${describeMove({ from: lastMove.to, to: lastMove.from, disk: lastMove.disk })} に戻しました。`);
  render();
}
function showHint() {
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
  const hint = currentHint ?? findHint(pegs, diskCount);
  if (!hint) {
    setMessage(won ? "完成しています。" : "進める手がありません。");
    return;
  }
  applyMove(hint.from, hint.to);
}
function render() {
  board.innerHTML = "";
  moveCount.textContent = String(moveHistory.length);
  minimumMoveCount.textContent = String(minimumMoves(diskCount));
  gameState.textContent = won ? "完成" : selectedPeg === null ? "プレイ中" : `${pegNames[selectedPeg]} 選択中`;
  undoButton.disabled = moveHistory.length === 0;
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
      diskElement.draggable = isTopDisk && !won;
      if (isTopDisk) {
        diskElement.classList.add("top-disk");
      }
      if (selectedPeg === pegIndex && isTopDisk) {
        diskElement.classList.add("selected-disk");
      }
      diskElement.addEventListener("dragstart", (event) => {
        if (!isTopDisk || won) {
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
resetGame();
