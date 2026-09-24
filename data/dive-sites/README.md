# Offline dive-site catalog

`src/lib/diveSites/data/offlineDiveSites.json` is bundled with the app. Matching never calls a network service.

## Add an approved source

1. Confirm that the source permits offline redistribution. Record its license, attribution text, original URL, retrieval date, and version in `source-manifest.json`.
2. Do not add PADI, WisconsinShipwrecks.org, Diveboard, Google Maps, or any other proprietary/user-generated directory without written redistribution permission. Treat OpenStreetMap separately: ODbL attribution and share-alike obligations must be reviewed before inclusion.
3. Put a local source file in `sources/`, then declare `normalized-json`, `geojson`, `csv`, `kml`, or `shapefile` in the manifest. CSV needs `name`, `sourceRecordId`, `latitude`, and `longitude` headers. KML needs Point coordinates plus ExtendedData for `sourceRecordId`. Shapefiles use local GDAL `ogr2ogr`; retain the original source file and conversion notes.
4. Every record needs a source record ID, a verified WGS84 latitude/longitude pair, primary name, site type, coordinate-quality value, and explicit match radius when the source supports one. Use 75–150 m for precise compact sites unless the source justifies otherwise; 650 m is only the fallback for broad/low-precision sites.
5. Run `npm run build:dive-sites`, inspect `build-report.json`, then run `npm run test:dive-log`.

The builder rejects missing names, source IDs, and invalid WGS84 coordinates. It merges only same/alias-normalized names that are within 150 m (and both match radii), preserving every source entry in `sources`; it does not silently replace provenance.

Current attribution: Contains GeoNames data, licensed under CC BY 4.0.
