import test from 'node:test';
import assert from 'node:assert/strict';
import { installBoardViewport } from '../../nm-game/src/render/viewport';

test('touch viewport: tap, pan suppression, pinch limits and reset after resize', () => {
  class Node extends EventTarget {
    clientWidth = 360; clientHeight = 480; width = 720; height = 480;
    style = {transform:''}; textContent = ''; setPointerCapture() {}
    getBoundingClientRect() {return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  }
  const nodes = new Map<string, Node>();
  for (const id of ['zoom-val','radar-range-text','btn-zoom-in','btn-zoom-out','btn-reset-view']) nodes.set(id,new Node());
  const originals = ['document','matchMedia','ResizeObserver'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  let resize = () => {};
  Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:(id:string)=>nodes.get(id),querySelectorAll:()=>[]}});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>({matches:true})});
  Object.defineProperty(globalThis,'ResizeObserver',{configurable:true,value:class {constructor(fn:()=>void){resize=fn;}observe(){}}});
  try {
    const canvas = new Node(), viewport = new Node(), layer = new Node();
    installBoardViewport(canvas as unknown as HTMLCanvasElement,viewport as unknown as HTMLElement,layer as unknown as HTMLElement);
    const pointer = (type:string,id:number,x:number,y:number) => {
      const event = new Event(type,{cancelable:true});
      Object.assign(event,{pointerId:id,clientX:x,clientY:y,pointerType:'touch',button:0});viewport.dispatchEvent(event);
    };
    const click = () => {const e=new Event('click',{cancelable:true});viewport.dispatchEvent(e);return e.defaultPrevented;};
    pointer('pointerdown',1,100,100);pointer('pointerup',1,100,100);
    assert.equal(click(),false,'a tap must reach the game');
    pointer('pointerdown',1,100,100);pointer('pointermove',1,140,100);pointer('pointerup',1,140,100);
    assert.equal(click(),true,'panning must not perform a game action');
    pointer('pointerdown',1,100,100);pointer('pointerdown',2,200,100);pointer('pointermove',2,300,100);
    assert.ok(Number(nodes.get('zoom-val')!.textContent)<15,'pinch must zoom in');
    pointer('pointercancel',1,100,100);pointer('pointerup',2,300,100);
    nodes.get('btn-reset-view')!.dispatchEvent(new Event('click'));
    assert.equal(nodes.get('zoom-val')!.textContent,'15');
    assert.match(layer.style.transform,/translate\(0px, 0px\)/);
    viewport.clientWidth=700;resize();assert.ok(!layer.style.transform.includes('NaN'));
  } finally {
    for(const [key,descriptor] of originals) {if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}
  }
});
