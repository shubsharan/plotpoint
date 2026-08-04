export const fieldGame = Object.freeze({
  title: "The Vanishing Meridian",
  firstCheckpoint: Object.freeze({
    name: "North Marker",
    latitude: 37.76942,
    longitude: -122.48621,
    radiusMeters: 45,
    maximumAccuracyMeters: 30,
  }),
  puzzle: Object.freeze({
    prompt: "I have cities but no houses, forests but no trees, and water but no fish. What am I?",
    answer: "map",
  }),
  secondCheckpoint: Object.freeze({
    name: "South Marker",
    latitude: 37.76815,
    longitude: -122.48372,
    radiusMeters: 45,
    maximumAccuracyMeters: 30,
  }),
  maximumObservationAgeMs: 15_000,
});
