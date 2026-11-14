import test from 'node:test';
import assert from 'node:assert/strict';
import {availableReports,reportKinds,reportLabels} from './reports.ts';
import {navigation,mobileModuleAccess} from './workspace.ts';
test('all reporting views have labels and deterministic capability sets',()=>{assert.equal(new Set(reportKinds).size,9);for(const k of reportKinds)assert.ok(reportLabels[k]);assert.deepEqual(availableReports({scope:'SHOP',permissions:['shop.orders.read','shop.stocks.read','shop.collections.read']}),['overview','orders','stocks','collections']);});
test('stock, shop and courier reporting integrates into existing navigation',()=>{for(const [portal,scope,p] of [['stock','AGENCY','stocks.read'],['livreur','AGENCY','collections.self.read'],['boutique','SHOP','shop.orders.read']]){const c={portal,scope,key:'test',permissions:['workspace.access',p]};assert.equal(navigation(c).filter(x=>x.id==='rapports').length,1);assert.ok(mobileModuleAccess(c,'rapports'));}});
test('report navigation does not appear without workspace or read permission',()=>{assert.ok(!navigation({portal:'livreur',scope:'AGENCY',key:'t',permissions:['workspace.access']}).some(m=>m.id==='rapports'));assert.ok(!navigation({portal:'stock',scope:'AGENCY',key:'t',permissions:['stocks.read']}).some(m=>m.id==='rapports'));});
