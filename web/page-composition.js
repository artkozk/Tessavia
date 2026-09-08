export function blockSubtree(definition,id) {
 const ids=new Set([id]);let changed=true;while(changed){changed=false;for(const b of definition.blocks)if(b.parentId&&ids.has(b.parentId)&&!ids.has(b.id)){ids.add(b.id);changed=true;}}return definition.blocks.filter(b=>ids.has(b.id));
}
export function blockOutline(definition) {
 const rows=[],seen=new Set();const visit=(parent,depth)=>{for(const b of definition.blocks.filter(b=>(b.parentId||'')===parent)){if(seen.has(b.id))continue;seen.add(b.id);rows.push({block:b,depth});visit(b.id,depth+1);}};visit('',0);for(const b of definition.blocks)if(!seen.has(b.id))rows.push({block:b,depth:0});return rows;
}
export function groupChoices(definition,block) {
 const descendants=new Set(blockSubtree(definition,block.id).map(b=>b.id)),outline=blockOutline(definition),base=outline.find(row=>row.block.id===block.id)?.depth||0,height=Math.max(0,...outline.filter(row=>descendants.has(row.block.id)).map(row=>row.depth-base));return outline.filter(({block:b,depth})=>b.kind==='group'&&!descendants.has(b.id)&&depth+1+height<=4);
}
export function moveBlockSibling(definition,block,delta) {
 const siblings=definition.blocks.filter(b=>(b.parentId||'')===(block.parentId||'')),index=siblings.findIndex(b=>b.id===block.id),target=siblings[index+delta];if(!target)return false;const a=definition.blocks.indexOf(block),b=definition.blocks.indexOf(target);[definition.blocks[a],definition.blocks[b]]=[definition.blocks[b],definition.blocks[a]];return true;
}
export function duplicateBlockTree(definition,id,uid) {
 const originals=blockSubtree(definition,id);if(definition.blocks.length+originals.length>40)throw new Error('Вместе с копией получится больше 40 блоков.');
 const mapping=new Map(originals.map(b=>[b.id,uid()])),copies=structuredClone(originals);
 const remapCondition=c=>{if(!c)return;if(c.source&&mapping.has(c.source))c.source=mapping.get(c.source);for(const child of c.conditions||[])remapCondition(child);};
 for(const b of copies){const old=b.id;b.id=mapping.get(old);if(mapping.has(b.parentId))b.parentId=mapping.get(b.parentId);if(mapping.has(b.source))b.source=mapping.get(b.source);remapCondition(b.visibility);if(old===id)b.title=Array.from(b.title||'Группа').slice(0,150).join('')+' · копия';}
 const last=Math.max(...originals.map(b=>definition.blocks.indexOf(b)));definition.blocks.splice(last+1,0,...copies);return mapping.get(id);
}
export function releaseGroupChildren(definition,group) {
 for(const b of definition.blocks)if(b.parentId===group.id)b.parentId=group.parentId||'';
}
