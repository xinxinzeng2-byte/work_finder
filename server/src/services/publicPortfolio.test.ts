import assert from 'node:assert/strict';
import {makePublicDocument,safePublicUrl} from './publicPortfolio';

const document={
  schemaVersion:1,
  identity:{name:'测试用户',headline:'产品经理',tagline:'解决真实问题'},
  blocks:[{id:'project',type:'projects',title:'项目经历',visible:true,order:0,data:{items:[{name:'项目',sourceId:'private-source'}]},sourceRefs:['private-source']}],
  contacts:[
    {id:'email',kind:'email',label:'邮箱',value:'public@example.com',public:true},
    {id:'phone',kind:'phone',label:'电话',value:'13800000000',public:false},
  ],
  primaryAction:{label:'联系我',contactId:'email'},
};

const restored=makePublicDocument(JSON.stringify(document));
assert.equal(restored.identity.name,'测试用户','应兼容 JSONB 中历史字符串化的主页内容');
assert.deepEqual(restored.contacts,[document.contacts[0]],'公开快照只应保留用户明确公开的联系方式');
assert.equal('sourceRefs' in restored.blocks[0],false,'公开快照不应包含来源引用');
assert.equal('sourceId' in restored.blocks[0].data.items[0],false,'嵌套来源引用也应移除');
assert.equal(safePublicUrl('https://example.com/profile'),'https://example.com/profile');
assert.equal(safePublicUrl('javascript:alert(1)'),'');
assert.throws(()=>makePublicDocument('not-json'),/格式无效/);

console.log('public portfolio tests passed');
