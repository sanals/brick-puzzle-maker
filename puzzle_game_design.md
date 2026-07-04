# Klemmbrick Puzzle Game: Design & Architecture Plan

## Core Concept
Transform the current sandbox editor into a strategic puzzle game. The player is presented with a fragmented baseplate covered in separate, smaller Lego-style bricks. The ultimate goal is to merge all the scattered pieces back together to form a single, unbroken solid plane (or a specific target shape). 

Because pieces can only be merged if they form a perfect rectangle, the player must carefully plan the order of their merges. If they merge pieces in the wrong order, they might create L-shapes or staggered patterns that can no longer be joined into a rectangle, resulting in a fail state.

## Game Mechanics
1. **Level Generation**:
   - Start with a solid NxM baseplate covered by a single NxM brick.
   - Run a "fracture algorithm" that randomly slices the brick into smaller standard and non-standard rectangles (e.g., 1x1, 1x2, 2x3).
   - Randomize the colors of the pieces to make the visual fragmentation obvious.
2. **Merge Rules**:
   - Players can only merge two adjacent pieces if they share an edge of the exact same length (meaning their combination forms a perfect rectangle).
   - If two pieces are merged, the new piece inherits the color of the piece the player's mouse was favoring (using the new directional arrow UI).
3. **Win Condition**:
   - The puzzle is solved when the entire board consists of exactly one single brick.
4. **Lose Condition / Deadlocks**:
   - The game detects if the remaining pieces can no longer be merged into a rectangle (a deadlock). 
   - Example: An L-shaped void is impossible to fill with a single rectangular merge.
   - The player is notified of a deadlock and must use an "Undo" feature to reverse their mistakes.

## Technical Implementation Plan

### 1. Game State Management
- Add a new `gameMode` toggle to the `usePuzzleStore` (`sandbox` vs `puzzle`).
- Track a `moveCount` and an `undoStack` specific to the puzzle session.
- Add a `checkDeadlock()` algorithm that runs after every move to determine if the current layout is solvable.

### 2. Level Generator
- Create a `LevelGenerator.ts` utility.
- It will start with a single `[ {x: 0, z: 0, width: W, length: L} ]`.
- Loop N times: pick a random brick from the array, pick a random axis (X or Z) and a random valid offset, and slice it into two bricks. 
- Assign random colors from the `MaterialProfile` palette to each resulting piece.

### 3. UI Enhancements
- **Game Toolbar**: Add a top bar showing "Moves", "Undo" button, and a "Restart Level" button.
- **Victory Screen**: A satisfying animation (e.g., the final brick turns gold, particle effects) when the puzzle is solved.
- **Deadlock Warning**: A visual indicator (red flashing border or text) when the board enters an unsolvable state, prompting the user to undo.
- **Join Arrows**: The hover preview now shows a directional arrow pointing towards the "dominant" brick, inheriting its color, so the player has control over the final aesthetic of the board as they solve it.

## Future Expansions
- **Target Shapes**: Instead of merging everything into one giant rectangle, the level gives you a "silhouette" (like a cross or a star). You have to cut and merge pieces until they perfectly match the silhouette.
- **Move Limits**: Complete the puzzle in under X moves for 3 stars.
- **Color Matching**: A puzzle variant where you must not only merge into a single shape, but the final shape must all be a specific target color (forcing you to absorb pieces carefully using the directional arrow).
