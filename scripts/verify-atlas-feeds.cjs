const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const filename = path.join(__dirname, '../src/features/oceanAtlas/updates.js');
const {code} = babel.transformSync(fs.readFileSync(filename,'utf8'),{babelrc:false,configFile:false,filename,plugins:['@babel/plugin-transform-modules-commonjs']});
function load(development,env={}) {
  const exports={},bundled={version:'fixture'};let options;
  vm.runInNewContext(code,{exports,__DEV__:development,process:{env},require(name){
    if(name==='@react-native-async-storage/async-storage')return {};
    if(name==='expo-file-system')return {};
    if(name==='expo-crypto')return {};
    if(name==='./datasets')return {BUNDLED_ATLAS_DATA:bundled};
    if(name==='./updateContract')return {};
    if(name==='./updateEngine')return {createAtlasUpdater(o){options=o;return {};}};
    throw new Error(name);
  }},{filename});
  return {exports,options,bundled};
}
const dev=load(true);assert.equal(dev.exports.ATLAS_ORIGIN,'https://dmzscuba-com.pages.dev');assert.equal(dev.options.bundledData,null);
const production=load(false,{EXPO_PUBLIC_ATLAS_USE_BUNDLED:'1'});assert.equal(production.exports.ATLAS_ORIGIN,'https://www.dmzscuba.com');assert.equal(production.options.bundledData,null);
const local=load(true,{EXPO_PUBLIC_ATLAS_USE_BUNDLED:'1'});assert.equal(local.options.bundledData,local.bundled);
const explicit=load(true,{EXPO_PUBLIC_ATLAS_ORIGIN:'https://atlas.example/'});assert.equal(explicit.exports.ATLAS_ORIGIN,'https://atlas.example');assert.equal(explicit.options.bundledData,null);
assert.equal(local.exports.atlasStatusLabel({}),'Development Atlas · server data');
console.log('Atlas feed checks passed: separate dev/production origins, explicit feed override, and local-data opt-in.');
