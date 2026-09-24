import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// npm test compila primero con Nest. Node carga ESM real, sin transformar ni
// simular Mongoose. No se importa AppModule ni se instancian conexiones.
for (const [modulePath, exportName] of [
  ['eerr/analysis.service.js', 'AnalysisService'],
  ['eerr/analysis.controller.js', 'AnalysisController'],
  ['eerr/complete-pending.service.js', 'CompletePendingService'],
  ['eerr/complete-pending.controller.js', 'CompletePendingController'],
  ['eerr/import/import.service.js', 'ImportService'],
  ['eerr/import/import.controller.js', 'ImportController'],
  ['eerr/import/import-token.js', 'ImportToken'],
  ['eerr/clone.service.js', 'CloneService'],
  ['eerr/clone.controller.js', 'CloneController'],
  ['eerr/clone-preview-token.js', 'ClonePreviewToken'],
  ['eerr/structure.repository.js', 'StructureRepository'],
  ['eerr/structure.service.js', 'StructureService'],
  ['eerr/structure.controller.js', 'StructureController'],
  ['eerr/eerr.service.js', 'EerrService'],
  ['branches/branches.service.js', 'BranchesService'],
  ['users/users.service.js', 'UsersService'],
]) {
  test(`Node carga ${modulePath} compilado sin conexiones`, async () => {
    const loaded = await import(
      new URL(`../dist/${modulePath}`, import.meta.url)
    );
    assert.equal(typeof loaded[exportName], 'function');
  });
}
