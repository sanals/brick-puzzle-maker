# Implementation Plan: Wizard Flow for Image Upload & Editing

## Goal Description
The current UI allows the user to change the baseplate dimensions (width and length) after uploading an image. This causes a mismatch between the processed image data (which was scaled to the old dimensions) and the new baseplate size, resulting in empty spaces or cropped images. Additionally, any manual color corrections or brick edits would conflict with dimension changes.

To resolve this, we will separate the puzzle creation process into a two-step wizard flow.

## Proposed Changes

### 1. State Management Updates
We will introduce a `setupStep` state to track the current phase of the puzzle maker.

#### [MODIFY] `src/store/usePuzzleStore.ts`
- Add `setupStep: 1 | 2` to the store (default `1`).
- Add `setSetupStep: (step: 1 | 2) => void`.
- When moving from Step 2 back to Step 1, we will clear `voxelMatrix` and `customBricks` to fully reset the canvas to a blank state, ensuring no corrupted state remains from dimension mismatches.

### 2. UI Refactoring (Sidebar)
The sidebar will dynamically render different tools based on the current `setupStep`.

#### [MODIFY] `src/components/SidebarControls.tsx`
**Step 1: Dimensions & Image Generation**
- Show `Dimensions` (Width / Length sliders).
- Show `Printer Tolerances` and `Settings`.
- Show `Upload Image` and `Processing Mode` selectors.
- Add a prominent "Next: Edit Puzzle" button at the bottom of the sidebar.

**Step 2: Editing & Coloring**
- Hide the `Dimensions` and `Upload Image` sections.
- Show the `Paint Palette` (dynamically generated from the image or default).
- Show the `Edit Tools` (Paint Stud, Paint Brick, Cut/Join, Area Edit).
- Add a "Back to Setup" button at the top of the sidebar.
- Add a confirmation dialog/prompt when clicking "Back to Setup", warning the user that going back will reset all custom edits and colors.

## Open Questions
- Do you want a browser `confirm()` popup to warn the user before they go back to Step 1, or should it just immediately reset? (I'll implement a `confirm()` by default to prevent accidental data loss).

## Verification Plan
1. Start in Step 1. Adjust dimensions. The baseplate resizes.
2. Upload an image. The image is processed to the current dimensions.
3. Click "Next: Edit Puzzle". The UI transitions to Step 2.
4. Verify that dimensions can no longer be changed.
5. Make some color edits and cuts.
6. Click "Back to Setup", confirm the reset. Verify that the edits are cleared and the user can change dimensions again.
