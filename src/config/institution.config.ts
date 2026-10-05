// GPS Summit build: the demo opens on the venue, the Ronald Reagan Building and International Trade
// Center in Washington, DC. Marker from OpenStreetMap/Nominatim way/66418949. The camera keeps
// Stanford's home framing: at zoom 12 the marker sits 262 px left of and 147 px above the camera
// center, which clears the centered terminal.
export const config = {
  institution: {
    shortName: 'GPS Summit',
    fullName: 'Google Public Sector Summit',
    pageTitle: 'GPS Summit HPC with Google',
    menuSubtitle: 'Google Public Sector Summit · TPU vs GPU',
  },
  home: {
    buildingName: 'RONALD REAGAN BUILDING',
    markerLatLng: { lat: 38.8942, lng: -77.0307 },
    cameraLatLng: { lat: 38.8550, lng: -76.9407 },
    loginNode: 'login',
    markerSubtitle: 'login · Slurm',
    controllerConsoleHref: 'https://console.cloud.google.com/compute/instancesDetail/zones/us-east5-a/instances/biowulf-controller?project=wz-nih-demo-controller',
    displayBucket: 'gs://gps-summit-research',
  },
  deploy: {
    firebaseSite: 'hpc-protein-summit-demo',
  },
}
