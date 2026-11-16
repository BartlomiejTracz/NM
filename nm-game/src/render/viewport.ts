/** Board-only gestures leave normal document scrolling and browser zoom available outside the map. */
export function installBoardViewport(canvas: HTMLCanvasElement, viewport: HTMLElement, layer: HTMLElement) {
  let range = 15, x = 0, y = 0, scale = 1;
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = false, suppressUntil = 0;
  const apply = () => {
    if (!viewport.clientWidth || !canvas.width) return;
    const fit = Math.min(viewport.clientWidth / canvas.width, viewport.clientHeight / canvas.height) * .96;
    scale = matchMedia('(max-width: 1000px)').matches ? fit * 15 / range : Math.min(20 / range, range >= 15 ? fit : Infinity);
    // Keep part of the board reachable, even after repeated dragging or rotation.
    const maxX = Math.max(0, (canvas.width * scale - viewport.clientWidth) / 2) + viewport.clientWidth * .3;
    const maxY = Math.max(0, (canvas.height * scale - viewport.clientHeight) / 2) + viewport.clientHeight * .3;
    x = Math.max(-maxX, Math.min(maxX, x)); y = Math.max(-maxY, Math.min(maxY, y));
    layer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    for (const id of ['zoom-val', 'radar-range-text']) document.getElementById(id)!.textContent = String(Math.round(range));
  };
  const center = () => {
    const points = [...pointers.values()];
    return {x: points.reduce((s,p)=>s+p.x,0)/points.length, y: points.reduce((s,p)=>s+p.y,0)/points.length};
  };
  const distance = () => { const p = [...pointers.values()]; return p.length < 2 ? 0 : Math.hypot(p[0]!.x-p[1]!.x,p[0]!.y-p[1]!.y); };
  let origin = {x:0,y:0};
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 1) return;
    if (!pointers.size) { moved = false; origin = {x:event.clientX,y:event.clientY}; }
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if (pointers.size > 1) moved = true;
    // Capture on the actual target so a stationary touch still generates a canvas click.
    (event.target as Element).setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = center(), previousDistance = distance();
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const after = center(), nextDistance = distance();
    if (Math.hypot(event.clientX-origin.x,event.clientY-origin.y) > 8) moved = true;
    if (!moved) return;
    x += after.x-before.x; y += after.y-before.y;
    if (previousDistance > 0 && nextDistance > 0) {
      const oldScale = scale;
      range = Math.max(3,Math.min(50,range*previousDistance/nextDistance)); apply();
      const rect = viewport.getBoundingClientRect();
      const cx = after.x-rect.left-rect.width/2, cy = after.y-rect.top-rect.height/2;
      x = cx-(cx-x)*scale/oldScale; y = cy-(cy-y)*scale/oldScale;
    }
    apply();
  });
  const end = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return;
    if (moved || event.type === 'pointercancel') suppressUntil = performance.now()+500;
    pointers.delete(event.pointerId);
  };
  viewport.addEventListener('pointerup',end); viewport.addEventListener('pointercancel',end);
  viewport.addEventListener('lostpointercapture',end);
  viewport.addEventListener('click',event => {
    if (performance.now()<suppressUntil) {event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.getElementById('btn-zoom-in')!.addEventListener('click',()=>{range=Math.max(3,range-3);apply();});
  document.getElementById('btn-zoom-out')!.addEventListener('click',()=>{range=Math.min(50,range+3);apply();});
  document.getElementById('btn-reset-view')!.addEventListener('click',()=>{range=15;x=0;y=0;apply();});
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-map-action]')) {
    button.addEventListener('click', () => {
      if (button.dataset.mapAction === 'reset') {range=15;x=0;y=0;}
      else range = Math.max(3, Math.min(50, range + (button.dataset.mapAction === 'in' ? -3 : 3)));
      apply();
    });
  }
  const resize = new ResizeObserver(apply); resize.observe(viewport); resize.observe(canvas); apply();
}
