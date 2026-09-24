import { OFFLINE_DIVE_SITES } from '../../lib/diveSites/offlineCatalog';
import temperature from './data/temperature.json';
import land from './data/land.json';
import sites from './data/sites.json';
import curatedSites from './data/curatedSites.json';
import globalSites from './data/globalSites.json';
import osmSites from './data/osmSites.json';
import extraSites from './data/extraSites.json';
import publishedDepths from './data/publishedDepths.json';
import { leafletCss, leafletJs } from './data/leaflet';
import { atlasStyles } from './atlasStyles';
import { runtimeSource } from './data/runtimeSource';
import { vectorTilerJs } from './data/vectorTiler';
import { MONTHS, safeJson } from './model';
import { MARINE_REGIONS } from './regions';
import { OCEAN_REGIONS } from './oceanRegions';
import { DIVE_REGIONS, REMOTE_DIVE_AREAS } from './diveRegions';

export function buildAtlasDocument({ temperatureUnit = 'F', depthUnit = 'ft' } = {}) {
  const data = { months: MONTHS, regions: MARINE_REGIONS, oceanRegions: OCEAN_REGIONS, diveRegions: DIVE_REGIONS, remoteAreas: REMOTE_DIVE_AREAS, temperature, land,
    sites: [...OFFLINE_DIVE_SITES, ...sites, ...curatedSites], globalSites, osmSites, extraSites, publishedDepths, curatedSiteCount: curatedSites.length,
    unit: temperatureUnit === 'C' ? 'C' : 'F', depthUnit: depthUnit === 'm' ? 'm' : 'ft' };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https://tile.openstreetmap.org https://inaturalist-open-data.s3.amazonaws.com https://static.inaturalist.org https://upload.wikimedia.org https://thumb.wikimedia.org; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'"><style>${leafletCss}\n${atlasStyles}</style></head><body><main id="app"></main><script>${(leafletJs + '\n' + vectorTilerJs).replace(/<\/script/gi, '<\\/script')}</script><script>${runtimeSource.replace(/<\/script/gi, '<\\/script')}\natlasRuntime(${safeJson(data)}, {temperatureAt,regionAt,inBounds,oceanRegionAt,seasonStatus,expandTemperature});</script></body></html>`;
}
