import assert from "node:assert/strict";
import test from "node:test";
import {
  canMove,
  createInitialPegs,
  createRandomPegs,
  createRulelessRandomPegs,
  findHint,
  hasLegalPegOrder,
  isSolved,
  minimumMoves,
  moveDisk,
  serializePegs,
  shortestMoveCount
} from "../dist/game.js";

test("creates a valid initial tower", () => {
  const pegs = createInitialPegs(4);

  assert.deepEqual(pegs, [[4, 3, 2, 1], [], []]);
  assert.equal(minimumMoves(4), 15);
  assert.equal(serializePegs(pegs, 4), "0000");
});

test("creates a valid initial tower on a selected source peg", () => {
  const pegs = createInitialPegs(4, 1);

  assert.deepEqual(pegs, [[], [4, 3, 2, 1], []]);
  assert.equal(serializePegs(pegs, 4), "1111");
});

test("allows only smaller disks onto larger disks", () => {
  let pegs = createInitialPegs(3);
  const firstMove = moveDisk(pegs, 0, 1);

  assert.ok(firstMove);
  pegs = firstMove.pegs;
  assert.equal(canMove(pegs, 0, 1), false);
  assert.equal(canMove(pegs, 1, 2), true);
});

test("creates a legal random board", () => {
  const values = [0, 0.45, 0.85];
  const pegs = createRandomPegs(3, 2, () => values.shift() ?? 0);

  assert.deepEqual(pegs, [[3], [2], [1]]);
  assert.equal(serializePegs(pegs, 3), "210");
});

test("random board avoids an already solved target", () => {
  const pegs = createRandomPegs(3, 2, () => 0.9);

  assert.deepEqual(pegs, [[1], [], [3, 2]]);
  assert.equal(isSolved(pegs, 3, 2), false);
  assert.equal(shortestMoveCount(pegs, 3, 2), 1);
});

test("creates a ruleless random board with an illegal stack order", () => {
  const pegs = createRulelessRandomPegs(3, 2, () => 0.9);

  assert.equal(hasLegalPegOrder(pegs), false);
  assert.equal(pegs.flat().sort((a, b) => a - b).join(","), "1,2,3");
});

test("calculates shortest moves from an illegal stack without changing move rules", () => {
  const pegs = [[1, 2], [], []];
  const hint = findHint(pegs, 2, 2);

  assert.equal(hasLegalPegOrder(pegs), false);
  assert.equal(shortestMoveCount(pegs, 2, 2), 2);
  assert.deepEqual(hint, { from: 0, to: 2, disk: 2 });
  assert.equal(canMove([[1], [], [2]], 0, 2), true);
  assert.equal(canMove([[], [1], [2]], 2, 1), false);
});

test("calculates the remaining shortest move count", () => {
  const pegs = createInitialPegs(3);
  const firstMove = moveDisk(pegs, 0, 2);

  assert.ok(firstMove);
  assert.equal(shortestMoveCount(pegs, 3), minimumMoves(3));
  assert.equal(shortestMoveCount(firstMove.pegs, 3), minimumMoves(3) - 1);
  assert.equal(shortestMoveCount(createInitialPegs(3, 1), 3, 0), minimumMoves(3));
});

test("hint completes a three disk game in the minimum number of moves", () => {
  let pegs = createInitialPegs(3);
  let moves = 0;

  while (!isSolved(pegs, 3)) {
    const hint = findHint(pegs, 3);
    assert.ok(hint);
    const moved = moveDisk(pegs, hint.from, hint.to);
    assert.ok(moved);
    pegs = moved.pegs;
    moves += 1;
  }

  assert.equal(moves, minimumMoves(3));
  assert.deepEqual(pegs, [[], [], [3, 2, 1]]);
});

test("hint completes a selected source and target game in the minimum number of moves", () => {
  let pegs = createInitialPegs(3, 1);
  let moves = 0;

  while (!isSolved(pegs, 3, 0)) {
    const hint = findHint(pegs, 3, 0);
    assert.ok(hint);
    const moved = moveDisk(pegs, hint.from, hint.to);
    assert.ok(moved);
    pegs = moved.pegs;
    moves += 1;
  }

  assert.equal(moves, minimumMoves(3));
  assert.deepEqual(pegs, [[3, 2, 1], [], []]);
});
