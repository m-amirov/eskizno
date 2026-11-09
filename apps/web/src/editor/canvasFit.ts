/** Fits the artboard inside the actual drawable stage without stretching it. */
export function fitCanvasWidth(
  availableWidth: number,
  availableHeight: number,
  artboardWidth: number,
  artboardHeight: number,
): number | null {
  if (![availableWidth, availableHeight, artboardWidth, artboardHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }
  return Math.min(availableWidth, availableHeight * artboardWidth / artboardHeight);
}
