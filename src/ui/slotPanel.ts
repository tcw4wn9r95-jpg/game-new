// The save/load slot picker: three slots (plus the autosave when loading),
// each showing its map, match clock, age and when it was saved.
import { SLOTS, type SlotId, describe, listSaves } from './saves';

export function showSlots(root: HTMLElement, mode: 'save' | 'load', onPick: (slot: SlotId) => void, onClose: () => void): void {
  const bg = document.createElement('div');
  bg.className = 'panel-backdrop slots-backdrop';
  bg.innerHTML = `
    <div class="panel frame slots-panel">
      <h2 class="panel-title">${mode === 'save' ? 'Save Game' : 'Load Game'}</h2>
      <div class="slot-list"><div class="slot-empty">Loading…</div></div>
      <button class="btn btn-wood" data-a="close">Back</button>
    </div>`;
  const close = () => {
    bg.remove();
    onClose();
  };
  bg.querySelector('[data-a=close]')!.addEventListener('click', close);
  root.appendChild(bg);
  void listSaves().then((saves) => {
    const list = bg.querySelector('.slot-list')!;
    list.innerHTML = '';
    const ids: SlotId[] = mode === 'load' ? ['auto', ...SLOTS] : SLOTS;
    let any = false;
    ids.forEach((id) => {
      const meta = saves[id];
      if (mode === 'load' && !meta) return;
      any = true;
      const b = document.createElement('button');
      b.className = 'slot';
      const name = id === 'auto' ? 'Autosave' : `Slot ${id.slice(4)}`;
      const d = meta ? describe(meta) : null;
      b.innerHTML = `<span class="slot-name">${name}</span><span class="slot-title">${d ? d.title : 'Empty'}</span><span class="slot-detail">${d ? d.detail : mode === 'save' ? 'Tap to save here' : ''}</span>`;
      let armed = false;
      b.addEventListener('click', () => {
        // Overwriting a save takes a second tap.
        if (mode === 'save' && meta && !armed) {
          armed = true;
          b.classList.add('armed');
          b.querySelector('.slot-detail')!.textContent = 'Tap again to overwrite';
          return;
        }
        bg.remove();
        onPick(id);
      });
      list.appendChild(b);
    });
    if (!any) list.innerHTML = '<div class="slot-empty">No saved games yet.</div>';
  });
}
