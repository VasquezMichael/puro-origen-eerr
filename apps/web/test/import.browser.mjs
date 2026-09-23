// Chromium with synthetic API fixtures only; never starts the API or connects to MongoDB.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {initialNodes,emptyAmount,loadProgress,importPlan} from '../../../packages/domain/dist/index.js';
import {createImportTemplate,readImportFile} from '../../api/dist/eerr/import/import-file.js';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser=await chromium.launch({executablePath:process.env.BROWSER_BINARY,headless:true});
const origin='http://127.0.0.1:3100',id='11111111-1111-4111-8111-111111111111',branchId='123456789012345678901234';
try {for(const [width,height] of [[1440,900],[1280,720],[1024,768],[768,1024],[390,844]]) {
 const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();await page.clock.setFixedTime(new Date('2026-09-23T12:00:00Z'));
 const nodes=initialNodes([],randomUUID);nodes.push({nodeId:randomUUID(),code:randomUUID(),kind:'ITEM',name:'Digitales',parentId:nodes[0].nodeId,position:0,amount:{...emptyAmount(),state:'CARGADO',input:'5+5',value:'10.00'},quantity:{state:'CARGADO',value:'0'},note:'Nota conservada'});
 let row={id,revision:5,note:'Nota general conservada',structure:{schemaVersion:1,structureVersion:1,initializedAt:'2026-09-01T12:00:00Z',initializedBy:'fixture',nodes},progress:loadProgress(nodes)},role='EDITOR',invalid=true,conflict=false,writes=0;
 const templateContext={id,branchName:'Sucursal ficticia',year:2026,month:9,revision:1,stamp:'fixture-stamp',structure:row.structure};
 const templates={csv:await createImportTemplate('csv',templateContext),xlsx:await createImportTemplate('xlsx',templateContext)};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();if(url.origin!=='http://localhost:3001'){errors.push('Unexpected external '+url.origin);return route.abort();}
 const headers={'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST,PATCH,OPTIONS','access-control-allow-headers':'content-type'};if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});let body,status=200;const path=url.pathname;
 if(path.endsWith('/import/template'))return route.fulfill({body:templates[url.searchParams.get('format')],headers});
 if(req.method()==='POST') {await new Promise(r=>setTimeout(r,300));assert.match(req.postDataBuffer().toString(),/filename="carga.csv"/);
 if(path.endsWith('/import/preview')){const plan=importPlan(row.structure,[{row:2,code:nodes[3].code,amount:'20+5',quantity:'3'}]);delete plan.changes;body={...plan,destination:{id,branchId,branchName:'Sucursal ficticia',year:2026,month:9},fileName:'carga.csv',format:'csv',warnings:['Las notas y la estructura se conservan.'],revision:row.revision,structuralRevision:1,previewToken:invalid?null:'fixture-preview',expiresAt:'2026-09-23T12:05:00Z',issues:invalid?[{row:3,field:'codigo_item',message:'Código desconocido'}]:[]};}
 else if(path.endsWith('/import/confirm')){assert.match(req.postDataBuffer().toString(),/fixture-preview/);if(conflict){status=409;body={message:'El EERR cambió; generá un nuevo preview.'};conflict=false;}else{writes++;row.structure.nodes[3].amount={...nodes[3].amount,input:'20+5',value:'25.00'};row.structure.nodes[3].quantity={state:'CARGADO',value:'3'};row.revision++;body={result:row,affectedItems:1,changedFields:2};}}
 else {errors.push('Unexpected write '+path);return route.abort();}}
 else if(path==='/auth/me')body={user:{name:'Persona',isAdmin:false,branchAccesses:[{branchId,role}]}};
 else if(path==='/branches')body=[{id:branchId,name:'Sucursal ficticia',active:true,startDate:'2020-01-01T03:00:00Z'}];
 else if(path===`/eerr/${id}`)body={id,branchId,year:2026,month:9,loadStatus:'CARGADO',createdAt:'2026-09-23T12:00:00Z'};
 else if(path.endsWith('/structure'))body=row;
 else {errors.push('Unexpected API '+path);return route.abort();}
 return route.fulfill({status,json:body,headers});});
 const dialog=page.getByRole('dialog',{name:'Importar valores'});
 const shot=async label=>{await page.screenshot({path:join(tmpdir(),`ep04c2-${width}-${label}.png`),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const box=await dialog.boundingBox();if(box)assert.ok(box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1);};
 await page.goto(`${origin}/eerr/${id}`);await page.getByRole('button',{name:'Importar archivo',exact:true}).click();
 for(const format of ['csv','xlsx']){const pending=page.waitForEvent('download');await dialog.getByRole('button',{name:'Descargar '+format.toUpperCase(),exact:true}).click();const download=await pending;const buffer=await readFile(await download.path());assert.equal((await readImportFile({buffer,originalname:download.suggestedFilename(),mimetype:format==='csv'?'text/csv':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})).rows.length,1);}
 await shot('selection');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Importar archivo');
 await page.getByRole('button',{name:'Importar archivo',exact:true}).click();await dialog.getByLabel('Archivo CSV o XLSX').setInputFiles({name:'carga.csv',mimeType:'text/csv',buffer:templates.csv});
 await dialog.getByRole('button',{name:'Generar vista previa'}).click();await dialog.getByText('No se puede confirmar: 1 errores').waitFor();assert.ok(await dialog.getByRole('button',{name:'Confirmar importación'}).isDisabled());assert.equal(writes,0);await shot('invalid');assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true);
 invalid=false;await dialog.getByRole('button',{name:'Generar vista previa'}).click();await dialog.getByRole('button',{name:'Confirmar importación'}).waitFor();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirmar importación')?.disabled);await dialog.locator('summary').click();await shot('preview');
 await page.keyboard.press('Escape');const discard=page.getByRole('dialog',{name:'Descartar importación pendiente'});await discard.waitFor();await discard.getByRole('button',{name:'Continuar importando'}).click();assert.match(await dialog.innerText(),/carga.csv/);
 conflict=true;await dialog.getByRole('button',{name:'Confirmar importación'}).click();await dialog.getByText('Vista previa desactualizada.',{exact:false}).waitFor();assert.match(await dialog.innerText(),/carga.csv/);assert.ok(await dialog.getByRole('button',{name:'Confirmar importación'}).isDisabled());await shot('conflict');
 await dialog.getByRole('button',{name:'Generar vista previa'}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Confirmar importación')?.disabled);await dialog.getByRole('button',{name:'Confirmar importación'}).click();assert.ok(await dialog.getByRole('button',{name:'Importando…'}).isDisabled());await dialog.waitFor({state:'hidden'});assert.equal(writes,1);assert.match(await page.locator('main').innerText(),/25,00 ARS/);
 role='READER';await page.reload();await page.getByRole('button',{name:'Descargar plantilla',exact:true}).click();assert.equal(await page.locator('input[type=file]').count(),0);assert.deepEqual(errors,[]);
 await context.close();console.log(`PASS import ${width}x${height}: descarga/reapertura CSV/XLSX, preview, errores, 409, descarte, foco, confirmación, permisos y geometría`);
}}finally{await browser.close();}
