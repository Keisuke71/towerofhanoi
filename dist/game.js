export const pegNames = ["A", "B", "C"];
const pegIndexes = [0, 1, 2];
export function createInitialPegs(diskCount) {
  if (!Number.isInteger(diskCount) || diskCount < 1) {
    throw new Error("diskCount must be a positive integer");
  }
  return [Array.from({ length: diskCount }, (_, index) => diskCount - index), [], []];
}
export function topDisk(pegs, peg) {
  return pegs[peg].at(-1);
}
export function canMove(pegs, from, to) {
  if (from === to) {
    return false;
  }
  const disk = topDisk(pegs, from);
  const target = topDisk(pegs, to);
  return disk !== undefined && (target === undefined || disk < target);
}
export function moveDisk(pegs, from, to) {
  if (!canMove(pegs, from, to)) {
    return null;
  }
  const nextPegs = pegs.map((peg) => [...peg]);
  const disk = nextPegs[from].pop();
  if (disk === undefined) {
    return null;
  }
  nextPegs[to].push(disk);
  return { pegs: nextPegs, move: { from, to, disk } };
}
export function isSolved(pegs, diskCount, target = 2) {
  return pegs[target].length === diskCount && pegs[target].every((disk, index) => disk === diskCount - index);
}
export function minimumMoves(diskCount) {
  return 2 ** diskCount - 1;
}
export function serializePegs(pegs, diskCount) {
  const positions = Array.from({ length: diskCount }, () => -1);
  pegs.forEach((peg, pegIndex) => {
    peg.forEach((disk) => {
      positions[disk - 1] = pegIndex;
    });
  });
  return positions.join("");
}
export function deserializePegs(state) {
  const pegs = [[], [], []];
  for (let disk = state.length; disk >= 1; disk -= 1) {
    const peg = Number(state[disk - 1]);
    pegs[peg].push(disk);
  }
  return pegs;
}
export function findHint(pegs, diskCount, target = 2) {
  if (isSolved(pegs, diskCount, target)) {
    return null;
  }
  const start = serializePegs(pegs, diskCount);
  const goal = String(target).repeat(diskCount);
  const queue = [start];
  const firstMoves = new Map([[start, null]]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const state = queue[cursor];
    const statePegs = deserializePegs(state);
    const firstMove = firstMoves.get(state) ?? null;
    for (const from of pegIndexes) {
      for (const to of pegIndexes) {
        const moved = moveDisk(statePegs, from, to);
        if (!moved) {
          continue;
        }
        const next = serializePegs(moved.pegs, diskCount);
        if (firstMoves.has(next)) {
          continue;
        }
        const nextFirstMove = firstMove ?? moved.move;
        if (next === goal) {
          return nextFirstMove;
        }
        firstMoves.set(next, nextFirstMove);
        queue.push(next);
      }
    }
  }
  return null;
}
export function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
