import assert from 'node:assert/strict';
import { validateInterviewQuestions, validatePortfolioBlockData, validatePortfolioDocument, validateThemeId } from './portfolioValidation';

const document=validatePortfolioDocument({
  schemaVersion:1,
  direction:'B 端产品经理',
  identity:{name:'测试用户',headline:'产品经理',tagline:'用真实经历说明价值'},
  blocks:[{id:'experience',type:'experience',title:'工作经历',visible:true,order:0,data:{items:[]},sourceRefs:['resume-exp-1']}],
  contacts:[{id:'email',kind:'email',label:'邮箱',value:'me@example.com',public:false}],
  primaryAction:{label:'联系我'},
});
assert.equal(document.blocks[0].type,'experience');
assert.equal(validateThemeId('enterprise-tech'),'enterprise-tech');
assert.deepEqual(validatePortfolioBlockData({items:['真实经历']}),{items:['真实经历']});
assert.throws(()=>validatePortfolioDocument({...document,primaryAction:{label:'点击',href:'javascript:alert(1)'}}),/链接仅支持/);
assert.throws(()=>validatePortfolioDocument({...document,blocks:[{...document.blocks[0],type:'script'}]}),/未知区块/);
assert.throws(()=>validateThemeId('unknown'),/未知的主题/);
assert.equal(validateInterviewQuestions([{id:'q1',category:'role',question:'请介绍你自己',rationale:'岗位高频',starred:true,answerNote:''}])[0].starred,true);
assert.throws(()=>validateInterviewQuestions([{id:'q2',category:'private',question:'x'}]),/分类无效/);

console.log('portfolio validation tests passed');
