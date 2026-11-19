// Export the editable baseline and downloads for Atlas Studio.
const fs = require('node:fs');
const path = require('node:path');
const app = path.resolve(__dirname, '..');
process.chdir(app);
const index = process.argv.indexOf('--output-dir');
if(index < 0 || !process.argv[index+1]) throw new Error('Use --output-dir <website checkout>');
const web = path.resolve(process.argv[index+1]);
const { loadSourceModule } = require(path.join(app, 'scripts/lib/load-source-module.cjs'));
const root = path.join(app, 'src');
const load = name => loadSourceModule(path.join(root, 'features/oceanAtlas', name), root);
const catalog = load('catalog.js');
const profiles = require(path.join(root, 'features/oceanAtlas/data/siteProfiles.json'));
const images = require(path.join(root, 'features/oceanAtlas/data/siteImages.json'));
const listed = require(path.join(root, 'features/oceanAtlas/data/curatedSites.json'));
const refs = load('siteProfiles.js');
const sites = catalog.catalogSites().map(s => {
  const p = refs.siteProfile(profiles, s.id, s.latitude, s.longitude) || {};
  const curated = listed.find(c=>c.id===s.id);
  const image = images.images[s.id];
  return { id:s.id,name:s.name,aliases:s.aliases||[],latitude:s.latitude,longitude:s.longitude,region:s.region||'',country:s.country||'',environment:s.environment||'',siteType:curated?.siteType||'',topologies:s.topologies||[],entry:p.entry||s.entry||'',level:p.level||'',current:p.current||'',depth:p.depth||[null,s.maxDepthMeters||null],vis:p.vis||[null,null],waterTempC:p.waterTempC||[null,null],tempNote:p.tempNote||'',depthNote:p.depthNote||'',summary:p.summary||'',access:p.access||'',mooring:p.mooring||'',penetration:p.penetration||'',highlights:p.highlights||[],hazards:p.hazards||[],note:curated?.note||s.note||'',sources:(p.sources?.length?p.sources:(curated?.sources||s.sources||[]).map(r=>({name:r.sourceName,url:r.sourceUrl}))).filter(r=>r.name&&/^https:\/\//.test(r.url||'')).map(r=>({name:r.name,url:r.url})),photo:image?{url:image[0],attribution:image[1],license:image[2],page:image[3]}:{url:'',attribution:'',license:'',page:''},archived:false };
});
fs.writeFileSync(path.join(web,'assets/data/atlas-studio-catalog.json'),JSON.stringify({schemaVersion:1,sites})+'\n');
const dir=path.join(web,'assets/vendor/leaflet');fs.mkdirSync(dir,{recursive:true});
const leaflet=load('data/leaflet.js');fs.writeFileSync(path.join(dir,'leaflet.js'),leaflet.leafletJs);fs.writeFileSync(path.join(dir,'leaflet.css'),leaflet.leafletCss);
const {buildAtlasRelease}=require(path.join(app,'scripts/build-atlas-release.cjs'));
const manifest=buildAtlasRelease(web);
console.log(`Exported ${sites.length} editable sites and baseline release ${manifest.version.slice(0,12)}.`);
