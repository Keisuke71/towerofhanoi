import assert from "node:assert/strict";
import test from "node:test";
import {
  canMove,
  createInitialPegs,
  findHint,
  isSolved,
  minimumMoves,
  moveDisk,
  serializePegs
} from "../dist/game.js";

test("creates a valid initial tower", () => {
  const pegs = createInitialPegs(4);

  assert.deepEqual(pegs, [[4, 3, 2, 1], [], []]);
  assert.equal(minimumMoves(4), 15);
  assert.equal(serializePegs(pegs, 4), "0000");
});

test("allows only smaller disks onto larger disks", () => {
  let pegs = createInitialPegs(3);
  const firstMove = moveDisk(pegs, 0, 1);

  assert.ok(firstMove);
  pegs = firstMove.pegs;
  assert.equal(canMove(pegs, 0, 1), false);
  assert.equal(canMove(pegs, 1, 2), true);
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
