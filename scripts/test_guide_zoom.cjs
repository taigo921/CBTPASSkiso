const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=source.indexOf('function guideZoomScrollDelta('),end=source.indexOf('function guidePageAtClientY(');
assert.ok(start>=0&&end>start,'guide zoom helper is present in index.html');
const context={};vm.createContext(context);vm.runInContext(source.slice(start,end),context);

const pageIndex=220,gap=12,baseWidth=976,baseHeight=1395,viewportLeft=8,documentTop=12;
const focusPosition={x:.37,y:.64};
let scale=1,scrollLeft=0,scrollTop=documentTop+pageIndex*(baseHeight+gap)+focusPosition.y*baseHeight-420;
const target={x:viewportLeft+focusPosition.x*baseWidth,y:420};
const pageRect=currentScale=>({
  left:viewportLeft-scrollLeft,
  top:documentTop+pageIndex*(baseHeight*currentScale+gap)-scrollTop,
  width:baseWidth*currentScale,
  height:baseHeight*currentScale
});

for(const nextScale of [1.2,2,1.2,1]){
  const oldRect=pageRect(scale),focus={x:oldRect.left+focusPosition.x*oldRect.width,y:oldRect.top+focusPosition.y*oldRect.height};
  assert.ok(Math.abs(focus.x-target.x)<1e-9&&Math.abs(focus.y-target.y)<1e-9,'focus starts at the target point');
  const newRect=pageRect(nextScale),delta=context.guideZoomScrollDelta(oldRect,newRect,focus,target);
  scrollLeft+=delta.left;scrollTop+=delta.top;scale=nextScale;
  const anchored=pageRect(scale);
  assert.ok(Math.abs(anchored.left+focusPosition.x*anchored.width-target.x)<1e-7,`horizontal page position stays fixed at ${scale}x`);
  assert.ok(Math.abs(anchored.top+focusPosition.y*anchored.height-target.y)<1e-7,`page 221 focus stays fixed at ${scale}x`);
}
assert.ok(Math.abs(scrollTop-(documentTop+pageIndex*(baseHeight+gap)+focusPosition.y*baseHeight-target.y))<1e-7,'round trip returns to the original scroll position');
console.log('PASS guide zoom: a focus point on page 221 stays anchored across 1x -> 1.2x -> 2x and back with fixed 12px gaps.');
