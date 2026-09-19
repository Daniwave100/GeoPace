// Labels on the map overprint each other when the whole course is in view (New York has 28
// hills). The more important label stays and the other waits until the runner zooms in.

export interface LabelBox {
  left: number;
  top: number;
  width: number;
  height: number;
  priority: number;
}

/** For each label, in the order given: whether it stays. Highest priority first, then whatever still fits. */
export function keepLabels(boxes: LabelBox[], gap = 4): boolean[] {
  const kept: LabelBox[] = [];
  const stays = new Array<boolean>(boxes.length).fill(false);
  const byPriority = boxes.map((_, index) => index).sort((a, b) => boxes[b].priority - boxes[a].priority);
  for (const index of byPriority) {
    const box = boxes[index];
    const collides = kept.some(
      (other) => box.left < other.left + other.width + gap && other.left < box.left + box.width + gap && box.top < other.top + other.height + gap && other.top < box.top + box.height + gap,
    );
    if (collides) continue;
    kept.push(box);
    stays[index] = true;
  }
  return stays;
}
