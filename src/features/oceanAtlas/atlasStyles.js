export const atlasStyles = `
:root{color-scheme:dark;--bg:#091b27;--panel:#0c202df7;--line:#badbea20;--text:#eef5f5;--muted:#9db6c0;--mint:#97e8cc;--cyan:#79dafa;--gold:#edca81}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-tap-highlight-color:transparent}button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}button{color:inherit;cursor:pointer;border:0;background:none}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--mint);outline-offset:3px}button:active{opacity:.72}button:disabled{opacity:.35;cursor:default}[hidden]{display:none!important}svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
#map{position:absolute;inset:0;background:#102c3b}.leaflet-container{font:inherit}.leaflet-tile-pane{filter:brightness(.68) invert(1) hue-rotate(165deg) saturate(.4)}.leaflet-control-attribution{display:none}.leaflet-land-pane,.leaflet-temperature-pane{pointer-events:none}.leaflet-tile{image-rendering:auto}.glass{background:var(--panel);border:1px solid var(--line);box-shadow:0 5px 22px #0003}
.top{position:absolute;z-index:600;top:14px;left:14px;right:14px;pointer-events:none}.top>*{pointer-events:auto}.brand{display:flex;align-items:center;gap:10px}.round{position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:15px;flex-shrink:0}.brand-copy{flex:1;text-shadow:0 2px 9px #061923}.eyebrow{font-size:8px;letter-spacing:2px;font-weight:750;color:var(--mint);text-transform:uppercase}.brand h1{font-size:21px;letter-spacing:-.6px;font-weight:600;margin:3px 0 0}.search{display:flex;align-items:center;gap:10px;border-radius:15px;padding:0 13px;height:49px;margin-top:12px}.search svg{color:var(--muted);width:19px}.search input{width:100%;min-width:0;border:0;outline:none;background:none;color:var(--text);font-size:16px}.search input::placeholder{color:var(--muted);font-size:13px}.search-clear{font-size:23px;min-width:36px;min-height:44px}.results{margin-top:7px;max-height:55vh;overflow:auto;border-radius:15px}.result{width:100%;padding:14px;text-align:left;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:center;min-height:56px}.result:last-child{border:0}.result strong{display:block;font-size:14px;font-weight:600}.result small{display:block;margin-top:4px;color:var(--muted);font-size:11px}.result svg{color:var(--mint)}.empty{padding:18px;color:var(--muted);font-size:13px;line-height:1.6}
.map-tools{position:absolute;right:14px;top:84px;z-index:500;display:grid;gap:8px}.map-tools .round{width:42px;height:42px}.round[aria-expanded=true]{border-color:#97e8cc80;color:var(--mint);background:#193b40}.count{position:absolute;right:-3px;top:-3px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:var(--mint);color:#12312c;font-size:9px;font-weight:800;display:grid;place-items:center}.zoom{display:grid;border-radius:14px;overflow:hidden;margin-top:4px}.zoom button{height:38px;width:42px;font-size:23px}.zoom button+button{border-top:1px solid var(--line)}.hint{position:absolute;z-index:450;bottom:97px;left:18px;right:18px;text-align:center;color:#c3d6dd;font-size:10px;line-height:1.4;letter-spacing:.3px;pointer-events:none;text-shadow:0 1px 7px #001019}.has-selection .hint,.panel-open .hint,.detail-expanded .map-tools{display:none}
.region-pin{width:32px;height:32px;border-radius:50%;background:#123f3d;border:1px solid #88e6bf;box-shadow:0 0 0 4px #92e7c414,0 3px 10px #0005;display:flex;align-items:center;justify-content:center;color:var(--mint)}.region-pin svg{width:18px;height:18px}.dive-region-pin{height:34px;display:flex;align-items:center;gap:7px;padding:0 10px 0 5px;border:1px solid #b7eadc66;background:linear-gradient(135deg,#0d3441f2,#102936f2);border-radius:13px;color:#e5f4f1;box-shadow:0 7px 20px #00131f99,0 0 0 3px #8de6ca0d;white-space:nowrap}.dive-region-pin i{width:23px;height:23px;border-radius:9px;background:#9be6ca;color:#12312e;display:flex;align-items:center;justify-content:center;font-size:9px;font-style:normal;font-weight:800}.dive-region-pin span{font-size:9px;letter-spacing:.25px;font-weight:650}.province-pin{height:30px;display:flex;align-items:center;gap:7px;color:#d6eef1;filter:drop-shadow(0 2px 5px #00141f)}.province-pin i{display:block;width:13px;height:13px;border:2px solid var(--mint);background:#0e3340cc;border-radius:50%;box-shadow:0 0 0 5px #97e8cc16;flex:none}.province-pin span{display:none;padding:5px 8px;border:1px solid #bde8df32;background:#0b2532d9;border-radius:8px;font-size:9px;letter-spacing:.3px;white-space:nowrap}.province-pin.labelled span{display:block}.site-label{position:absolute;left:17px;top:50%;transform:translateY(-50%);white-space:nowrap;font-size:10px;font-weight:600;letter-spacing:.1px;color:#e9f5f5;background:#0c2733d9;border:1px solid #79dafa40;border-radius:8px;padding:2px 7px;box-shadow:0 2px 6px #0005;pointer-events:auto}.site-label.left{left:auto;right:17px}.site-label.group{left:39px;display:flex;flex-direction:column;gap:1px;padding:3px 7px}.site-label.group.left{left:auto;right:39px}.site-label.group b{font-weight:600;line-height:14px;padding:0 1px;border-radius:4px}.site-label.group b+b{border-top:1px solid #79dafa22}.site-pin{width:15px;height:15px;background:var(--cyan);border:3px solid #0c2c40;border-radius:50%;box-shadow:0 0 0 1px #79dafa77,0 2px 6px #0005}.dive-pin{min-width:30px;height:30px;background:var(--gold);color:#272315;border:3px solid #443d2b;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;box-shadow:0 3px 10px #0005}.cluster{min-width:34px;height:34px;border-radius:50%;background:#163d52;color:var(--cyan);border:1px solid #79dafa88;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}.selected-dot{width:20px;height:20px;border-radius:50%;border:2px solid #fff;background:#fff3;box-shadow:0 0 0 6px #fff1}
.dock{position:absolute;z-index:650;bottom:28px;left:14px;right:14px;height:54px;border-radius:18px;display:flex;align-items:center;padding:4px}.dock button{min-height:44px;display:flex;align-items:center;justify-content:center;gap:9px;font-size:12px;flex:1;border-radius:12px}.dock button[aria-expanded=true]{background:#97e8cc15;color:var(--mint)}.dock svg{width:17px;height:17px;color:var(--mint)}.dock-divider{height:21px;width:1px;background:var(--line)}.chevron{color:var(--mint);font-size:16px}.dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--mint)}
.bottom{position:absolute;z-index:600;bottom:94px;left:14px;right:14px;pointer-events:none}.bottom>*{pointer-events:auto}.floating-panel{border-radius:22px;padding:18px;max-height:calc(100dvh - 180px);overflow:auto;overscroll-behavior:contain}.panel-heading{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.panel-heading h2{font-size:21px;font-weight:550;letter-spacing:-.5px;margin:5px 0}.panel-close{width:40px;height:40px;font-size:26px;color:var(--muted);margin:-6px -7px -6px 0;flex-shrink:0}.layers{display:grid}.layer{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border-bottom:1px solid var(--line);min-height:62px;padding:10px 0}.layer>svg{color:var(--muted);width:20px}.layer>span{flex:1;min-width:0}.layer strong{display:block;font-size:13px;font-weight:550}.layer small{display:block;font-size:10px;color:var(--muted);margin-top:5px}.layer[aria-pressed=true]>svg{color:var(--mint)}.layer[data-layer=temperature][aria-pressed=true]>svg,.layer[data-layer=dives][aria-pressed=true]>svg{color:var(--gold)}.switch{width:33px;height:20px;border-radius:12px;background:#344b58;position:relative;flex-shrink:0}.switch:after{content:'';position:absolute;top:3px;left:3px;width:14px;height:14px;background:#b6c7ce;border-radius:50%;transition:transform .15s}.layer[aria-pressed=true] .switch{background:#97e8cc}.layer[aria-pressed=true] .switch:after{background:#12322e;transform:translateX(13px)}.species-filter{display:flex;gap:10px;align-items:center;margin-top:15px;border-radius:11px;padding:0 10px;min-height:42px;font-size:12px;background:#ffffff04;box-shadow:none}.species-filter label{color:var(--muted);font-size:9px;letter-spacing:1px}.species-filter select{flex:1;min-width:0;color:var(--mint);background:transparent;border:0;padding:10px 0;font-size:12px}.species-filter option{background:var(--bg)}
.current-month{width:100%;min-height:40px;margin-top:13px;border:1px solid #8ce3c84a;border-radius:11px;color:var(--mint);font-size:10px;letter-spacing:.3px}.current-month.active{background:#8ce3c812;color:#d8eee7}.months{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:10px 0 17px}.month{min-width:0;height:44px;border:1px solid var(--line);border-radius:11px;color:var(--muted);font-size:12px}.month[aria-pressed=true]{background:var(--mint);color:#112d2a;font-weight:750;border-color:transparent}.legend{padding:15px 0 5px}.legend-top{display:flex;align-items:center;justify-content:space-between;font-size:9px;letter-spacing:.7px;color:var(--muted);margin-bottom:7px}.legend-top button{min-height:32px;min-width:44px;color:var(--text)}.gradient{height:4px;border-radius:4px;background:linear-gradient(90deg,#6676cf,#479ad1,#52c6ba,#d6d575,#f7ad65,#e36a65)}.legend-values{display:flex;justify-content:space-between;margin-top:6px;font-size:9px;color:var(--muted)}
.overview h2{font-size:22px;font-weight:500;letter-spacing:-.5px;margin:10px 0}.overview p{font-size:12px;line-height:1.65;color:var(--muted);margin:0}.destinations{display:grid;grid-template-columns:1fr 1fr;gap:7px}.destination{border:1px solid var(--line);border-radius:11px;padding:10px;font-size:11px;min-height:44px;color:#cee0e5;text-align:left}.destination:after{content:' ↗';color:var(--mint)}.destinations.compact .destination{min-height:38px;padding:8px}.overview .section-label{margin:16px 0 8px}.summary-line{display:flex;align-items:center;gap:8px;margin-top:15px;font-size:10px;color:var(--muted)}
.sheet{border-radius:21px;overflow:hidden;display:flex;flex-direction:column}.sheet-head{padding:16px 16px 14px;flex-shrink:0;position:relative}.sheet-head .eyebrow{font-size:8px;letter-spacing:1.3px;padding-right:28px}.sheet-head h2{font-weight:550;font-size:21px;letter-spacing:-.5px;margin:6px 36px 5px 0;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sheet-head .subtitle{color:var(--muted);font-size:11px;margin:0;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.close{position:absolute;right:7px;top:2px;width:36px;height:36px;font-size:25px;color:var(--muted)}.sheet-actions{display:flex;gap:8px;margin-top:12px}.sheet-actions button{flex:1;min-height:46px;border-radius:13px;font-size:13px;font-weight:650;letter-spacing:.1px;display:flex;align-items:center;justify-content:center}.sheet-actions button[hidden]{display:none}.action-guide{background:var(--mint);color:#062029}.action-trip{border:1px solid #97e8cc80;background:#97e8cc16;color:var(--mint)}.sheet-body{display:none;overflow:auto;padding:0 16px 18px;overscroll-behavior:contain}.detail-expanded .sheet{max-height:calc(100dvh - 180px)}.detail-expanded .sheet-body{display:block}.detail-expanded .sheet-head{border-bottom:1px solid var(--line);padding-bottom:15px}.detail-expanded .sheet-body{padding-top:8px}.region-summary{display:grid;grid-template-columns:auto 1fr auto 1fr;align-items:center;gap:7px;border:1px solid var(--line);border-radius:12px;padding:12px;margin:10px 0}.region-summary strong{font-size:22px;color:var(--gold);font-weight:450}.region-summary span{font-size:9px;line-height:1.35;color:var(--muted)}.area-list{border-top:1px solid var(--line)}.area-row{display:flex;width:100%;align-items:center;gap:12px;border-bottom:1px solid var(--line);padding:12px 2px;text-align:left}.area-row>span{flex:1}.area-row strong{display:block;font-size:12px;font-weight:600}.area-row small{display:block;margin-top:4px;color:var(--muted);font-size:10px;line-height:1.4}.area-row svg{width:15px;color:var(--mint)}.cluster-zoom{width:100%;min-height:46px;margin:10px 0 4px;padding:0 12px;border:1px solid #97e8cc50;border-radius:12px;background:#97e8cc10;color:var(--mint);display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:650}.cluster-zoom svg{width:16px}.confidence{font-size:10px;color:var(--muted);margin:10px 0 4px}.confidence.good{color:var(--mint)}.wear-card{display:block;width:100%;text-align:left;border:1px solid #97e8cc55;background:linear-gradient(135deg,#97e8cc14,#79dafa0a);border-radius:14px;padding:13px 14px;margin:0 0 6px;color:inherit}.wear-card strong{display:block;font-size:17px;font-weight:600;letter-spacing:-.2px}.wear-card span{display:block;color:var(--muted);font-size:11px;line-height:1.55;margin-top:4px}.wear-card .wear-why{color:#cfe3e6}.wear-card b{display:block;margin-top:10px;padding-top:10px;border-top:1px solid var(--line);color:var(--mint);font-size:12px;font-weight:650}.protected{border:1px solid #97e8cc40;background:#97e8cc0c;border-radius:12px;padding:10px 12px;margin:10px 0}.protected a{display:block;text-decoration:none;color:inherit;padding:3px 0}.protected small{display:block;font-size:7px;letter-spacing:.5px;text-transform:uppercase;color:var(--mint)}.protected strong{display:block;font-size:12px;font-weight:600;margin-top:2px}.protected strong::after{content:' ↗';color:var(--cyan);font-weight:400}.protected p{color:var(--muted);font-size:10px;line-height:1.55;margin:6px 0 0}.encyclopedia{color:#d7e4e7;font-size:12px;line-height:1.65;margin:0}.ship-events{display:flex;gap:6px;margin:0 0 4px}.ship-events span{flex:1;border-left:2px solid var(--gold);padding:4px 9px;background:#ffffff05}.ship-events small{display:block;font-size:7px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted)}.ship-events strong{display:block;font-size:14px;font-weight:450;color:var(--gold);margin-top:2px}.site-facts.ship strong{white-space:normal;line-height:1.35}.site-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:10px 0}.site-facts span{min-width:0;border:1px solid var(--line);border-radius:10px;padding:9px 8px}.site-facts small,.site-facts strong{display:block;overflow:hidden;text-overflow:ellipsis}.site-facts small{font-size:7px;line-height:1.35;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}.site-facts strong{margin-top:5px;font-size:10px;font-weight:600;white-space:nowrap}.site-facts strong::first-letter{text-transform:uppercase}.temp-stat{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:12px;padding:11px 13px;margin:10px 0}.temp-stat strong{font-size:26px;font-weight:400;letter-spacing:-1px;color:var(--gold)}.temp-stat span{font-size:10px;color:var(--muted);line-height:1.6}.climate-chart{height:72px;display:flex;align-items:end;gap:4px;padding:5px 4px 0;border-bottom:1px solid var(--line)}.climate-chart span{height:100%;flex:1;display:flex;flex-direction:column;justify-content:end;align-items:center;gap:5px}.climate-chart i{width:100%;max-width:14px;display:block;border-radius:4px 4px 1px 1px;background:linear-gradient(#e8c178,#499fc3);opacity:.55}.climate-chart .current i{opacity:1;box-shadow:0 0 0 1px #f4d79166}.climate-chart b{font-size:7px;font-weight:500;color:#698691}.climate-chart .current b{color:var(--gold)}.climate-range{display:flex;justify-content:space-between;margin:8px 2px 12px;color:var(--muted);font-size:8px;line-height:1.5}.climate-range span:last-child{text-align:right}.climate-range strong{color:#d9e5e7;font-size:10px;font-weight:550}.section-label{font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:var(--mint);margin:18px 0 11px}.region-story{color:#d7e4e7;font-size:12px;line-height:1.65}.region-fact{border-left:2px solid var(--gold);padding:9px 11px;margin:13px 0;background:#ffffff05;color:#dce9e9;font-size:11px;line-height:1.6}.chip-label{color:var(--muted);font-size:8px;letter-spacing:1px;text-transform:uppercase;margin:13px 0 7px}.chips{display:flex;flex-wrap:wrap;gap:6px}.chips span{border:1px solid #79dafa30;background:#79dafa0b;color:#bcdce6;border-radius:13px;padding:6px 9px;font-size:9px}.wildlife-chips span{border-color:#97e8cc35;background:#97e8cc0c;color:#bfe8d9}.animal{border-top:1px solid var(--line);padding:13px 0}.animal:first-of-type{border-top:0}.animal-top{display:flex;align-items:start;justify-content:space-between;gap:10px}.animal h3{font-size:15px;font-weight:600;margin:0}.scientific{font-size:10px;font-style:italic;color:var(--muted);margin:3px 0 8px}.status{font-size:9px;color:var(--muted);text-align:right;max-width:85px;line-height:1.4}.status.active{color:var(--mint)}.season-text{font-size:11px;color:#d1dddf;margin:8px 0}.calendar{display:flex;gap:3px;margin:10px 0}.calendar span{flex:1;text-align:center;padding:5px 0;font-size:9px;border-radius:4px;background:#ffffff05;color:#647f8a;border-bottom:2px solid transparent}.calendar .active{background:#97e8cc20;color:var(--mint)}.calendar .current{border-bottom-color:var(--gold)}.note{color:var(--muted);font-size:11px;line-height:1.65;margin:10px 0}.source{display:inline-flex;align-items:center;font-size:10px;color:var(--cyan);text-decoration:none;padding:5px 0;min-height:36px}.dive-row{display:flex;width:100%;align-items:center;gap:12px;border-top:1px solid var(--line);padding:14px 0;text-align:left}.dive-row .number{color:var(--gold);font-size:14px}.dive-row .copy{flex:1}.dive-row strong{font-size:13px;display:block}.dive-row small{font-size:11px;color:var(--muted);display:block;margin-top:5px}.dive-row svg{width:16px;color:var(--gold)}.sources p{font-size:12px;line-height:1.65;color:var(--muted)}.sources h3{font-size:14px;margin:18px 0 6px}.sources a{color:var(--cyan)}
.forecast{margin:8px 0 18px;border:1px solid #79dafa35;border-radius:16px;overflow:hidden;background:linear-gradient(145deg,#153747,#0d2836 62%,#102c38);box-shadow:inset 0 1px #ffffff08}.forecast-head{display:flex;align-items:center;gap:11px;padding:15px 14px 12px}.forecast-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:linear-gradient(145deg,#79dafa24,#97e8cc12);color:#b7f0ec;font-size:25px;font-weight:300}.forecast-head div{flex:1;min-width:0}.forecast-head small,.forecast-head strong{display:block}.forecast-head small{font-size:8px;color:var(--muted);letter-spacing:1px;text-transform:uppercase}.forecast-head strong{margin-top:4px;font-size:14px;font-weight:600}.forecast-head em{font-size:30px;font-style:normal;font-weight:350;color:var(--gold);letter-spacing:-1px}.forecast-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:0 12px;border:1px solid var(--line);border-radius:11px;background:#061b261f}.forecast-stats span{min-width:0;padding:9px}.forecast-stats span:nth-child(even){border-left:1px solid var(--line)}.forecast-stats span:nth-child(n+3){border-top:1px solid var(--line)}.forecast-stats small,.forecast-stats strong,.forecast-stats b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.forecast-stats small{font-size:7px;color:var(--muted);letter-spacing:.6px;text-transform:uppercase}.forecast-stats strong{margin-top:4px;font-size:11px;font-weight:650}.forecast-stats b{margin-top:3px;font-size:8px;font-weight:450;color:var(--muted)}.forecast-line{display:grid;grid-template-columns:repeat(4,1fr);padding:13px 10px 11px}.forecast-line span{text-align:center;border-right:1px solid var(--line)}.forecast-line span:last-child{border:0}.forecast-line small,.forecast-line b,.forecast-line strong{display:block}.forecast-line small{font-size:8px;color:var(--muted)}.forecast-line b{height:25px;margin-top:3px;color:#b8e9e4;font-size:19px;font-weight:350}.forecast-line strong{font-size:10px;font-weight:600}.forecast-foot{border-top:1px solid var(--line);padding:9px 12px 10px;background:#04172026}.forecast-foot span{display:block;font-size:8px;line-height:1.45;color:var(--muted)}.forecast-foot a{display:inline-block;margin:5px 8px 0 0;color:var(--cyan);font-size:8px;text-decoration:none}.forecast.loading,.forecast.unavailable{padding:14px;display:flex;align-items:center;gap:11px;background:#ffffff03;border-color:var(--line)}.forecast-loading{display:flex;align-items:center;gap:11px}.forecast-loading i{width:28px;height:28px;border:2px solid #79dafa24;border-top-color:var(--cyan);border-radius:50%;animation:forecast-spin .9s linear infinite}.forecast.loading strong,.forecast.loading small,.forecast.unavailable strong,.forecast.unavailable small{display:block}.forecast.loading strong,.forecast.unavailable strong{font-size:11px}.forecast.loading small,.forecast.unavailable small{margin-top:4px;color:var(--muted);font-size:9px;line-height:1.4}.forecast.unavailable .forecast-mark{width:32px;height:32px;font-size:18px;flex:none}@keyframes forecast-spin{to{transform:rotate(360deg)}}
.attribution{position:absolute;z-index:650;bottom:3px;left:7px;right:7px;text-align:center;font-size:8px;color:#b0c6d0;line-height:20px;text-shadow:0 1px 4px #00121c}.attribution a{color:inherit;text-decoration:none}.attribution button{padding:0;font-size:inherit}.toast{position:absolute;z-index:1000;top:73px;left:14px;right:70px;border-radius:12px;background:#183942;padding:11px 13px;font-size:11px;line-height:1.5;box-shadow:0 4px 15px #0004;pointer-events:none}
@media(min-width:700px){.top{width:350px;right:auto;top:22px;left:22px}.bottom{left:22px;right:auto;width:350px;bottom:98px}.dock{left:22px;right:auto;width:350px;bottom:30px}.map-tools{top:22px;right:22px}.hint{left:390px;right:80px;bottom:35px}.attribution{text-align:right;right:22px}.toast{top:22px;left:390px;right:85px;max-width:350px}.floating-panel,.detail-expanded .sheet{max-height:calc(100dvh - 185px)}}
@media(max-height:650px){.top{top:9px}.brand h1{font-size:19px}.map-tools{top:73px;gap:6px}.zoom{display:none}.floating-panel{padding:14px;max-height:calc(100dvh - 170px)}.layer{min-height:51px}.layer small{font-size:9px}.species-filter{margin-top:10px}.legend{padding-top:8px}.bottom{bottom:89px}.dock{bottom:25px;height:52px}.attribution{font-size:7px}.detail-expanded .sheet{max-height:calc(100dvh - 165px)}}
.crumbs{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}.crumbs button{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 10px;border:1px solid #97e8cc40;border-radius:16px;color:var(--mint);font-size:10px;font-weight:600}.crumbs svg{width:11px}
.season-chips{display:grid;gap:6px;margin-bottom:12px}.season-chip{display:block;width:100%;text-align:left;border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-height:44px}.season-chip.sourced{border-color:#97e8cc70;background:#97e8cc12}.season-chip strong{display:block;color:var(--mint);font-size:11px;letter-spacing:.4px}.season-chip span{display:block;margin-top:3px;color:#e3eeee;font-size:12px}.season-chip small{color:var(--muted);font-size:10px}
.season-row{margin:10px 0 2px}.season-row-head{display:flex;align-items:center;gap:8px}.season-row-head img,.season-row-head i{width:22px;height:22px;border-radius:11px;object-fit:cover;background:#183440;flex-shrink:0}.season-row-head strong{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.season-row-head small{margin-left:auto;color:var(--muted);font-size:10px;white-space:nowrap}.season-row .calendar{margin:6px 0 0}.calendar .soft{background:#97e8cc10;color:#8fc9b8}
.month-now{border:1px solid var(--line);border-radius:12px;padding:11px 13px;margin:12px 0}.month-now strong{font-size:12px;color:var(--gold)}.month-now p{margin:6px 0 0;color:#cfdcdf;font-size:11px;line-height:1.55}.month-now .source{min-height:0;padding:0;display:inline}
.gallery{display:flex;gap:9px;overflow-x:auto;padding:0 0 6px;margin:0 -16px;scroll-snap-type:x proximity;scroll-padding-inline:16px;-webkit-overflow-scrolling:touch}.gallery::before,.gallery::after{content:'';flex:0 0 7px}.gcard{flex:0 0 142px;scroll-snap-align:start;border:1px solid var(--line);border-radius:13px;overflow:hidden;text-decoration:none;color:inherit;background:#ffffff04;display:flex;flex-direction:column}.gcard img,.gcard .gphoto{width:100%;height:96px;flex-shrink:0;object-fit:cover;background:#183440;display:block}.gcard strong{font-size:12px;font-weight:600;margin:8px 9px 0;line-height:1.3}.gcard em{font-size:9px;color:var(--muted);margin:2px 9px 0}.gcard span{font-size:10px;color:var(--muted);margin:6px 9px 0}.gcard span.on{color:var(--mint);font-weight:600}.gcard .gsource{align-self:flex-start;margin:2px 5px 5px;padding:6px 4px;font-size:9px;font-weight:600;color:var(--cyan);text-decoration:none}.site-facts .fact-source{display:block;margin-top:4px;font-size:7px;font-style:normal;color:var(--cyan);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.site-facts em.fact-source{color:var(--muted)}.gcard small{font-size:8px;color:#6f8b96;margin:4px 9px 0;line-height:1.35}.gcard small.credit{margin-top:auto;padding-top:6px;margin-bottom:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.quick-popup .leaflet-popup-content-wrapper{background:#0e2531f2;color:#e7f1f1;border:1px solid #97e8cc40;border-radius:16px;box-shadow:0 12px 30px #0008;padding:0}.quick-popup .leaflet-popup-tip{background:#0e2531f2;border:1px solid #97e8cc40}.quick-popup .leaflet-popup-content{margin:11px;width:236px!important;font:inherit}
.quick-head{display:flex;align-items:flex-start;gap:8px}.quick-head .quick-title{flex:1;padding-top:3px}.quick-close{width:32px;height:32px;margin:-4px -4px 0 0;border-radius:16px;background:#ffffff10;color:#d9e9eb;font-size:20px;line-height:1;flex-shrink:0}.quick-photos{display:flex;gap:5px;margin:9px 0 2px}.quick-photos figure{margin:0;flex:1;min-width:0}.quick-photos img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:10px;display:block;background:#183440}.quick-photos figcaption{font-size:8px;color:#a9c0c8;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.quick-title{font-size:14px;font-weight:650;line-height:1.25}.quick-sub{font-size:9px;color:var(--muted);margin-top:2px}.quick-stats{display:flex;gap:6px;margin-top:8px}.quick-stats span{flex:1;border:1px solid var(--line);border-radius:9px;padding:6px 7px;font-size:8px;color:var(--muted);line-height:1.3}.quick-stats b{display:block;font-size:14px;color:var(--gold);font-weight:500}
.quick-season{font-size:10px;color:var(--mint);margin-top:8px;line-height:1.4}.quick-link{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;min-height:36px;margin-top:8px;padding:0 9px;border:1px solid #97e8cc50;border-radius:10px;background:#97e8cc10;color:var(--mint);font-size:10px;font-weight:600;text-align:left}.quick-link svg{width:12px;flex-shrink:0}.quick-credit{display:block;margin-top:7px;font-size:7px;color:#6f8b96;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.atlas-pin{animation:pin-fade .24s ease-out both}.atlas-pin>div:first-child{animation:pin-pop .28s cubic-bezier(.2,.9,.3,1.15) both}.atlas-pin.pin-out{opacity:0!important;transition:opacity .2s ease;pointer-events:none}.atlas-pin.pin-out *,.map-zooming .site-label{pointer-events:none!important}
@keyframes pin-fade{from{opacity:0}to{opacity:1}}@keyframes pin-pop{from{transform:scale(.6)}to{transform:scale(1)}}
.site-label{animation:label-in .26s ease-out both;transition:opacity .18s ease}.map-zooming .site-label{opacity:0}@keyframes label-in{from{opacity:0}to{opacity:1}}
.quick-popup{animation:pin-fade .22s ease-out both}.quick-popup .leaflet-popup-content-wrapper{animation:pin-pop .26s cubic-bezier(.2,.9,.3,1.1) both;transform-origin:50% 100%}
.glance{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.glance:not(.peek) span{font-size:10px;font-weight:600;color:#cfe3e4;border:1px solid var(--line);border-radius:10px;padding:3px 8px;white-space:nowrap}.fishes{display:inline-flex;gap:2px;vertical-align:middle}.fishes b{display:inline-flex;color:#ffffff24}.fishes b.on{color:var(--gold)}.fishes svg{width:15px;height:10px;fill:currentColor}.fishes circle{fill:#0e2531}.gtile .fishes svg{width:19px;height:13px}
.glance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.climate-chart.inland i{background:linear-gradient(#8fd6c4,#3f7f9c)}.climate-chart .ice i{background:#cfe6f2;opacity:.5}.site-photo{display:block;margin:6px -16px 12px}.site-photo img{display:block;width:100%;max-height:220px;object-fit:cover;background:#183440}.site-photo a{display:block;padding:7px 16px 4px;min-height:24px;font-size:8px;color:#6f8b96;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gtile.wide{grid-column:1/-1;order:5}.gtile{border:1px solid var(--line);border-radius:12px;padding:10px 11px;min-width:0}.gtile small{display:block;font-size:8px;letter-spacing:.8px;text-transform:uppercase;color:var(--muted)}.gtile strong{display:block;margin-top:5px;font-size:15px;font-weight:600;color:#eef7f6}.gtile strong.stars{font-size:14px}.gtile span{display:block;margin-top:4px;font-size:10px;line-height:1.4;color:var(--muted)}
.species-filter .species-label{color:var(--muted);font-size:9px;letter-spacing:1px;flex:none}
.species-follow{flex:1;min-width:0;min-height:42px;text-align:left;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.species-follow.active{color:var(--mint);font-weight:600}
.species-clear{flex:none;width:32px;height:32px;border-radius:50%;color:var(--muted);font-size:18px}
.results-label{padding:12px 14px 4px;font-size:9px;letter-spacing:1.6px;text-transform:uppercase;color:var(--mint)}
.species-place{border-bottom:1px solid var(--line);padding-bottom:10px}
.species-place .area-row{border-bottom:0;padding-bottom:6px}
.species-sites{display:flex;flex-wrap:wrap;gap:6px;padding:0 2px}
.species-sites button{border:1px solid var(--line);border-radius:999px;padding:7px 10px;min-height:32px;font-size:10px;color:#cee0e5;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.species-sites button:last-child[data-species-place]{color:var(--mint)}
.species-none{margin:0 2px}
.species-chip small{display:block;margin-top:3px;color:var(--muted);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.species-chip:after{content:''}
.my-pin{width:20px;height:20px;background:var(--gold);border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px #0006,0 3px 8px #0007}
.my-pin i{width:6px;height:6px;border-radius:50%;background:#272315}
.site-label.mine{left:21px;border-color:#edca8166;color:#fff6de}
.dive-pin.t1{min-width:26px;height:26px;font-size:10px}
.dive-pin.t2{min-width:30px;height:30px;background:#f2bd62}
.dive-pin.t3{min-width:34px;height:34px;background:#f39a4e;border-color:#4a2e1c;font-size:12px}
.dive-pin.t4{min-width:39px;height:39px;background:#ee6f55;border-color:#4d2320;color:#2a0f0c;font-size:13px}
.dive-pin.t5{min-width:45px;height:45px;background:linear-gradient(135deg,#ff7a8a,#c46cf0);border-color:#3b1d4a;color:#1d0b26;font-size:14px;box-shadow:0 0 0 3px #c46cf044,0 4px 14px #0007}
.dive-pin.verified{box-shadow:0 0 0 2px #97e8cc,0 3px 10px #0005}
.dive-pin.t5.verified{box-shadow:0 0 0 2px #97e8cc,0 0 0 5px #c46cf044,0 4px 14px #0007}
.verified-tick{font-style:normal;font-size:9px;font-weight:800;color:var(--mint);letter-spacing:.3px;margin-left:6px}
.site-tally{display:flex;align-items:baseline;gap:8px;padding:12px 14px;border-radius:12px;margin:4px 0 6px;background:#edca8114;border:1px solid #edca8140}
.site-tally strong{font-size:26px;font-weight:800;color:var(--gold)}
.site-tally span{flex:1;font-size:12px;color:var(--muted)}
.site-tally em{font-style:normal;font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--gold)}
.site-tally.t3 strong,.site-tally.t3 em{color:#f39a4e}.site-tally.t4 strong,.site-tally.t4 em{color:#ee6f55}.site-tally.t5 strong,.site-tally.t5 em{color:#d98cf5}
/* Site card: peek (level, three numbers, why go now) and the guide (the dive, this month, seasons, sources). */
.sheet-head .eyebrow{font-size:10px;letter-spacing:1.2px;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sheet-head .subtitle{font-size:12px}
.sheet-head .subtitle:empty{display:none}
.glance.peek{display:block;margin-top:8px}
.peek-level{display:flex;align-items:center;gap:8px;min-width:0}
.peek-level small{color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lvl{display:inline-flex;align-items:center;flex-shrink:0;height:22px;padding:0 9px;border-radius:11px;font-size:11px;font-weight:650;letter-spacing:.2px;border:1px solid currentColor}
.lvl-beginner{color:var(--mint);background:#97e8cc14}
.lvl-intermediate{color:var(--cyan);background:#79dafa14}
.lvl-advanced{color:var(--gold);background:#edca8114}
.lvl-technical{color:#f2917a;background:#f2917a14}
.lvl-check-depth{color:var(--muted);border-style:dashed}
.peek-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:12px 0 0;border:1px solid var(--line);border-radius:14px;background:#ffffff05}
.peek-stats div{min-width:0;padding:9px 6px 8px;text-align:center}
.peek-stats div+div{border-left:1px solid var(--line)}
.peek-stats strong{display:block;font-size:19px;font-weight:550;letter-spacing:-.4px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.peek-stats small{display:block;margin-top:3px;font-size:10.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.peek-now{display:flex;align-items:center;gap:7px;margin:10px 0 0;font-size:12px;color:#d6e6e8;line-height:1.4;min-width:0}
.peek-now svg{width:16px;height:16px;flex-shrink:0;color:var(--mint)}
.peek-now span{min-width:0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.peek-now b{color:var(--mint);font-weight:650;margin-right:3px}
.specs{border:1px solid var(--line);border-radius:14px;overflow:hidden}
.spec{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:11px 13px}
.spec+.spec{border-top:1px solid var(--line)}
.spec-k{font-size:12px;color:var(--muted);padding-top:1px}
.spec-v strong{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:14px;font-weight:600;line-height:1.35}
.spec-v strong a{color:var(--text);text-decoration:none;font-weight:600}
.spec-v>span{display:block;margin-top:3px;font-size:11.5px;line-height:1.5;color:var(--muted)}
.spec-v a{color:var(--cyan);text-decoration:none}
.est{font-style:normal;font-size:10px;font-weight:600;color:var(--gold);border:1px solid #edca8160;border-radius:6px;padding:1px 5px}
.spec-chips{margin-top:10px}
.callout{border:1px solid #f2917a60;background:#f2917a12;color:#f6d3ca;border-radius:12px;padding:10px 12px;font-size:12px;line-height:1.55;margin:0 0 10px}
.month-card{display:block;width:100%;text-align:left;border:1px solid #97e8cc45;background:#97e8cc0c;border-radius:14px;padding:13px 14px;color:inherit}
.mc-top{display:flex;align-items:center;gap:14px}
.mc-temp{flex-shrink:0;font-size:28px;font-weight:400;letter-spacing:-1px;color:var(--gold);line-height:1}
.mc-temp small{display:block;font-size:10px;letter-spacing:.2px;color:var(--muted);margin-top:4px}
.mc-wear{min-width:0;padding-left:14px;border-left:1px solid var(--line)}
.mc-wear small{display:block;font-size:11px;color:var(--muted)}
.mc-wear strong{display:block;font-size:16px;font-weight:600;margin-top:2px}
.mc-why{display:block;margin-top:9px;font-size:12px;line-height:1.5;color:#cfe3e6}
.month-card b{display:block;margin-top:10px;padding-top:10px;border-top:1px solid var(--line);color:var(--mint);font-size:12px;font-weight:650}
.fold{margin:18px 0 4px;border:1px solid var(--line);border-radius:14px;padding:0 13px}
.fold summary{list-style:none;cursor:pointer;min-height:46px;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:600}
.fold summary::-webkit-details-marker{display:none}
.fold summary::after{content:'⌄';color:var(--mint);font-size:16px;transition:transform .2s}
.fold[open] summary::after{transform:rotate(180deg)}
.fold[open]{padding-bottom:10px}
.coords{font-size:12px;color:#d6e6e8;font-variant-numeric:tabular-nums;margin:8px 0 0}
/* Sheet grab handle, guide tabs, "does it fit me" and the depth profile. */
.sheet{position:relative}
.sheet::before{content:'';position:absolute;top:6px;left:50%;width:36px;height:4px;margin-left:-18px;border-radius:2px;background:#badbea38;z-index:2}
.site-tabs{display:none}
.detail-expanded .site-tabs:not([hidden]){display:flex;gap:4px;margin:14px -4px 0;padding:3px;border-radius:12px;background:#ffffff08;border:1px solid var(--line)}
.detail-expanded .peek-now{display:none}
.detail-expanded .sheet-actions{margin-top:12px}
.detail-expanded .sheet-actions button{min-height:38px;border-radius:11px;font-size:12.5px}
.site-tabs button{flex:1;min-height:34px;border-radius:9px;font-size:12px;font-weight:600;color:var(--muted);white-space:nowrap}
.site-tabs button[aria-selected=true]{background:#97e8cc1f;color:var(--mint);box-shadow:inset 0 0 0 1px #97e8cc40}
.peek-level .fit-chip{display:inline-flex;align-items:center;gap:5px;min-width:0;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fit-chip b,.fit b{display:inline-grid;place-items:center;flex-shrink:0;width:16px;height:16px;border-radius:50%;font-size:10px;font-weight:800;color:#062029}
.fit-good{color:var(--mint)}.fit-good b{background:var(--mint)}
.fit-caution{color:var(--gold)}.fit-caution b{background:var(--gold)}
.fit-warn{color:#f2917a}.fit-warn b{background:#f2917a}
.fit-info{color:var(--muted)}.fit-info b{background:#9db6c0}
.fit{display:flex;gap:9px;align-items:flex-start;margin:0;padding:11px 13px;font-size:12.5px;line-height:1.5;border-top:1px solid var(--line);background:var(--panel)}
.fit b{margin-top:1px}
.fit span{color:#dbe9eb}
.life-summary{display:flex;align-items:center;gap:12px;margin:6px 0 4px;padding:12px 13px;border:1px solid var(--line);border-radius:14px}
.life-summary .fishes svg{width:20px;height:13px}
.life-summary strong{display:block;font-size:13px;font-weight:600}
.life-summary small{display:block;margin-top:2px;font-size:11.5px;color:var(--muted);line-height:1.45}
/* Readable minimums for the guide's small print. */
.section-label{font-size:10.5px;letter-spacing:1.3px;margin:22px 0 10px}
.chip-label{font-size:10px}
.chips span{font-size:11px}
.calendar span{font-size:10px}
.climate-chart b{font-size:9px}
.climate-range{font-size:10px}
.climate-range strong{font-size:11px}
.note{font-size:11.5px}
.source{font-size:11px}
.confidence{font-size:11px}
.gcard em{font-size:10px}
.gcard small{font-size:9.5px}
.gcard .gsource{font-size:10px}
.site-photo{margin-top:10px}
.site-photo img{height:190px;max-height:none}
.sheet-body{overflow-anchor:none}
.site-photo a{font-size:9.5px}
/* Site card: peek tags, four stats, depth gauge, fact tiles, see / watch lists. */
.peek-tags{display:flex;flex-wrap:wrap;gap:4px 10px;margin:9px 0 0;font-size:12px;color:#cfe0e3}
.peek-tags span+span::before{content:'·';margin-right:10px;color:var(--muted)}
.peek-stats.four{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:11px}
.peek-stats.four strong{font-size:17px}
.peek-stats.four small{font-size:10px}
.peek-stats small i{font-style:normal;color:var(--gold)}
.peek-stats .none strong{color:#ffffff40}
.site-summary{margin:2px 0 14px;font-size:14px;line-height:1.55;color:#e4eef0}
.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.fact{border:1px solid var(--line);border-radius:13px;padding:10px 11px;min-width:0;background:#ffffff03}
.fact small{display:block;font-size:10.5px;color:var(--muted)}
.fact strong{display:block;margin-top:3px;font-size:14px;font-weight:600;line-height:1.3;overflow-wrap:anywhere}
.fact strong .lvl{margin-top:1px}
.fact>span{display:block;margin-top:3px;font-size:11px;line-height:1.4;color:var(--muted)}
.see-list,.watch-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.see-list li,.watch-list li{position:relative;padding:0 0 0 18px;font-size:13px;line-height:1.45;color:#dfeaec}
.see-list li::before{content:'';position:absolute;left:3px;top:6px;width:7px;height:7px;border-radius:50%;background:var(--mint)}
.watch-list li::before{content:'!';position:absolute;left:0;top:1px;width:13px;height:13px;border-radius:50%;background:var(--gold);color:#2b1d02;font-size:9px;font-weight:800;line-height:13px;text-align:center}
.callout.soft{border-color:#edca8160;background:#edca8110;color:#f3e3bd}
.chip-label{margin:12px 0 6px;color:var(--muted)}
.facts+.section-label,.watch-list+.site-photo,.see-list+.site-photo{margin-top:18px}
/* Expanded card: one scrolling page; the header scrolls away and the tab bar stays pinned (top set in atlasRuntime). */
.detail-expanded .sheet{display:block;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.detail-expanded .sheet-head{position:sticky;z-index:5;background:#0c202d;border-bottom:1px solid var(--line)}
.detail-expanded .sheet-body{overflow:visible}
/* Overview: cross-section hero, dive-slate tiles, highlight and hazard chips, season strip. */
.hero{margin:-8px -16px 16px;border-bottom:1px solid var(--line);background:#071c29;overflow:hidden}
.xsection{display:block;width:100%;height:auto;stroke:none;stroke-width:1;fill:none}
.profile-art{background:#0b2b39;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.profile-temp rect,.profile-deep-temp rect,.profile-depth rect,.profile-caption rect{fill:#071e2a;fill-opacity:.86;stroke:#b9e6e3;stroke-opacity:.25;stroke-width:1.2}
.profile-temp text{fill:#f3fbfa;font-size:27px;font-weight:350}
.profile-temp tspan{fill:#b4d0d1;font-size:12px;font-weight:700;letter-spacing:1.7px}
.profile-deep-temp text{fill:#eacb84;font-size:13px;font-weight:700;letter-spacing:1.2px}
.profile-ruler line{stroke:#d5eeee;stroke-opacity:.42;stroke-width:1.2}
.profile-ruler text{fill:#d5eeee;fill-opacity:.68;font-size:13px;font-weight:700;letter-spacing:1.2px}
.profile-depth line{stroke:#e6f5f3;stroke-opacity:.5;stroke-width:1.35}
.profile-depth .key{fill:#9ebbbd;font-size:11px;font-weight:750;letter-spacing:1.25px}
.profile-depth .value{fill:#f7fcfb;font-size:16px;font-weight:750}
.profile-limit>line{stroke-width:1.7;stroke-dasharray:9 7;stroke-opacity:.68}
.profile-limit rect{stroke-width:1.1}
.profile-limit text{font-size:12px;font-weight:750;letter-spacing:1.05px}
.profile-limit.good>line{stroke:#91e4c8}.profile-limit.good rect{fill:#07352f;stroke:#91e4c8}.profile-limit.good text{fill:#b5efdc}
.profile-limit.over>line{stroke:#f2917a}.profile-limit.over rect{fill:#46241f;stroke:#f2917a}.profile-limit.over text{fill:#ffb09e}
.profile-limit.rec>line{stroke:#e7ca83}.profile-limit.rec rect{fill:#3b321e;stroke:#e7ca83}.profile-limit.rec text{fill:#f0d995}
.profile-caption rect{fill:#071e2a;fill-opacity:.8;stroke-opacity:.18}
.profile-caption text{fill:#a9c3c5;font-size:10px;font-weight:700;letter-spacing:1.45px}
.profile-unknown rect{fill:#071e2a;fill-opacity:.9;stroke:#b9e6e3;stroke-opacity:.32;stroke-width:1.5}
.profile-unknown text{fill:#ecf7f6;font-size:17px;font-weight:750;letter-spacing:1.5px}
.xs-sky{fill:#0b2634}
.detail-expanded #glance .peek-stats,.detail-expanded #glance .peek-tags{display:none}
.xs-light{fill:#b9f1f5;fill-opacity:.045}
.xs-caustics{fill:none;stroke:#d7ffff;stroke-opacity:.12;stroke-width:1}
.xs-particles{fill:#d8f7f7;fill-opacity:.35}
.xs-surface{fill:none;stroke:#dcfbff;stroke-opacity:.88;stroke-width:1.3}
.xs-thermo{fill:#90dfe5;fill-opacity:.055;stroke:#b9edf0;stroke-width:.5;stroke-dasharray:2 4;stroke-opacity:.18}
.xs-temp-badge rect{fill:#052536;fill-opacity:.58;stroke:#bbf3f4;stroke-opacity:.18}
.xs-bed{fill:url(#xs-bed-fill);stroke:#728078;stroke-width:.8}
.xs-bed.est{stroke-dasharray:4 3}
.xs-site{vector-effect:non-scaling-stroke}
.xs-scene-shadow{fill:#00141c;fill-opacity:.78;filter:url(#xs-shadow)}
.xs-wreck-side{fill:url(#xs-wreck-side);stroke:#aac2c5;stroke-width:1.1;stroke-linejoin:round}
.xs-wreck-top{fill:url(#xs-wreck-fill);stroke:#d0dedf;stroke-width:.85;stroke-linejoin:round}
.xs-wreck-detail{fill:none;stroke:#d8e7e7;stroke-width:1;stroke-linejoin:round;stroke-linecap:round}
.xs-wreck-detail circle{fill:#082735;stroke:#c8d8d9;stroke-width:1}
.xs-rust{fill:none;stroke:#cb7e5c;stroke-opacity:.72;stroke-width:1.25;stroke-linecap:round}
.xs-rubble{fill:none;stroke:#879b98;stroke-width:1.2;stroke-linecap:round}
.xs-reef-back{fill:#5e4552;stroke:#a06b71;stroke-width:.8;opacity:.82}
.xs-site.reef{fill:url(#xs-reef-fill);stroke:#f0b38f;stroke-width:1.05}
.xs-coral{fill:none;stroke:#f0bf95;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}
.xs-brain-coral{fill:none;stroke:#e5a57b;stroke-width:1.15;stroke-linecap:round}
.xs-fish{fill:#c7ece4;fill-opacity:.88}
.xs-cave-rock{fill:url(#xs-cave-fill);stroke:#81948d;stroke-width:1}
.xs-cave-rim{fill:none;stroke:#b3c1b8;stroke-width:1.1;stroke-linecap:round}
.xs-cave-strata{fill:none;stroke:#b0beb5;stroke-width:.7;stroke-opacity:.24;stroke-linecap:round}
.xs-stalactites{fill:#4e625d;stroke:#93a49b;stroke-width:.8;stroke-linejoin:round}
.xs-guideline{fill:none;stroke:#f0d17f;stroke-width:1.15;stroke-dasharray:3 2}
.xs-line-anchor{fill:#f0d17f;stroke:#fff1b5;stroke-width:.7}
.xs-cave-light{fill:#9ce5df;fill-opacity:.06}
.xs-site.rock{fill:#354a49;stroke:#8da19b;stroke-width:1}
.xs-wall-edge{fill:none;stroke:#9cb0aa;stroke-width:1.1}
.xs-lake-bed{fill:url(#xs-lake-bed);stroke:#788472;stroke-width:1}
.xs-lake-bed.est{stroke-dasharray:4 3}
.xs-lake-contour{fill:none;stroke:#a3b29e;stroke-opacity:.23;stroke-width:.8;stroke-dasharray:2 3}
.xs-lake-log{fill:none;stroke:#a58d6a;stroke-width:2;stroke-linecap:round}
.xs-lake-life{fill:#66775f;stroke:#a4b58a;stroke-width:1;stroke-linecap:round}
.xs-diver-beam{fill:#d9ffff;fill-opacity:.075}
.xs-diver{fill:none;stroke:#e0f5f1;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.xs-diver>circle{fill:#d7efec;stroke:none}
.xs-diver .xs-tank{fill:#d7b95e;stroke:#f7dea0;stroke-width:.8}
.xs-diver .xs-bubble{fill:none;stroke:#d7efec;stroke-width:.8;opacity:.7}
.xs-grid{stroke:#d8f7f7;stroke-opacity:.065;stroke-width:.7}
.xs-grid-t,.xs-grid-unit{fill:#d8f7f7;fill-opacity:.36;font-size:7.5px;font-weight:600;letter-spacing:.8px}
.xs-depth-mark line{stroke:#d7eeee;stroke-opacity:.46;stroke-width:.8}
.xs-depth-mark rect{fill:#061f2c;fill-opacity:.9;stroke:#d4ecee;stroke-opacity:.2;stroke-width:.7}
.xs-depth-k{fill:#8fb2b8;font-size:6.6px;font-weight:700;letter-spacing:.65px}
.xs-depth-v{fill:#f4fbfb;font-size:9px;font-weight:700}
.xs-temp{fill:#eef5f5;font-size:15px;font-weight:300}
.xs-temp.cold{fill:var(--gold)}
.xs-note{fill:#cdeff5;fill-opacity:.72;font-size:7px;font-weight:600;letter-spacing:.55px}
.xs-big{fill:#eef5f5;font-size:12px;font-weight:650;letter-spacing:1px;opacity:.8}
.xs-unknown circle,.xs-unknown path{fill:none;stroke:#c9ebed;stroke-opacity:.18;stroke-width:1}
.xs-limit-g line{stroke-width:1.1;stroke-dasharray:5 4}.xs-limit-g rect{stroke-width:.7}
.xs-limit-g text{font-size:7.2px;font-weight:700;letter-spacing:.45px}
.xs-limit-g.good line{stroke:var(--mint)}.xs-limit-g.good rect{fill:#08352f;stroke:#90e6c9}.xs-limit-g.good text{fill:#a9ecd6}
.xs-limit-g.over line{stroke:#f2917a}.xs-limit-g.over rect{fill:#46241f;stroke:#f2917a}.xs-limit-g.over text{fill:#ffb09e}
.xs-limit-g.rec line{stroke:#a7bdc5;stroke-opacity:.64}.xs-limit-g.rec rect{fill:#132d38;stroke:#8da8b2}.xs-limit-g.rec text{fill:#cfdee2}
.xs-caption rect{fill:#071d28;fill-opacity:.72;stroke:#ccebed;stroke-opacity:.12;stroke-width:.6}
.xs-caption text{fill:#c7dcdf;fill-opacity:.72;font-size:6.7px;font-weight:700;letter-spacing:.65px}
.xsection text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.see-chips,.watch-chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 14px}
.see-chips span{font-size:12px;border:1px solid #badbea30;border-radius:14px;padding:6px 10px;color:#dfeaec}
.watch-chips span{font-size:12px;border-radius:10px;padding:6px 10px;background:#edca8118;color:#f3e3bd}
.slate+.callout{margin-top:0}
.slate{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:2px 0 12px}
.tile{background:#ffffff08;border:1px solid #ffffff0a;border-radius:16px;padding:11px 13px;min-width:0}
.tile.tall{grid-row:span 2;display:flex;flex-direction:column}
.tile.wide{grid-column:span 2;display:flex;flex-wrap:wrap;gap:6px;padding:9px 10px;font-size:12px;color:#dfeaec}
.tile.wide span{padding:4px 9px;border-radius:9px;background:#ffffff0a}
.tile small{display:block;font-size:10.5px;letter-spacing:1.1px;text-transform:uppercase;color:var(--muted)}
.tile strong{display:block;margin-top:4px;font-size:20px;font-weight:450;line-height:1.1}
.tile strong.num{font-size:28px;font-weight:300;letter-spacing:-.6px;font-variant-numeric:tabular-nums}
.tile.tall strong.num{font-size:38px;margin-top:8px}
.tile strong.cold{color:var(--gold)}
.tile>span{display:block;margin-top:4px;font-size:11.5px;color:var(--muted);line-height:1.35}
.slate-fit{display:block;margin-top:auto;padding-top:10px;font-style:normal;font-size:12px;font-weight:600;line-height:1.35}
.slate-fit.fit-good{color:var(--mint)}.slate-fit.fit-caution{color:var(--gold)}.slate-fit.fit-warn{color:#f2917a}
.fit.slate-note{border:0;border-radius:12px;background:#f2917a14;margin:0 0 12px}
.season-strip{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:3px}
.season-strip span{display:flex;flex-direction:column;align-items:center;gap:4px}
.season-strip i{display:block;width:100%;height:24px;border-radius:5px;background:#ffffff10;position:relative}
.season-strip .on i{background:#97e8cc8c}
.season-strip .life i::after{content:'';position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#0c202d}
.season-strip .now i{box-shadow:0 0 0 2px var(--gold)}
.season-strip b{font-size:10px;font-weight:500;color:var(--muted)}
.season-strip .now b{color:var(--gold)}
.peek-stats strong{font-weight:400}
.day-plan{margin:0 0 18px;border:1px solid #97e8cc55;border-radius:16px;overflow:hidden;background:linear-gradient(145deg,#123333,#0c242e)}
.day-plan-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px;border-bottom:1px solid var(--line)}.day-plan-head small,.day-plan-head strong{display:block}.day-plan-head small{font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--mint)}.day-plan-head strong{margin-top:4px;font-size:16px;font-weight:650}.day-plan-head>b{font-size:8px;font-weight:550;color:var(--muted);text-align:right;line-height:1.4}.day-plan-list{padding:0 13px}.day-item{display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}.day-item:last-child{border:0}.day-item>i{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:9px;background:#ffffff0a;color:var(--mint);font-style:normal;font-size:16px}.day-item>span{min-width:0}.day-item strong,.day-item small{display:block}.day-item strong{font-size:11px;line-height:1.35}.day-item small{margin-top:4px;color:var(--muted);font-size:9px;line-height:1.5}.day-item.tone-warn>i{color:#f2917a;background:#f2917a12}.day-item.tone-sun>i{color:var(--gold);background:#edca8112}.day-item.tone-cold>i{color:var(--cyan);background:#79dafa12}.day-plan>button{width:100%;min-height:46px;padding:0 14px;border-top:1px solid #97e8cc38;background:#97e8cc0b;color:var(--mint);font-size:11px;font-weight:700;text-align:left}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;
