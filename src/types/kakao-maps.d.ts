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

interface KakaoMaps {
  load(callback: () => void): void;
  services: KakaoMapsServices;
}

interface KakaoGlobal {
  maps: KakaoMaps;
}

interface Window {
  kakao?: KakaoGlobal;
}
