export type GeoCoord = {
  lat: number;
  lng: number;
};

export type LocationReader = {
  getCurrent: (playerId: string) => Promise<GeoCoord | null>;
};
