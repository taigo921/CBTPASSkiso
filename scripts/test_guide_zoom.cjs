const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const helperStart=source.indexOf('function guideZoomScrollDelta('),helperEnd=source.indexOf('function guidePageAtClientY(');
assert.ok(helperStart>=0&&helperEnd>helperStart,'guide zoom helper is present in index.html');
const context={};vm.createContext(context);vm.runInContext(source.slice(helperStart,helperEnd),context);

// A 1x -> 2.5x pinch commits once at page 221, after the pinch center has moved.
// Fixed 12px gaps do not scale, so anchoring against the same page rect is essential.
const pageIndex=220,gap=12,baseWidth=976,baseHeight=1395,viewportLeft=8,documentTop=12;
const focusPosition={x:.37,y:.64},startCenter={x:viewportLeft+focusPosition.x*baseWidth,y:420},finalCenter={x:startCenter.x+31,y:startCenter.y-47};
let scale=1,scrollLeft=0,scrollTop=documentTop+pageIndex*(baseHeight+gap)+focusPosition.y*baseHeight-startCenter.y;
const pageRect=currentScale=>({
  left:viewportLeft-scrollLeft,
  top:documentTop+pageIndex*(baseHeight*currentScale+gap)-scrollTop,
  width:baseWidth*currentScale,
  height:baseHeight*currentScale
});
const oldRect=pageRect(scale),focus={x:oldRect.left+focusPosition.x*oldRect.width,y:oldRect.top+focusPosition.y*oldRect.height};
assert.ok(Math.abs(focus.x-startCenter.x)<1e-7&&Math.abs(focus.y-startCenter.y)<1e-7,'page 221 fraction starts under the initial pinch center');
const nextScale=2.5,newRect=pageRect(nextScale),delta=context.guideZoomScrollDelta(oldRect,newRect,focus,finalCenter);
scrollLeft+=delta.left;scrollTop+=delta.top;scale=nextScale;
const committed=pageRect(scale);
assert.ok(Math.abs(committed.left+focusPosition.x*committed.width-finalCenter.x)<1e-7,'committed horizontal fraction lands under the final center');
assert.ok(Math.abs(committed.top+focusPosition.y*committed.height-finalCenter.y)<1e-7,'committed page 221 fraction lands under the final center');

// The animation-frame pinch preview may only update transform and the label.
const frameStart=source.indexOf('function renderGuidePinchFrame('),frameEnd=source.indexOf('function clearGuidePinchVisual(');
assert.ok(frameStart>=0&&frameEnd>frameStart,'pinch frame renderer is present in index.html');
const pageWrites=[],scrollWrites=[];
const pagesStyle=new Proxy({}, {set(target,key,value){pageWrites.push(String(key));target[key]=value;return true;}});
const scrollMock={};
Object.defineProperties(scrollMock,{
  scrollTop:{get:()=>0,set:value=>scrollWrites.push(['scrollTop',value])},
  scrollLeft:{get:()=>0,set:value=>scrollWrites.push(['scrollLeft',value])}
});
const elements={guidePages:{style:pagesStyle},guideZoomReset:{textContent:''},guideScroll:scrollMock};
const frameContext={guideZoomState:{pinchActive:true,startScale:1,startDistance:100,startCenter:{x:120,y:320},targetScale:1,lastCenter:null,pinchMoved:false},el:id=>elements[id]};
vm.createContext(frameContext);vm.runInContext(source.slice(frameStart,frameEnd),frameContext);
frameContext.renderGuidePinchFrame({distance:250,center:{x:151,y:273}});
assert.deepEqual(pageWrites,['transform'],'pinch preview writes only the pages transform');
assert.deepEqual(scrollWrites,[],'pinch preview never writes scrollTop or scrollLeft');
assert.equal(elements.guidePages.style.width,undefined,'pinch preview never writes width');
assert.equal(elements.guidePages.style.maxWidth,undefined,'pinch preview never writes maxWidth');
assert.equal(frameContext.guideZoomState.targetScale,2.5);
assert.equal(elements.guideZoomReset.textContent,'2.5×');

assert.match(source,/scroll\.style\.overflow='hidden'/,'guide zoom freezes native scrolling before layout changes');
assert.match(source,/restoreGuideScroll\(scroll\.scrollTop,scroll\.scrollLeft\)/,'committed offsets are re-applied after overflow is restored');
assert.match(source,/20261114-guidepinch/);
console.log('PASS guide zoom: pinch preview is transform-only and a moved 1x -> 2.5x commit keeps page 221 anchored.');
