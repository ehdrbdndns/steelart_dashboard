interface KakaoAddress {
  address_name?: string;
}

interface KakaoAddressSearchResult {
  address_name?: string;
  address?: KakaoAddress;
  road_address?: KakaoAddress;
  x: string;
  y: string;
}

interface KakaoGeocoderOptions {
  page?: number;
  size?: number;
  analyze_type?: "similar" | "exact";
}

interface KakaoGeocoder {
  addressSearch(
    address: string,
    callback: (result: KakaoAddressSearchResult[], status: string) => void,
    options?: KakaoGeocoderOptions,
  ): void;
}

interface KakaoMapsServices {
  Geocoder: new () => KakaoGeocoder;
  Status: {
    OK: string;
    ZERO_RESULT: string;
    ERROR: string;
  };
}

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoMap {
  setCenter(latLng: KakaoLatLng): void;
}

interface KakaoMapOptions {
  center: KakaoLatLng;
  level?: number;
}

interface KakaoMarkerOptions {
  map?: KakaoMap;
  position: KakaoLatLng;
}

interface KakaoMarker {
  setMap(map: KakaoMap | null): void;
  setPosition(position: KakaoLatLng): void;
}

interface KakaoMaps {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (container: HTMLElement, options: KakaoMapOptions) => KakaoMap;
  Marker: new (options: KakaoMarkerOptions) => KakaoMarker;
  services: KakaoMapsServices;
}

interface KakaoGlobal {
  maps: KakaoMaps;
}

interface Window {
  kakao?: KakaoGlobal;
}
