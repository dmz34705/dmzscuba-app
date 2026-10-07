// Every Atlas consumer reads the same active snapshot. JSON updates contain data only;
// executable map code and editorial guides still ship with the app.
import bundled_airports from './data/airports.json';
import bundled_curatedSites from './data/curatedSites.json';
import bundled_diveOperators from './data/diveOperators.json';
import bundled_extraSites from './data/extraSites.json';
import bundled_freshwaterLife from './data/freshwaterLife.json';
import bundled_globalSites from './data/globalSites.json';
import bundled_inlandConditions from './data/inlandConditions.json';
import bundled_land from './data/land.json';
import bundled_marineLife from './data/marineLife.json';
import bundled_marineLifeObis from './data/marineLifeObis.json';
import bundled_osmSites from './data/osmSites.json';
import bundled_places from './data/places.json';
import bundled_publishedDepths from './data/publishedDepths.json';
import bundled_siteBathymetry from './data/siteBathymetry.json';
import bundled_siteFacts from './data/siteFacts.json';
import bundled_siteImages from './data/siteImages.json';
import bundled_siteLakeDepths from './data/siteLakeDepths.json';
import bundled_siteMerges from './data/siteMerges.json';
import bundled_siteProfiles from './data/siteProfiles.json';
import bundled_siteProtection from './data/siteProtection.json';
import bundled_siteSeafloor from './data/siteSeafloor.json';
import bundled_siteShore from './data/siteShore.json';
import bundled_sites from './data/sites.json';
import bundled_temperature from './data/temperature.json';
import bundled_visibility from './data/visibility.json';

export let airports = bundled_airports;
export let curatedSites = bundled_curatedSites;
export let diveOperators = bundled_diveOperators;
export let extraSites = bundled_extraSites;
export let freshwaterLife = bundled_freshwaterLife;
export let globalSites = bundled_globalSites;
export let inlandConditions = bundled_inlandConditions;
export let land = bundled_land;
export let marineLife = bundled_marineLife;
export let marineLifeObis = bundled_marineLifeObis;
export let osmSites = bundled_osmSites;
export let places = bundled_places;
export let publishedDepths = bundled_publishedDepths;
export let siteBathymetry = bundled_siteBathymetry;
export let siteFacts = bundled_siteFacts;
export let siteImages = bundled_siteImages;
export let siteLakeDepths = bundled_siteLakeDepths;
export let siteMerges = bundled_siteMerges;
export let siteProfiles = bundled_siteProfiles;
export let siteProtection = bundled_siteProtection;
export let siteSeafloor = bundled_siteSeafloor;
export let siteShore = bundled_siteShore;
export let sites = bundled_sites;
export let temperature = bundled_temperature;
export let visibility = bundled_visibility;

export const BUNDLED_ATLAS_DATA = { airports: bundled_airports, curatedSites: bundled_curatedSites, diveOperators: bundled_diveOperators, extraSites: bundled_extraSites, freshwaterLife: bundled_freshwaterLife, globalSites: bundled_globalSites, inlandConditions: bundled_inlandConditions, land: bundled_land, marineLife: bundled_marineLife, marineLifeObis: bundled_marineLifeObis, osmSites: bundled_osmSites, places: bundled_places, publishedDepths: bundled_publishedDepths, siteBathymetry: bundled_siteBathymetry, siteFacts: bundled_siteFacts, siteImages: bundled_siteImages, siteLakeDepths: bundled_siteLakeDepths, siteMerges: bundled_siteMerges, siteProfiles: bundled_siteProfiles, siteProtection: bundled_siteProtection, siteSeafloor: bundled_siteSeafloor, siteShore: bundled_siteShore, sites: bundled_sites, temperature: bundled_temperature, visibility: bundled_visibility };
const listeners = new Set();
let generation = 0;
export const atlasGeneration = () => generation;
export const onAtlasDataChange = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const atlasDatasets = () => ({ airports, curatedSites, diveOperators, extraSites, freshwaterLife, globalSites, inlandConditions, land, marineLife, marineLifeObis, osmSites, places, publishedDepths, siteBathymetry, siteFacts, siteImages, siteLakeDepths, siteMerges, siteProfiles, siteProtection, siteSeafloor, siteShore, sites, temperature, visibility });

// Called only after the entire downloaded snapshot passes validation.
export function activateAtlasDatasets(data) {
  ({ airports, curatedSites, diveOperators, extraSites, freshwaterLife, globalSites, inlandConditions, land, marineLife, marineLifeObis, osmSites, places, publishedDepths, siteBathymetry, siteFacts, siteImages, siteLakeDepths, siteMerges, siteProfiles, siteProtection, siteSeafloor, siteShore, sites, temperature, visibility } = data);
  generation += 1;
  for (const listener of listeners) listener();
}
