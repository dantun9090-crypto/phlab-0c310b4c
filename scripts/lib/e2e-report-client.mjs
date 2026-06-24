/**
 * Browser-side script embedded into e2e-stale-report/report.html.
 *
 * Owns:
 *   - filter persistence via localStorage (per-scenario, scoped to pathname)
 *   - per-scenario "Download mismatch bundle" button (JSON)
 *   - global "Download mismatch bundle (all scenarios)" button (JSON)
 *   - global "Download as ZIP" button (per-scenario JSON + manifest)
 *
 * Exported as a string so the same JS runs in:
 *   - the generated report.html
 *   - scripts/e2e-stale-report-ui.mjs (Playwright UI test)
 *
 * Kept dependency-free (no bundler, no transpile) — ES5-safe.
 */
export const REPORT_CLIENT_SCRIPT = `
(function(){
  // ── localStorage filter persistence ──────────────────────────────────────
  var LS_KEY='phlabs.e2eStaleReport.filters@'+location.pathname;
  function loadAll(){try{return JSON.parse(localStorage.getItem(LS_KEY)||'{}')||{};}catch(e){return {};}}
  function saveAll(state){try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(e){/* quota / disabled */}}
  function apply(scope){
    var root=document.querySelector('[data-drilldown="'+scope+'"]');if(!root)return;
    var ctrls=document.querySelector('.filters[data-scope="'+scope+'"]');if(!ctrls)return;
    var f={match:'',rtype:'',kind:'',redacted:''};
    ctrls.querySelectorAll('select[data-filter]').forEach(function(s){f[s.dataset.filter]=s.value;});
    var n=0;
    root.querySelectorAll('details.drill').forEach(function(el){
      var ok=true;
      if(f.match!==''&&el.dataset.match!==f.match)ok=false;
      if(f.rtype&&el.dataset.rtype!==f.rtype)ok=false;
      if(f.kind&&(' '+el.dataset.kinds+' ').indexOf(' '+f.kind+' ')===-1)ok=false;
      if(f.redacted!==''&&el.dataset.redacted!==f.redacted)ok=false;
      el.style.display=ok?'':'none';if(ok)n++;
    });
    var c=ctrls.querySelector('[data-visible-count]');if(c)c.textContent='('+n+' visible)';
    var all=loadAll();all[scope]=f;saveAll(all);
  }
  function restore(){
    var all=loadAll();
    document.querySelectorAll('.filters[data-scope]').forEach(function(ctrls){
      var scope=ctrls.dataset.scope;var saved=all[scope];if(!saved)return;
      ctrls.querySelectorAll('select[data-filter]').forEach(function(s){
        var v=saved[s.dataset.filter];if(v!=null){
          if([].some.call(s.options,function(o){return o.value===v;}))s.value=v;
        }
      });
    });
  }
  function visibleKeys(scope){
    var root=document.querySelector('[data-drilldown="'+scope+'"]');
    var allowed=new Set();if(!root)return allowed;
    root.querySelectorAll('details.drill').forEach(function(el){
      if(el.style.display!=='none'){
        var m=el.querySelector('summary').textContent.match(/#(\\d+)/);
        var url=el.querySelector('code').textContent;
        allowed.add(url+'#'+(m?m[1]:''));
      }
    });
    return allowed;
  }
  function currentFilters(ctrls){
    var f={};ctrls.querySelectorAll('select[data-filter]').forEach(function(s){f[s.dataset.filter]=s.value;});return f;
  }
  function downloadBlob(name,blob){
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download=name;document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},0);
  }
  function downloadJson(name,obj){
    downloadBlob(name,new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));
  }

  // ── pure-JS ZIP STORE writer (no compression, no deps) ────────────────────
  var CRC_TABLE=(function(){var t=new Uint32Array(256);for(var i=0;i<256;i++){var c=i;for(var k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[i]=c>>>0;}return t;})();
  function crc32(buf){var crc=0xffffffff;for(var i=0;i<buf.length;i++)crc=(CRC_TABLE[(crc^buf[i])&0xff]^(crc>>>8))>>>0;return (crc^0xffffffff)>>>0;}
  function zipStore(files){
    var enc=new TextEncoder();var parts=[],central=[];var offset=0;
    for(var i=0;i<files.length;i++){
      var f=files[i];var nameBytes=enc.encode(f.name);
      var data=f.data instanceof Uint8Array?f.data:enc.encode(String(f.data));
      var crc=crc32(data);
      var lh=new Uint8Array(30+nameBytes.length);var dv=new DataView(lh.buffer);
      dv.setUint32(0,0x04034b50,true);dv.setUint16(4,20,true);dv.setUint16(6,0,true);
      dv.setUint16(8,0,true);dv.setUint16(10,0,true);dv.setUint16(12,0x21,true);
      dv.setUint32(14,crc,true);dv.setUint32(18,data.length,true);dv.setUint32(22,data.length,true);
      dv.setUint16(26,nameBytes.length,true);dv.setUint16(28,0,true);lh.set(nameBytes,30);
      parts.push(lh);parts.push(data);
      var cd=new Uint8Array(46+nameBytes.length);var cdv=new DataView(cd.buffer);
      cdv.setUint32(0,0x02014b50,true);cdv.setUint16(4,20,true);cdv.setUint16(6,20,true);
      cdv.setUint16(8,0,true);cdv.setUint16(10,0,true);cdv.setUint16(12,0,true);cdv.setUint16(14,0x21,true);
      cdv.setUint32(16,crc,true);cdv.setUint32(20,data.length,true);cdv.setUint32(24,data.length,true);
      cdv.setUint16(28,nameBytes.length,true);cdv.setUint32(42,offset,true);cd.set(nameBytes,46);
      central.push(cd);
      offset+=lh.length+data.length;
    }
    var centralSize=0;for(var j=0;j<central.length;j++)centralSize+=central[j].length;
    var eocd=new Uint8Array(22);var edv=new DataView(eocd.buffer);
    edv.setUint32(0,0x06054b50,true);edv.setUint16(8,files.length,true);edv.setUint16(10,files.length,true);
    edv.setUint32(12,centralSize,true);edv.setUint32(16,offset,true);
    var total=offset+centralSize+22;var out=new Uint8Array(total);var p=0;
    for(var a=0;a<parts.length;a++){out.set(parts[a],p);p+=parts[a].length;}
    for(var b=0;b<central.length;b++){out.set(central[b],p);p+=central[b].length;}
    out.set(eocd,p);return out;
  }

  // ── bundle builders ──────────────────────────────────────────────────────
  function filterScenario(sc,allowed){
    sc.items=sc.items.filter(function(it){return allowed.has(it.url+'#'+it.index);});
    return sc;
  }

  document.addEventListener('change',function(e){
    var s=e.target.closest('.filters');if(!s||!s.dataset.scope)return;apply(s.dataset.scope);
  });

  document.addEventListener('click',function(e){
    // Per-scenario JSON bundle
    var b=e.target.closest('button[data-bundle]');
    if(b){
      var scope=b.dataset.bundle;
      var ctrls=document.querySelector('.filters[data-scope="'+scope+'"]');
      var allowed=visibleKeys(scope);
      var data=JSON.parse(atob(b.dataset.bundleB64));
      filterScenario(data,allowed);
      data.exportedAt=new Date().toISOString();
      data.filterApplied=ctrls?currentFilters(ctrls):null;
      return downloadJson('mismatch-bundle-'+scope+'.json',data);
    }
    // Global JSON bundle
    var g=e.target.closest('button[data-global-bundle]');
    if(g){
      var all=JSON.parse(atob(g.dataset.globalBundleB64));
      var perScenarioFilters={};
      all.scenarios=all.scenarios.map(function(sc){
        var ctrls=document.querySelector('.filters[data-scope="'+sc.scenario+'"]');
        var allowed=visibleKeys(sc.scenario);
        perScenarioFilters[sc.scenario]=ctrls?currentFilters(ctrls):null;
        return filterScenario(sc,allowed);
      });
      all.exportedAt=new Date().toISOString();
      all.filtersApplied=perScenarioFilters;
      return downloadJson('mismatch-bundle-all-scenarios.json',all);
    }
    // Global ZIP bundle (manifest + per-scenario JSON files)
    var z=e.target.closest('button[data-global-zip]');
    if(z){
      var all2=JSON.parse(atob(z.dataset.globalBundleB64));
      var perScenarioFilters2={};
      var files=[];
      all2.scenarios=all2.scenarios.map(function(sc){
        var ctrls=document.querySelector('.filters[data-scope="'+sc.scenario+'"]');
        var allowed=visibleKeys(sc.scenario);
        perScenarioFilters2[sc.scenario]=ctrls?currentFilters(ctrls):null;
        var filtered=filterScenario(JSON.parse(JSON.stringify(sc)),allowed);
        files.push({name:'scenarios/'+sc.scenario+'.json',data:JSON.stringify(filtered,null,2)});
        return filtered;
      });
      var manifest={
        schemaVersion:all2.schemaVersion,
        generatedAt:all2.generatedAt,
        exportedAt:new Date().toISOString(),
        redaction:all2.redaction,
        filtersApplied:perScenarioFilters2,
        scenarios:all2.scenarios.map(function(s){return {scenario:s.scenario,items:s.items.length};}),
      };
      files.unshift({name:'manifest.json',data:JSON.stringify(manifest,null,2)});
      var bytes=zipStore(files);
      return downloadBlob('mismatch-bundle-all-scenarios.zip',new Blob([bytes],{type:'application/zip'}));
    }
  });

  document.addEventListener('DOMContentLoaded',function(){
    restore();
    document.querySelectorAll('.filters[data-scope]').forEach(function(s){apply(s.dataset.scope);});
  });
})();
`;
