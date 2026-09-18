// Where the sun is, for a place and an instant.
//
// This is the NOAA Solar Calculator's algorithm, the same equations the US National Oceanic and
// Atmospheric Administration publishes as a spreadsheet:
// https://gml.noaa.gov/grad/solcalc/calcdetails.html — accurate to well under a tenth of a degree
// for the years GeoPace cares about, and small enough to read.
//
// Angles follow the project convention: degrees, and compass bearings are clockwise from true
// north (90° = due east, 180° = due south), so a sun azimuth can be compared directly with the
// course line's bearing_deg.
//
// Altitude is *geometric* — no atmospheric refraction. That is what casts a shadow, and shadows
// are what the app draws; a refracted "apparent" sun would put them in slightly the wrong place
// at sunrise and sunset.

const DEG = Math.PI / 180;
const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_AS_JULIAN_DAY = 2_440_587.5;
const J2000 = 2_451_545;
const DAYS_PER_JULIAN_CENTURY = 36_525;

export interface SunPosition {
  /** Degrees above the horizon. Negative when the sun is below it — no shadows, no sun exposure. */
  altitudeDeg: number;
  /** Compass bearing of the sun, degrees clockwise from true north: 90 = east, 180 = south. */
  azimuthDeg: number;
}

/** Where the sun is over `lat`/`lon` at the instant `at`. */
export function sunPosition(at: Date, lat: number, lon: number): SunPosition {
  const century = julianCentury(at);
  const declinationDeg = sunDeclinationDeg(century);
  const hourAngleDeg = hourAngle(at, century, lon);

  const latRad = lat * DEG;
  const declRad = declinationDeg * DEG;
  const haRad = hourAngleDeg * DEG;

  const cosZenith = Math.sin(latRad) * Math.sin(declRad) + Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
  const zenithRad = Math.acos(clamp(cosZenith, -1, 1));

  return {
    altitudeDeg: 90 - zenithRad / DEG,
    azimuthDeg: azimuthDeg(latRad, declRad, zenithRad, hourAngleDeg),
  };
}

/**
 * How far the sun is from due south, in degrees of Earth rotation: negative before solar noon,
 * positive after, 15° per hour. This is where the clock, the calendar, and the longitude meet.
 */
function hourAngle(at: Date, century: number, lon: number): number {
  const minutesUtc = (at.getTime() % MS_PER_DAY) / 60_000;
  // Sundials and clocks disagree by up to ~16 minutes over the year (the equation of time), and
  // every degree of longitude east moves solar noon 4 minutes earlier.
  const solarMinutes = mod(minutesUtc + equationOfTimeMinutes(century) + 4 * lon, 1440);
  return solarMinutes / 4 - 180;
}

/** The sun's angle north (+) or south (−) of the equator: 0 at the equinoxes, ±23.44° at the solstices. */
function sunDeclinationDeg(century: number): number {
  const obliquity = obliquityCorrectedDeg(century) * DEG;
  return Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitudeDeg(century) * DEG)) / DEG;
}

/** Clock time minus sundial time, in minutes. */
function equationOfTimeMinutes(century: number): number {
  const meanLongRad = meanLongitudeDeg(century) * DEG;
  const meanAnomalyRad = meanAnomalyDeg(century) * DEG;
  const eccentricity = orbitEccentricity(century);
  const y = Math.tan((obliquityCorrectedDeg(century) * DEG) / 2) ** 2;

  return (
    4 *
    (y * Math.sin(2 * meanLongRad) -
      2 * eccentricity * Math.sin(meanAnomalyRad) +
      4 * eccentricity * y * Math.sin(meanAnomalyRad) * Math.cos(2 * meanLongRad) -
      0.5 * y * y * Math.sin(4 * meanLongRad) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomalyRad)) /
    DEG
  );
}

function azimuthDeg(latRad: number, declRad: number, zenithRad: number, hourAngleDeg: number): number {
  const sinZenith = Math.sin(zenithRad);
  // Straight overhead or straight below: every direction is the same direction.
  if (Math.abs(sinZenith) < 1e-12) return 180;
  const cosAzimuthFromSouth = clamp(
    (Math.sin(latRad) * Math.cos(zenithRad) - Math.sin(declRad)) / (Math.cos(latRad) * sinZenith),
    -1,
    1,
  );
  const fromSouth = Math.acos(cosAzimuthFromSouth) / DEG;
  // Morning (negative hour angle) puts the sun east of south, afternoon west of south.
  return hourAngleDeg > 0 ? mod(fromSouth + 180, 360) : mod(540 - fromSouth, 360);
}

function apparentLongitudeDeg(century: number): number {
  const trueLong = meanLongitudeDeg(century) + equationOfCentreDeg(century);
  return trueLong - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * century) * DEG);
}

function equationOfCentreDeg(century: number): number {
  const m = meanAnomalyDeg(century) * DEG;
  return (
    Math.sin(m) * (1.914602 - century * (0.004817 + 0.000014 * century)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * century) +
    Math.sin(3 * m) * 0.000289
  );
}

function obliquityCorrectedDeg(century: number): number {
  const mean = 23 + (26 + (21.448 - century * (46.815 + century * (0.00059 - century * 0.001813))) / 60) / 60;
  return mean + 0.00256 * Math.cos((125.04 - 1934.136 * century) * DEG);
}

function meanLongitudeDeg(century: number): number {
  return mod(280.46646 + century * (36000.76983 + century * 0.0003032), 360);
}

function meanAnomalyDeg(century: number): number {
  return 357.52911 + century * (35999.05029 - 0.0001537 * century);
}

function orbitEccentricity(century: number): number {
  return 0.016708634 - century * (0.000042037 + 0.0000001267 * century);
}

/** Centuries since noon on 2000-01-01 UTC, the epoch the series above are expanded around. */
function julianCentury(at: Date): number {
  return (at.getTime() / MS_PER_DAY + UNIX_EPOCH_AS_JULIAN_DAY - J2000) / DAYS_PER_JULIAN_CENTURY;
}

function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
