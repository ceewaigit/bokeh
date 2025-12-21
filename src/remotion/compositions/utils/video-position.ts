/**
 * Shared utility for calculating video position with padding
 */

export function calculateVideoPosition(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
  padding: number
) {
  // Calculate the available area after padding
  const availableWidth = containerWidth - (padding * 2);
  const availableHeight = containerHeight - (padding * 2);

  // Calculate the scale to fit the video within the available area while maintaining aspect ratio
  const videoAspectRatio = videoWidth / videoHeight;
  const containerAspectRatio = availableWidth / availableHeight;

  let drawWidth: number;
  let drawHeight: number;

  if (videoAspectRatio > containerAspectRatio) {
    // Video is wider than container - fit by width
    drawWidth = availableWidth;
    drawHeight = availableWidth / videoAspectRatio;
  } else {
    // Video is taller than container - fit by height
    drawHeight = availableHeight;
    drawWidth = availableHeight * videoAspectRatio;
  }

  // Center the video within the available area
  const offsetX = padding + (availableWidth - drawWidth) / 2;
  const offsetY = padding + (availableHeight - drawHeight) / 2;

  return { drawWidth, drawHeight, offsetX, offsetY };
}