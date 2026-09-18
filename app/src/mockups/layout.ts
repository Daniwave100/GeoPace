// Putting things at the right place on a page. Shared by all three directions: they disagree
// about what a kilometre should look like, not about where it goes.

export interface Scale {
  (value: number): number;
  /** The inverse: from a position on the page back to a value. */
  invert(position: number): number;
}

/** A straight-line mapping from `domain` onto `range`. Either may run backwards. */
export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = ((value: number) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0))) as Scale;
  scale.invert = (position) => (r1 === r0 ? d0 : d0 + ((position - r0) / (r1 - r0)) * span);
  return scale;
}

export interface LabelSlot {
  /** Where the label wants its centre — the pixel its kilometre falls on. */
  at: number;
  /** How much room it takes along the axis, in the same units. */
  size: number;
}

/**
 * Landmarks bunch up (NYC has three in the last 1.5 km), and labels printed on top of each other
 * are unreadable. This nudges crowded labels apart by the smallest amount that clears them:
 * neighbours that collide are treated as one block, and the block is centred on where its
 * members wanted to be. Labels with room stay exactly on their kilometre.
 *
 * Returns the new centres, in the order the labels were given.
 */
export function spreadLabels(labels: LabelSlot[], bounds: { min: number; max: number }, gap: number): number[] {
  const order = labels.map((_, index) => index).sort((a, b) => labels[a].at - labels[b].at);

  interface Block {
    members: number[];
    length: number;
    start: number;
  }

  const settle = (block: Block): void => {
    // The start that leaves the members, on average, where they asked to be.
    let offset = 0;
    let wanted = 0;
    for (const member of block.members) {
      wanted += labels[member].at - (offset + labels[member].size / 2);
      offset += labels[member].size + gap;
    }
    block.length = offset - gap;
    const ideal = wanted / block.members.length;
    block.start = Math.max(bounds.min, Math.min(ideal, bounds.max - block.length));
  };

  const blocks: Block[] = [];
  for (const index of order) {
    const block: Block = { members: [index], length: 0, start: 0 };
    settle(block);
    blocks.push(block);
    // Merging can push a block back into the one before it, so keep going until it can't.
    while (blocks.length > 1) {
      const last = blocks[blocks.length - 1];
      const previous = blocks[blocks.length - 2];
      if (previous.start + previous.length + gap <= last.start + 1e-9) break;
      previous.members.push(...last.members);
      settle(previous);
      blocks.pop();
    }
  }

  const centres = new Array<number>(labels.length);
  for (const block of blocks) {
    let cursor = block.start;
    for (const member of block.members) {
      centres[member] = cursor + labels[member].size / 2;
      cursor += labels[member].size + gap;
    }
  }
  return centres;
}
