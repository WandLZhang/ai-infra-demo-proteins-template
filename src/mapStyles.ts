// Google Maps light palette: Grey 200 land, white roads, Google Blue 100 water. White cards and dark
// chips both stand out on it.
export const HUD_MAP_STYLES: any[] = [
  { "elementType": "geometry", "stylers": [{ "color": "#e8eaed" }] },
  { "elementType": "labels", "stylers": [{ "visibility": "off" }] },
  { "featureType": "administrative.country", "elementType": "geometry", "stylers": [{ "weight": 0.5 }] },
  { "featureType": "administrative.country", "elementType": "geometry.stroke", "stylers": [{ "color": "#9aa0a6" }] },
  { "featureType": "administrative.land_parcel", "elementType": "geometry.stroke", "stylers": [{ "color": "#dadce0" }] },
  { "featureType": "poi", "stylers": [{ "visibility": "off" }] },
  { "featureType": "landscape", "elementType": "geometry", "stylers": [{ "color": "#e8eaed" }] },
  { "featureType": "landscape.man_made", "elementType": "geometry.stroke", "stylers": [{ "color": "#dadce0" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
  { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#dadce0" }, { "weight": 0.5 }] },
  { "featureType": "road", "elementType": "labels", "stylers": [{ "visibility": "off" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
  { "featureType": "road.highway", "elementType": "geometry.stroke", "stylers": [{ "color": "#dadce0" }] },
  { "featureType": "road.highway.controlled_access", "elementType": "geometry", "stylers": [{ "color": "#f8f9fa" }] },
  { "featureType": "transit", "stylers": [{ "visibility": "off" }] },
  { "featureType": "water", "elementType": "geometry.fill", "stylers": [{ "color": "#c6dafc" }] },
  { "featureType": "water", "elementType": "labels", "stylers": [{ "visibility": "off" }] }
];
