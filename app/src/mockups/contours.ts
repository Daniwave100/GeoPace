// Contour lines, traced the way a survey map's are: marching squares over a grid of heights.
//
// Used by the roadbook direction as the texture of its paper. The field it traces is invented
// (see `sampleTerrain`), and the page says so — but the tracing itself is real, so the same code
// can draw real terrain once a design is chosen.
import { sampleNoise } from "./sample-data";

export interface ContourSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * Line segments where `field` crosses `level`. `field[row][column]`; coordinates come back in
 * grid units, x across the columns and y down the rows.
 */
export function contourSegments(field: number[][], level: number): ContourSegment[] {
  const segments: ContourSegment[] = [];

  for (let row = 0; row + 1 < field.length; row += 1) {
    for (let column = 0; column + 1 < field[row].length; column += 1) {
      const topLeft = field[row][column];
      const topRight = field[row][column + 1];
      const bottomRight = field[row + 1][column + 1];
      const bottomLeft = field[row + 1][column];

      // Where the level falls along each edge of the cell, always measured from the same end so
      // neighbouring cells agree exactly on the point they share.
      const top = () => ({ x: column + between(topLeft, topRight, level), y: row });
      const bottom = () => ({ x: column + between(bottomLeft, bottomRight, level), y: row + 1 });
      const left = () => ({ x: column, y: row + between(topLeft, bottomLeft, level) });
      const right = () => ({ x: column + 1, y: row + between(topRight, bottomRight, level) });

      const corners =
        (topLeft >= level ? 8 : 0) | (topRight >= level ? 4 : 0) | (bottomRight >= level ? 2 : 0) | (bottomLeft >= level ? 1 : 0);
      const join = (from: { x: number; y: number }, to: { x: number; y: number }) => segments.push({ from, to });

      switch (corners) {
        case 1:
        case 14:
          join(left(), bottom());
          break;
        case 2:
        case 13:
          join(bottom(), right());
          break;
        case 3:
        case 12:
          join(left(), right());
          break;
        case 4:
        case 11:
          join(top(), right());
          break;
        case 6:
        case 9:
          join(top(), bottom());
          break;
        case 7:
        case 8:
          join(left(), top());
          break;
        case 5:
        case 10: {
          // A saddle: two opposite corners are high. The middle of the cell decides whether the
          // high ground connects through it or the low ground does.
          const middleHigh = (topLeft + topRight + bottomRight + bottomLeft) / 4 >= level;
          if ((corners === 5) === middleHigh) {
            join(left(), top());
            join(bottom(), right());
          } else {
            join(left(), bottom());
            join(top(), right());
          }
          break;
        }
        default:
          break;
      }
    }
  }
  return segments;
}

function between(a: number, b: number, level: number): number {
  return a === b ? 0.5 : (level - a) / (b - a);
}

/** Invented rolling ground, deterministic per seed. Texture only — never shown as a measurement. */
export function sampleTerrain(columns: number, rows: number, seed: number): number[][] {
  const field: number[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const line: number[] = [];
    for (let column = 0; column < columns; column += 1) {
      const broad = sampleNoise(seed, column / 9 + sampleNoise(seed + 1, row / 7) * 1.6) * sampleNoise(seed + 2, row / 8 + column / 31);
      const fine = sampleNoise(seed + 3, column / 3.1 + row / 4.3) * 0.18;
      line.push(broad + fine);
    }
    field.push(line);
  }
  return field;
}
