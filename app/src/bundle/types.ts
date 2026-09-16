// TypeScript view of a Course Bundle. The source of truth is schema/course-bundle.schema.json;
// keep these types in step with it (the loader validates every bundle against the schema).

export interface CourseBundle {
  schema_version: 1;
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
    landmarks: { name: string; km: number }[];
  };
  /** Measured data only. Subjective data never lives here. */
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
