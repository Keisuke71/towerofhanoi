export type PegIndex = 0 | 1 | 2;

export interface Move {
  from: PegIndex;
  to: PegIndex;
  disk: number;
}

export const pegNames = ["A", "B", "C"] as const;

const pegIndexes: PegIndex[] = [0, 1, 2];
const maxSearchStates = 500_000;

export function createInitialPegs(diskCount: number, source: PegIndex = 0): number[][] {
  if (!Number.isInteger(diskCount) || diskCount < 1) {
    throw new Error("diskCount must be a positive integer");
  }

  const pegs: number[][] = [[], [], []];
  pegs[source] = Array.from({ length: diskCount }, (_, index) => diskCount - index);
  return pegs;
}

export function createRandomPegs(diskCount: number, target: PegIndex = 2, random = Math.random): number[][] {
  if (!Number.isInteger(diskCount) || diskCount < 1) {
    throw new Error("diskCount must be a positive integer");
  }

  const pegs: number[][] = [[], [], []];

  for (let disk = diskCount; disk >= 1; disk -= 1) {
    const peg = Math.min(2, Math.max(0, Math.floor(random() * 3))) as PegIndex;
    pegs[peg].push(disk);
  }

  if (isSolved(pegs, diskCount, target)) {
    const alternatePeg = pegIndexes.find((peg) => peg !== target);

    if (alternatePeg === undefined) {
      throw new Error("No alternate peg is available");
    }

    pegs[target].pop();
    pegs[alternatePeg].push(1);
  }

  return pegs;
}

export function hasLegalPegOrder(pegs: number[][]): boolean {
  return pegs.every((peg) => peg.every((disk, index) => index === peg.length - 1 || disk > peg[index + 1]));
}

export function createRulelessRandomPegs(diskCount: number, target: PegIndex = 2, random = Math.random): number[][] {
  if (!Number.isInteger(diskCount) || diskCount < 1) {
    throw new Error("diskCount must be a positive integer");
  }

  const disks = Array.from({ length: diskCount }, (_, index) => index + 1);

  for (let index = disks.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [disks[index], disks[swapIndex]] = [disks[swapIndex], disks[index]];
  }

  const pegs: number[][] = [[], [], []];

  disks.forEach((disk) => {
    const peg = Math.min(2, Math.max(0, Math.floor(random() * 3))) as PegIndex;
    pegs[peg].push(disk);
  });

  if (diskCount > 1 && hasLegalPegOrder(pegs)) {
    const forcedPeg = pegIndexes.find((peg) => peg !== target);

    if (forcedPeg === undefined) {
      throw new Error("No alternate peg is available");
    }

    const remainingDisks = disks.filter((disk) => disk !== 1 && disk !== diskCount);
    pegs[0] = [];
    pegs[1] = [];
    pegs[2] = [];
    pegs[forcedPeg].push(1, diskCount);

    remainingDisks.forEach((disk) => {
      const peg = Math.min(2, Math.max(0, Math.floor(random() * 3))) as PegIndex;
      pegs[peg].push(disk);
    });
  }

  return pegs;
}

export function topDisk(pegs: number[][], peg: PegIndex): number | undefined {
  return pegs[peg].at(-1);
}

export function canMove(pegs: number[][], from: PegIndex, to: PegIndex): boolean {
  if (from === to) {
    return false;
  }

  const disk = topDisk(pegs, from);
  const target = topDisk(pegs, to);
  return disk !== undefined && (target === undefined || disk < target);
}

export function moveDisk(pegs: number[][], from: PegIndex, to: PegIndex): { pegs: number[][]; move: Move } | null {
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

export function isSolved(pegs: number[][], diskCount: number, target: PegIndex = 2): boolean {
  return pegs[target].length === diskCount && pegs[target].every((disk, index) => disk === diskCount - index);
}

export function minimumMoves(diskCount: number): number {
  return 2 ** diskCount - 1;
}

export function serializePegs(pegs: number[][], diskCount: number): string {
  const positions = Array.from({ length: diskCount }, () => -1);

  pegs.forEach((peg, pegIndex) => {
    peg.forEach((disk) => {
      positions[disk - 1] = pegIndex;
    });
  });

  return positions.join("");
}

export function deserializePegs(state: string): number[][] {
  const pegs: number[][] = [[], [], []];

  for (let disk = state.length; disk >= 1; disk -= 1) {
    const peg = Number(state[disk - 1]) as PegIndex;
    pegs[peg].push(disk);
  }

  return pegs;
}

export function serializeOrderedPegs(pegs: number[][]): string {
  return pegs.map((peg) => peg.join(",")).join("|");
}

export function deserializeOrderedPegs(state: string): number[][] {
  return state.split("|").map((peg) => (peg === "" ? [] : peg.split(",").map(Number)));
}

export function shortestMoveCount(pegs: number[][], diskCount: number, target: PegIndex = 2): number | null {
  if (isSolved(pegs, diskCount, target)) {
    return 0;
  }

  const start = serializeOrderedPegs(pegs);
  const goal = serializeOrderedPegs(createInitialPegs(diskCount, target));
  const queue = [start];
  const distances = new Map<string, number>([[start, 0]]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const state = queue[cursor];
    const statePegs = deserializeOrderedPegs(state);
    const distance = distances.get(state) ?? 0;

    for (const from of pegIndexes) {
      for (const to of pegIndexes) {
        const moved = moveDisk(statePegs, from, to);

        if (!moved) {
          continue;
        }

        const next = serializeOrderedPegs(moved.pegs);

        if (distances.has(next)) {
          continue;
        }

        const nextDistance = distance + 1;

        if (next === goal) {
          return nextDistance;
        }

        distances.set(next, nextDistance);
        queue.push(next);

        if (queue.length >= maxSearchStates) {
          return null;
        }
      }
    }
  }

  return null;
}

export function findHint(pegs: number[][], diskCount: number, target: PegIndex = 2): Move | null {
  if (isSolved(pegs, diskCount, target)) {
    return null;
  }

  const start = serializeOrderedPegs(pegs);
  const goal = serializeOrderedPegs(createInitialPegs(diskCount, target));
  const queue = [start];
  const firstMoves = new Map<string, Move | null>([[start, null]]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const state = queue[cursor];
    const statePegs = deserializeOrderedPegs(state);
    const firstMove = firstMoves.get(state) ?? null;

    for (const from of pegIndexes) {
      for (const to of pegIndexes) {
        const moved = moveDisk(statePegs, from, to);

        if (!moved) {
          continue;
        }

        const next = serializeOrderedPegs(moved.pegs);

        if (firstMoves.has(next)) {
          continue;
        }

        const nextFirstMove = firstMove ?? moved.move;

        if (next === goal) {
          return nextFirstMove;
        }

        firstMoves.set(next, nextFirstMove);
        queue.push(next);

        if (queue.length >= maxSearchStates) {
          return null;
        }
      }
    }
  }

  return null;
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
