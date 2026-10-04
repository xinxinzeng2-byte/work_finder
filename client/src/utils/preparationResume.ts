import type {AtomicExperience,AtomicSkill,JobPreparation,ParsedResume,PortfolioBlock} from '../types';

const list=(value:unknown):any[]=>Array.isArray(value)?value:[];
const text=(value:unknown):string=>typeof value==='string'?value.trim():'';

function skillsFromBlock(block:PortfolioBlock|undefined,source:ParsedResume):AtomicSkill[]{
  const groups=list(block?.data.groups);
  if(!groups.length)return source.skills;
  const existing=new Map(source.skills.map(skill=>[skill.name,skill]));
  return groups.flatMap((group,groupIndex)=>list(group.items).map((item,itemIndex)=>{const name=text(item);const previous=existing.get(name);return{id:previous?.id||`portfolio_skill_${groupIndex}_${itemIndex}`,category:text(group.category)||previous?.category||'专业能力',name,level:previous?.level||'熟悉',evidence:previous?.evidence||''};})).filter(skill=>skill.name);
}

function experiencesFromBlocks(blocks:PortfolioBlock[],source:ParsedResume):AtomicExperience[]{
  const sourceByRole=new Map(source.experiences.map(item=>[`${item.company}\u0000${item.role}`,item]));
  const result:AtomicExperience[]=[];
  blocks.forEach(block=>{
    if(block.type==='experience')list(block.data.items).forEach((item,index)=>{const company=text(item.company);const role=text(item.role);const previous=sourceByRole.get(`${company}\u0000${role}`);const achievements=list(item.highlights||item.achievements).map(text).filter(Boolean);const description=text(item.description);result.push({id:previous?.id||`portfolio_experience_${index}`,company,role,period:text(item.period),description,achievements,skillsUsed:previous?.skillsUsed||[],rawText:[description,...achievements].filter(Boolean).join('\n')});});
    if(block.type==='projects')list(block.data.items).forEach((item,index)=>{const achievements=list(item.results).map(text).filter(Boolean);const description=text(item.summary);result.push({id:`portfolio_project_${index}`,company:'代表项目',role:text(item.name)||'项目经历',period:'',description,achievements,skillsUsed:[],rawText:[description,...achievements].filter(Boolean).join('\n')});});
  });
  return result.length?result:source.experiences;
}

export function preparationToCustomizedResume(preparation:JobPreparation):ParsedResume{
  const source=preparation.sourceResumeSnapshot;
  const blocks=[...preparation.document.blocks].filter(block=>block.visible).sort((a,b)=>a.order-b.order);
  const education=blocks.find(block=>block.type==='education');
  const email=preparation.document.contacts.find(contact=>contact.kind==='email'&&contact.value.trim());
  const phone=preparation.document.contacts.find(contact=>contact.kind==='phone'&&contact.value.trim());
  const rawText=[preparation.document.identity.headline,preparation.document.identity.tagline,...blocks.map(block=>`${block.title}\n${JSON.stringify(block.data)}`)].filter(Boolean).join('\n\n');
  return{
    basicInfo:{...source.basicInfo,name:preparation.document.identity.name||source.basicInfo.name,email:email?.value||source.basicInfo.email,phone:phone?.value||source.basicInfo.phone,city:preparation.document.identity.location||source.basicInfo.city,education:text(education?.data.content)||source.basicInfo.education},
    skills:skillsFromBlock(blocks.find(block=>block.type==='skills'),source),
    experiences:experiencesFromBlocks(blocks,source),
    rawText,
  };
}
