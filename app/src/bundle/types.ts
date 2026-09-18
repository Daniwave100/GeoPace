// TypeScript view of a Course Bundle. The source of truth is schema/course-bundle.schema.json;
// keep these types in step with it (the loader validates every bundle against the schema).

export interface CourseBundle {
  schema_version: 2;
  course_id: string;
  generated_at: string;
  pipeline_version: string;
  course: {
    name: string;
    city: string;
    /** IANA time zone, e.g. Europe/Berlin */
    timezone: string;
    certified_distance_m: number;
    start: { lat: number; lon: number };
    /** km on the same scale as course_line.km; source locates the landmark */
    landmarks: { name: string; km: number; source: string }[];
  };
  /** Sourced facts about each year's running of the course, oldest first. Never empty. */
  editions: Edition[];
  /** Measured data and values computed from it with published models. Subjective data never lives here. */
  measured: {
    course_line: CourseLine;
    elevation_summary: { gain_m: number; loss_m: number; min_m: number; max_m: number };
    difficulty_model: {
      name: string;
      description: string;
      source: string;
      valid_grade_min: number;
      valid_grade_max: number;
    };
  };
  sources: { id: string; title: string; url: string; licence: string; accessed: string; note?: string }[];
  attributions: { text: string; url: string }[];
}

/** Parallel columns: index i of every array describes the same course sample. */
export interface CourseLine {
  spacing_m: number;
  length_m: number;
  lat: number[];
  lon: number[];
  /** km from the start */
  km: number[];
  elevation_m: number[];
  /** rise over run, 0.05 = 5% uphill */
  grade: number[];
  /** energy cost relative to flat; null where the grade is outside the model's valid range */
  difficulty: (number | null)[];
  /** degrees clockwise from true north */
  bearing_deg: number[];
}

/** One year's running of a course: its date and its waves. Hand-maintained, every fact sourced. */
export interface Edition {
  /** The year. */
  edition: number;
  /** `day` is the local calendar date in the course's time zone, YYYY-MM-DD. `note` is for the runner. */
  date: { day: string; source: string; accessed: string; note?: string };
  /** Present when some details are copied from an earlier edition; always flagged to the runner. */
  carried_over?: { from_edition: number; reason: string };
  /** At least one wave has a start time. */
  waves: Wave[];
}

/** A group of runners with its own start time. */
export interface Wave {
  id: string;
  name: string;
  /** Wall clock in the course's time zone, HH:MM. null when the organizer hasn't published it. */
  start_local: string | null;
  /** The same moment as ISO-8601 with its UTC offset, worked out by the pipeline. */
  start: string | null;
  /** This wave's time is copied from the edition named in the edition's `carried_over`. */
  carried_over: boolean;
  /** For the runner. Always present when there is no start time, to say why. */
  note?: string;
  source: string;
  accessed: string;
}
