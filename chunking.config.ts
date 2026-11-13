/**
 * Keep each Firebase SDK in its own lazily loaded chunk so no file
 * crosses the 500 kB budget and the popup never downloads Firestore or
 * Auth unless they are actually needed.
 */
export const firebaseChunkGroups = [
  { name: "fb-core", priority: 5, test: /node_modules[\\/](@firebase[\\/](app|util|component|logger)|idb|tslib)[\\/]/ },
  { name: "fb-regex", priority: 4, test: /node_modules[\\/]re2js[\\/]/ },
  { name: "fb-webchannel", priority: 3, test: /node_modules[\\/]@firebase[\\/]webchannel-wrapper[\\/]/ },
  { name: "fb-firestore", priority: 2, test: /node_modules[\\/]@firebase[\\/]firestore[\\/]/ },
  { name: "fb-auth", priority: 2, test: /node_modules[\\/]@firebase[\\/]auth[\\/]/ },
  { name: "fb-ai", priority: 2, test: /node_modules[\\/]@firebase[\\/]ai[\\/]/ },
];
