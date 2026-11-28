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
const guideHeader=source.match(/<div class="guide-viewer-head">([\s\S]*?)<div class="guide-viewer-scroll"/)?.[1];
assert.ok(guideHeader,'guide header is present above the scroll area');
assert.deepEqual(
  [...guideHeader.matchAll(/<(?:button|a|input|select|textarea|summary|strong)\b[^>]*>/g)].map(([tag])=>tag.match(/\bid="([^"]+)"/)?.[1]),
  ['guideTitle','guideZoomOut','guideZoomReset','guideZoomIn','guideCloseBtn'],
  'the title precedes every control and the back button is last'
);
assert.match(source,/\.guide-viewer-head\{[^}]*display:flex[^}]*padding:calc\(10px \+ env\(safe-area-inset-top\)\)/);
assert.match(source,/\.guide-viewer-head strong\{[^}]*flex:1;min-width:90px[^}]*overflow-wrap:anywhere/,'the non-interactive title reserves the top-left space and wraps at narrow widths');
assert.match(source,/\.guide-zoom-controls\{[^}]*flex:none/,'the zoom group stays to the right of the title');
const guideCloseRule=source.match(/^\s*#guideCloseBtn\{([^}]+)\}/m)?.[1];
assert.match(guideCloseRule,/^flex:none;white-space:nowrap;/);
assert.doesNotMatch(guideCloseRule,/\b(?:position|inset(?:-[\w-]+)?|top|left):/,'the back button stays in the header flow');
assert.match(source,/@media\(max-width:420px\)\{\s*#guideCloseBtn \.guide-close-full\{display:none;\}\s*#guideCloseBtn \.guide-close-short\{display:inline;\}/);
assert.match(guideHeader,/<span class="guide-close-short">戻る<\/span>/);
assert.match(source,/<div class="image-zoom-toolbar"><strong id="imageZoomTitle">画像<\/strong><button[^>]+id="imageZoomOut"[\s\S]*id="imageZoomReset"[\s\S]*id="imageZoomIn"[\s\S]*id="imageZoomClose">閉じる<\/button><\/div>/,'image zoom controls end with the close button');
assert.match(source,/\.image-zoom-toolbar\{[^}]*gap:clamp\(4px,2vw,8px\)[^}]*padding:[^;}]*clamp\(6px,3vw,12px\)/,'image zoom toolbar compresses at narrow widths');
assert.match(source,/#imageZoomClose\{[^}]*min-width:48px[^}]*background:rgba\(255,255,255,\.24\)/,'image zoom close button remains prominent on the dark seasonal-safe toolbar');
assert.match(source,/20261129-no-season-correct-fx/);
console.log('PASS guide zoom: right-aligned controls, reserved top-left space, and pinch anchoring on page 221.');
