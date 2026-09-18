// Putting things at the right place on a page. Shared by all three directions: they disagree
// about what a kilometre should look like, not about where it goes.
import { localVector } from "../core/bearing";

export type Scale = (value: number) => number;

/** A straight-line mapping from `domain` onto `range`. Either may run backwards. */
export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (value) => (span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0));
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

/**
 * The height range a profile is drawn over: from just under the course's lowest point to its
 * highest. Not from sea level — Berlin moves 23 m all day, and drawn from zero it is a slab — so
 * every design prints both ends of the scale beside the profile.
 */
export function heightDomain(story: { elevation: { minM: number; maxM: number } }): [number, number] {
  const { minM, maxM } = story.elevation;
  return [minM - (maxM - minM) * 0.12, maxM];
}

/**
 * Stacks horizontal labels into lanes so none overprints its neighbour. Each label goes in the
 * first lane where it touches nothing already there; if every lane is taken, in the one where it
 * overlaps least. Returns a lane index per label, in the order given.
 */
export function assignLanes(labels: { start: number; end: number }[], laneCount: number, gap = 0): number[] {
  const placed: { start: number; end: number }[][] = Array.from({ length: laneCount }, () => []);
  const overlap = (lane: { start: number; end: number }[], label: { start: number; end: number }) =>
    lane.reduce((sum, other) => sum + Math.max(0, Math.min(other.end, label.end) + gap - Math.max(other.start, label.start)), 0);

  return labels.map((label) => {
    const overlaps = placed.map((lane) => overlap(lane, label));
    let lane = overlaps.findIndex((amount) => amount <= 0);
    if (lane < 0) lane = overlaps.indexOf(Math.min(...overlaps));
    placed[lane].push(label);
    return lane;
  });
}

/**
 * Which way a wind arrow points on the page: the direction the wind *travels*, as the runner
 * meets it. `angleDeg` is `windOnRunner().angleDeg` — where the wind comes FROM relative to the
 * runner, 0 dead ahead — and `runs` is the way the runner moves across the page in this design.
 *
 * A headwind therefore always points back at the runner: left on a strip read left to right, up
 * on a card read top to bottom. Sideways, the runner's right hand is towards the bottom of the
 * page when they run right, and towards the page's left when they run down it.
 */
export function windArrowOnPage(angleDeg: number, runs: "right" | "down"): { dx: number; dy: number } {
  // Travelling is the reverse of coming from.
  const travel = localVector(0, angleDeg + 180);
  return runs === "right" ? { dx: travel.ahead, dy: travel.right } : { dx: -travel.right, dy: travel.ahead };
}

export interface MeasuredRun<Bin> {
  measured: boolean;
  bins: Bin[];
}

/**
 * Splits a profile into consecutive stretches that are measured and stretches that are filled
 * in, so a design can draw the two differently. With `bridgeGaps`, an unmeasured stretch also
 * takes the one measured bin either side of it, so its dashed line joins up with the solid line
 * instead of leaving a hole; measured stretches are never widened.
 */
export function measuredRuns<Bin extends { elevationMeasured: boolean }>(bins: Bin[], options: { bridgeGaps?: boolean } = {}): MeasuredRun<Bin>[] {
  const runs: MeasuredRun<Bin>[] = [];
  let start = 0;
  for (let index = 1; index <= bins.length; index += 1) {
    if (index < bins.length && bins[index].elevationMeasured === bins[start].elevationMeasured) continue;
    const measured = bins[start].elevationMeasured;
    const reach = !measured && options.bridgeGaps ? 1 : 0;
    runs.push({ measured, bins: bins.slice(Math.max(0, start - reach), Math.min(bins.length, index + reach)) });
    start = index;
  }
  return runs;
}

/**
 * How far the effort chart has to reach either side of flat-ground effort (1.0) to fit the
 * course, ignoring stretches outside the difficulty model. Never zero, so a flat course still
 * has an axis.
 */
export function effortReach(bins: { difficulty: number | null }[]): number {
  return Math.max(0.08, ...bins.map((bin) => Math.abs((bin.difficulty ?? 1) - 1)));
}
