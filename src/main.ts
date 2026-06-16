import {
  Move,
  PegIndex,
  canMove,
  createInitialPegs,
  createRandomPegs,
  createRulelessRandomPegs,
  findHint,
  formatDuration,
  isSolved,
  moveDisk,
  pegNames,
  shortestMoveCount
} from "./game.js";

const diskColors = ["#f06449", "#f6ae2d", "#4d9078", "#277da1", "#6d597a", "#43aa8b", "#bc4749", "#355070"];

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Required DOM element is missing: ${selector}`);
  }

  return element;
}

const board = requiredElement<HTMLDivElement>("#board");
const diskCountSelect = requiredElement<HTMLSelectElement>("#diskCount");
const sourcePegSelect = requiredElement<HTMLSelectElement>("#sourcePeg");
const targetPegSelect = requiredElement<HTMLSelectElement>("#targetPeg");
const resetButton = requiredElement<HTMLButtonElement>("#resetButton");
const randomButton = requiredElement<HTMLButtonElement>("#randomButton");
const rulelessRandomButton = requiredElement<HTMLButtonElement>("#rulelessRandomButton");
const undoButton = requiredElement<HTMLButtonElement>("#undoButton");
const hintButton = requiredElement<HTMLButtonElement>("#hintButton");
const stepButton = requiredElement<HTMLButtonElement>("#stepButton");
const autoButton = requiredElement<HTMLButtonElement>("#autoButton");
const importLogButton = requiredElement<HTMLButtonElement>("#importLogButton");
const importLogInput = requiredElement<HTMLInputElement>("#importLogInput");
const autoSpeedSelect = requiredElement<HTMLSelectElement>("#autoSpeed");
const moveCount = requiredElement<HTMLElement>("#moveCount");
const minimumMoveCount = requiredElement<HTMLElement>("#minimumMoves");
const timer = requiredElement<HTMLElement>("#timer");
const message = requiredElement<HTMLElement>("#message");
const hintText = requiredElement<HTMLElement>("#hintText");
const gameState = requiredElement<HTMLElement>("#gameState");
const logPanel = requiredElement<HTMLElement>("#logPanel");
const logToggleButton = requiredElement<HTMLButtonElement>("#logToggleButton");
const logCount = requiredElement<HTMLElement>("#logCount");
const logList = requiredElement<HTMLOListElement>("#logList");
const logEmptyState = requiredElement<HTMLElement>("#logEmptyState");
const exportLogButton = requiredElement<HTMLButtonElement>("#exportLogButton");

type OperationLogAction = "move" | "step" | "auto" | "undo";

interface OperationLogEntry {
  sequence: number;
  timestamp: string;
  elapsedSeconds: string;
  action: OperationLogAction;
  disk: number;
  from: PegIndex;
  to: PegIndex;
  moveCount: number;
}

interface ImportedOperation {
  rowNumber: number;
  action: OperationLogAction;
  disk: number | null;
  from: PegIndex;
  to: PegIndex;
  timestamp: string | null;
  elapsedSeconds: string | null;
  moveCount: number | null;
}

const operationLabels: Record<OperationLogAction, string> = {
  move: "移動",
  step: "一手進める",
  auto: "オート再生",
  undo: "戻す"
};

const operationLabelLookup = new Map<string, OperationLogAction>([
  ["move", "move"],
  ["移動", "move"],
  ["step", "step"],
  ["一手進める", "step"],
  ["auto", "auto"],
  ["autoplay", "auto"],
  ["オート再生", "auto"],
  ["undo", "undo"],
  ["戻す", "undo"]
]);

let diskCount = Number(diskCountSelect.value);
let sourcePeg: PegIndex = 0;
let targetPeg: PegIndex = 2;
let pegs = createInitialPegs(diskCount, sourcePeg);
let selectedPeg: PegIndex | null = null;
let draggedPeg: PegIndex | null = null;
let moveHistory: Move[] = [];
let operationLog: OperationLogEntry[] = [];
let currentHint: Move | null = null;
let startedAt: number | null = null;
let elapsedBeforeStart = 0;
let timerId: number | null = null;
let autoplayId: number | null = null;
let replayId: number | null = null;
let replaySteps: ImportedOperation[] = [];
let replayCursor = 0;
let won = false;
const shortestMoveCache = new Map<string, number | null>();

function asPegIndex(value: number): PegIndex {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new Error(`Invalid peg index: ${value}`);
  }

  return value;
}

const pegIndexes: PegIndex[] = [0, 1, 2];

function selectedPegValue(select: HTMLSelectElement): PegIndex {
  return asPegIndex(Number(select.value));
}

function syncPegSelectors(): void {
  sourcePegSelect.value = String(sourcePeg);
  targetPegSelect.value = String(targetPeg);

  for (const option of sourcePegSelect.options) {
    option.disabled = Number(option.value) === targetPeg;
  }

  for (const option of targetPegSelect.options) {
    option.disabled = Number(option.value) === sourcePeg;
  }
}

function normalizePegSelectors(changed: "source" | "target"): void {
  sourcePeg = selectedPegValue(sourcePegSelect);
  targetPeg = selectedPegValue(targetPegSelect);

  if (sourcePeg === targetPeg) {
    const fallbackPeg = pegIndexes.find((peg) => peg !== sourcePeg);

    if (fallbackPeg === undefined) {
      throw new Error("No alternate peg is available");
    }

    if (changed === "source") {
      targetPeg = fallbackPeg;
    } else {
      sourcePeg = fallbackPeg;
    }
  }

  syncPegSelectors();
}

function goalMessage(): string {
  return `${pegNames[sourcePeg]} の塔から ${pegNames[targetPeg]} の塔へすべて移動します。`;
}

function shortestMoveCacheKey(): string {
  return `${diskCount}:${targetPeg}:${JSON.stringify(pegs)}`;
}

function getShortestMoveCount(): number | null {
  const key = shortestMoveCacheKey();
  const cached = shortestMoveCache.get(key);

  if (cached !== undefined || shortestMoveCache.has(key)) {
    return cached ?? null;
  }

  const count = shortestMoveCount(pegs, diskCount, targetPeg);
  shortestMoveCache.set(key, count);
  return count;
}

function formatShortestMoveText(count: number | null): string {
  return count === null ? "—" : String(count);
}

function shortestMoveMessage(count: number | null): string {
  return count === null ? "最短手数は計算上限を超えました。" : `最短 ${count} 手で完成できます。`;
}

function startTimer(): void {
  if (startedAt !== null) {
    return;
  }

  startedAt = Date.now();
  timerId = window.setInterval(updateTimer, 250);
}

function stopTimer(): void {
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

function resetTimer(): void {
  if (timerId !== null) {
    window.clearInterval(timerId);
  }

  startedAt = null;
  elapsedBeforeStart = 0;
  timerId = null;
  updateTimer();
}

function getElapsed(): number {
  return elapsedBeforeStart + (startedAt === null ? 0 : Date.now() - startedAt);
}

function updateTimer(): void {
  timer.textContent = formatDuration(getElapsed());
}

function setMessage(text: string): void {
  message.textContent = text;
}

function describeMove(move: Move): string {
  return `${pegNames[move.from]} -> ${pegNames[move.to]}`;
}

function formatElapsedSeconds(milliseconds: number): string {
  return (Math.round(milliseconds / 10) / 100).toFixed(2);
}

function csvEscape(value: string | number): string {
  const stringValue = String(value);
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const source = csv.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];

      if (char === "\r" && source[index + 1] === "\n") {
        index += 1;
      }
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new Error("CSVの引用符が閉じていません。");
  }

  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase();
}

function csvCell(row: string[], column: number | null): string {
  return column === null ? "" : (row[column] ?? "").trim();
}

function findCsvColumn(headers: string[], name: string): number | null {
  const index = headers.indexOf(name);
  return index === -1 ? null : index;
}

function parsePegCell(value: string, rowNumber: number, columnName: string): PegIndex {
  const normalized = value.trim().toUpperCase();
  const namedPeg = pegNames.findIndex((name) => name === normalized);

  if (namedPeg !== -1) {
    return asPegIndex(namedPeg);
  }

  const numericPeg = Number(normalized);
  if (Number.isInteger(numericPeg) && numericPeg >= 0 && numericPeg <= 2) {
    return asPegIndex(numericPeg);
  }

  throw new Error(`${rowNumber}行目の${columnName}列が不正です。A/B/C または 0/1/2 を指定してください。`);
}

function parseOptionalPositiveInteger(value: string, rowNumber: number, columnName: string): number | null {
  if (value === "") {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new Error(`${rowNumber}行目の${columnName}列が不正です。`);
  }

  return numberValue;
}

function parseOptionalNonNegativeInteger(value: string, rowNumber: number, columnName: string): number | null {
  if (value === "") {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new Error(`${rowNumber}行目の${columnName}列が不正です。`);
  }

  return numberValue;
}

function parseOperationAction(value: string): OperationLogAction {
  const normalized = value.trim().toLowerCase();
  return operationLabelLookup.get(normalized) ?? "move";
}

function parseOperationLogCsv(csv: string): ImportedOperation[] {
  const rows = parseCsvRows(csv);

  if (rows.length < 2) {
    throw new Error("CSVに再生できる操作がありません。");
  }

  const headers = rows[0].map(normalizeCsvHeader);
  const fromColumn = findCsvColumn(headers, "from");
  const toColumn = findCsvColumn(headers, "to");

  if (fromColumn === null || toColumn === null) {
    throw new Error("CSVに from/to 列がありません。");
  }

  const operationColumn = findCsvColumn(headers, "operation");
  const diskColumn = findCsvColumn(headers, "disk");
  const timestampColumn = findCsvColumn(headers, "timestamp");
  const elapsedSecondsColumn = findCsvColumn(headers, "timestamp_seconds");
  const moveCountColumn = findCsvColumn(headers, "move_count");

  const steps = rows.slice(1).map((row, index) => {
    const rowNumber = index + 2;
    return {
      rowNumber,
      action: parseOperationAction(csvCell(row, operationColumn)),
      disk: parseOptionalPositiveInteger(csvCell(row, diskColumn), rowNumber, "disk"),
      from: parsePegCell(csvCell(row, fromColumn), rowNumber, "from"),
      to: parsePegCell(csvCell(row, toColumn), rowNumber, "to"),
      timestamp: csvCell(row, timestampColumn) || null,
      elapsedSeconds: csvCell(row, elapsedSecondsColumn) || null,
      moveCount: parseOptionalNonNegativeInteger(csvCell(row, moveCountColumn), rowNumber, "move_count")
    };
  });

  if (steps.length === 0) {
    throw new Error("CSVに再生できる操作がありません。");
  }

  return steps;
}

function renderOperationLog(): void {
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

function recordOperation(action: OperationLogAction, move: Move): void {
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

function createLogCsv(): string {
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

function exportOperationLog(): void {
  const blob = new Blob([`\uFEFF${createLogCsv()}`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `tower-of-hanoi-log-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function clearHint(): void {
  currentHint = null;
  hintText.textContent = "";
}

function setHint(move: Move | null): void {
  currentHint = move;
  hintText.textContent = move ? `ヒント: ${describeMove(move)}` : "";
}

function isAutoplaying(): boolean {
  return autoplayId !== null;
}

function isReplaying(): boolean {
  return replayId !== null;
}

function isPlaybackLocked(): boolean {
  return isAutoplaying() || isReplaying();
}

function getAutoplayDelay(): number {
  return Number(autoSpeedSelect.value);
}

function stopAutoplay(options: { message?: string; renderView?: boolean } = {}): void {
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

function stopImportedReplay(options: { message?: string; renderView?: boolean } = {}): void {
  if (replayId !== null) {
    window.clearInterval(replayId);
  }

  replayId = null;
  replaySteps = [];
  replayCursor = 0;

  if (options.message) {
    setMessage(options.message);
  }

  if (options.renderView ?? true) {
    render();
  }
}

function resetGame(nextDiskCount = diskCount): void {
  stopAutoplay({ renderView: false });
  stopImportedReplay({ renderView: false });
  diskCount = nextDiskCount;
  diskCountSelect.value = String(diskCount);
  pegs = createInitialPegs(diskCount, sourcePeg);
  selectedPeg = null;
  draggedPeg = null;
  moveHistory = [];
  operationLog = [];
  won = false;
  clearHint();
  resetTimer();
  setMessage(goalMessage());
  render();
}

function randomizeGame(): void {
  if (isPlaybackLocked()) {
    return;
  }

  pegs = createRandomPegs(diskCount, targetPeg);
  selectedPeg = null;
  draggedPeg = null;
  moveHistory = [];
  operationLog = [];
  won = false;
  clearHint();
  resetTimer();
  setMessage(`ランダムな盤面に変更しました。${shortestMoveMessage(getShortestMoveCount())}`);
  render();
}

function randomizeRulelessGame(): void {
  if (isPlaybackLocked()) {
    return;
  }

  pegs = createRulelessRandomPegs(diskCount, targetPeg);
  selectedPeg = null;
  draggedPeg = null;
  moveHistory = [];
  operationLog = [];
  won = false;
  clearHint();
  resetTimer();
  setMessage(`ルール無視の盤面に変更しました。移動ルールは通常通りです。${shortestMoveMessage(getShortestMoveCount())}`);
  render();
}

function appendImportedOperation(step: ImportedOperation, move: Move): void {
  operationLog.push({
    sequence: operationLog.length + 1,
    timestamp: step.timestamp ?? formatDuration(getElapsed()),
    elapsedSeconds: step.elapsedSeconds ?? formatElapsedSeconds(getElapsed()),
    action: step.action,
    disk: move.disk,
    from: move.from,
    to: move.to,
    moveCount: step.moveCount ?? moveHistory.length
  });
}

function applyImportedStep(step: ImportedOperation): boolean {
  const moved = moveDisk(pegs, step.from, step.to);

  if (!moved) {
    setMessage(`${step.rowNumber}行目の移動はできません。`);
    return false;
  }

  if (step.disk !== null && moved.move.disk !== step.disk) {
    setMessage(`${step.rowNumber}行目のディスク番号が盤面と一致しません。`);
    return false;
  }

  if (step.action === "undo") {
    const lastMove = moveHistory.at(-1);
    const matchesLastMove =
      lastMove?.from === moved.move.to && lastMove.to === moved.move.from && lastMove.disk === moved.move.disk;

    if (!matchesLastMove) {
      setMessage(`${step.rowNumber}行目の戻す操作が履歴と一致しません。`);
      return false;
    }

    moveHistory.pop();
  } else {
    moveHistory.push(moved.move);
  }

  pegs = moved.pegs;
  appendImportedOperation(step, moved.move);
  selectedPeg = null;
  draggedPeg = null;
  clearHint();
  won = isSolved(pegs, diskCount, targetPeg);
  setMessage(`${step.rowNumber}行目: ${describeMove(moved.move)} を再生しました。`);
  return true;
}

function finishImportedReplay(): void {
  const replayedCount = operationLog.length;
  if (replayId !== null) {
    window.clearInterval(replayId);
  }
  replayId = null;
  replaySteps = [];
  replayCursor = 0;

  if (won) {
    stopTimer();
    setMessage(`CSVの再生が完了しました。${moveHistory.length}手で完成しています。`);
  } else {
    setMessage(`CSVの再生が完了しました。${replayedCount}件の操作を再生しました。`);
  }

  render();
}

function runImportedReplayStep(): void {
  const step = replaySteps[replayCursor];

  if (!step) {
    finishImportedReplay();
    return;
  }

  if (!applyImportedStep(step)) {
    stopImportedReplay({ renderView: false });
    stopTimer();
    render();
    return;
  }

  replayCursor += 1;
  render();

  if (replayCursor >= replaySteps.length) {
    finishImportedReplay();
  }
}

function startImportedReplay(steps: ImportedOperation[]): void {
  const maxDiskInLog = steps.reduce((maxDisk, step) => Math.max(maxDisk, step.disk ?? 0), 0);
  const nextDiskCount = Math.max(diskCount, maxDiskInLog);

  if (nextDiskCount > 8) {
    throw new Error("CSVのディスク番号が8を超えています。");
  }

  resetGame(nextDiskCount);
  replaySteps = steps;
  replayCursor = 0;
  replayId = window.setInterval(runImportedReplayStep, getAutoplayDelay());
  startTimer();
  setMessage(`CSVから${steps.length}件の操作を読み込みました。`);
  render();
  runImportedReplayStep();
}

function applyMove(
  from: PegIndex,
  to: PegIndex,
  options: { record?: boolean; action?: OperationLogAction } = {}
): boolean {
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
  won = isSolved(pegs, diskCount, targetPeg);

  if (won) {
    stopTimer();
    setMessage(`${moveHistory.length}手で完成しました。`);
  } else {
    setMessage(`${describeMove(moved.move)} に移動しました。`);
  }

  render();
  return true;
}

function selectPeg(peg: PegIndex): void {
  if (pegs[peg].length === 0) {
    selectedPeg = null;
    setMessage("ディスクのある塔を選んでください。");
  } else {
    selectedPeg = peg;
    setMessage(`${pegNames[peg]} を選択中です。`);
  }

  render();
}

function handlePegAction(peg: PegIndex): void {
  if (won || isPlaybackLocked()) {
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

function undoMove(): void {
  if (isPlaybackLocked()) {
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
  } else {
    startTimer();
  }

  setMessage(`${describeMove({ from: lastMove.to, to: lastMove.from, disk: lastMove.disk })} に戻しました。`);
  render();
}

function showHint(): void {
  if (isPlaybackLocked()) {
    return;
  }

  const hint = findHint(pegs, diskCount, targetPeg);

  if (!hint) {
    setMessage(won ? "完成しています。" : "ヒントを見つけられませんでした。");
    return;
  }

  setHint(hint);
  setMessage(`${pegNames[hint.from]} の一番上を ${pegNames[hint.to]} へ移動します。`);
  render();
}

function stepHint(): void {
  if (isPlaybackLocked()) {
    return;
  }

  const hint = currentHint ?? findHint(pegs, diskCount, targetPeg);

  if (!hint) {
    setMessage(won ? "完成しています。" : "進める手がありません。");
    return;
  }

  applyMove(hint.from, hint.to, { action: "step" });
}

function runAutoplayStep(): void {
  if (won) {
    stopAutoplay({ renderView: false });
    return;
  }

  const hint = findHint(pegs, diskCount, targetPeg);

  if (!hint) {
    stopAutoplay({ message: "進める手がありません。" });
    return;
  }

  applyMove(hint.from, hint.to, { action: "auto" });

  if (won) {
    stopAutoplay({ renderView: true });
  }
}

function startAutoplay(): void {
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

function toggleAutoplay(): void {
  if (isAutoplaying()) {
    stopAutoplay({ message: "オートプレイを停止しました。" });
    return;
  }

  startAutoplay();
}

function restartAutoplayTimer(): void {
  if (autoplayId !== null) {
    window.clearInterval(autoplayId);
    autoplayId = window.setInterval(runAutoplayStep, getAutoplayDelay());
  }

  if (replayId !== null) {
    window.clearInterval(replayId);
    replayId = window.setInterval(runImportedReplayStep, getAutoplayDelay());
  }
}

async function importOperationLog(file: File): Promise<void> {
  try {
    const csv = await file.text();
    const steps = parseOperationLogCsv(csv);
    startImportedReplay(steps);
  } catch (error) {
    stopImportedReplay({ renderView: false });
    setMessage(error instanceof Error ? error.message : "CSVの読み込みに失敗しました。");
    render();
  } finally {
    importLogInput.value = "";
  }
}

function render(): void {
  const autoplaying = isAutoplaying();
  const replaying = isReplaying();
  const playbackLocked = autoplaying || replaying;
  syncPegSelectors();
  board.innerHTML = "";
  moveCount.textContent = String(moveHistory.length);
  minimumMoveCount.textContent = formatShortestMoveText(getShortestMoveCount());
  gameState.textContent = won
    ? "完成"
    : replaying
      ? "ログ再生中"
      : autoplaying
        ? "オートプレイ中"
        : selectedPeg === null
          ? "プレイ中"
          : `${pegNames[selectedPeg]} 選択中`;
  diskCountSelect.disabled = playbackLocked;
  sourcePegSelect.disabled = playbackLocked;
  targetPegSelect.disabled = playbackLocked;
  randomButton.disabled = playbackLocked;
  rulelessRandomButton.disabled = playbackLocked;
  undoButton.disabled = playbackLocked || moveHistory.length === 0;
  hintButton.disabled = playbackLocked || won;
  stepButton.disabled = playbackLocked || won;
  autoButton.disabled = won || replaying;
  importLogButton.disabled = playbackLocked;
  importLogInput.disabled = playbackLocked;
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

    if (sourcePeg === pegIndex) {
      pegElement.classList.add("source-peg");
    }

    if (targetPeg === pegIndex) {
      pegElement.classList.add("target-peg");
    }

    pegElement.addEventListener("click", () => handlePegAction(pegIndex));
    pegElement.addEventListener("dragover", (event) => {
      if (!playbackLocked && draggedPeg !== null && canMove(pegs, draggedPeg, pegIndex)) {
        event.preventDefault();
      }
    });
    pegElement.addEventListener("drop", (event) => {
      event.preventDefault();

      if (!playbackLocked && draggedPeg !== null) {
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
      diskElement.draggable = isTopDisk && !won && !playbackLocked;

      if (isTopDisk) {
        diskElement.classList.add("top-disk");
      }

      if (selectedPeg === pegIndex && isTopDisk) {
        diskElement.classList.add("selected-disk");
      }

      diskElement.addEventListener("dragstart", (event) => {
        if (!isTopDisk || won || playbackLocked) {
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
    const pegRoles = [
      ...(sourcePeg === pegIndex ? ["開始"] : []),
      ...(targetPeg === pegIndex ? ["ゴール"] : [])
    ];
    label.textContent = pegRoles.length > 0 ? `${pegNames[pegIndex]} (${pegRoles.join(" / ")})` : pegNames[pegIndex];

    pegElement.append(stack, label);
    board.append(pegElement);
  });
}

diskCountSelect.addEventListener("change", () => {
  resetGame(Number(diskCountSelect.value));
});

sourcePegSelect.addEventListener("change", () => {
  normalizePegSelectors("source");
  resetGame();
});

targetPegSelect.addEventListener("change", () => {
  normalizePegSelectors("target");
  resetGame();
});

resetButton.addEventListener("click", () => resetGame());
randomButton.addEventListener("click", randomizeGame);
rulelessRandomButton.addEventListener("click", randomizeRulelessGame);
undoButton.addEventListener("click", undoMove);
hintButton.addEventListener("click", showHint);
stepButton.addEventListener("click", stepHint);
autoButton.addEventListener("click", toggleAutoplay);
autoSpeedSelect.addEventListener("change", restartAutoplayTimer);
importLogButton.addEventListener("click", () => importLogInput.click());
importLogInput.addEventListener("change", () => {
  const file = importLogInput.files?.[0];

  if (file) {
    void importOperationLog(file);
  }
});
logToggleButton.addEventListener("click", () => {
  const collapsed = logPanel.classList.toggle("collapsed");
  logToggleButton.setAttribute("aria-expanded", String(!collapsed));
});
exportLogButton.addEventListener("click", exportOperationLog);

resetGame();
