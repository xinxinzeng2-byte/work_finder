import React from 'react';
import type { PortfolioBlock, PortfolioContact, PortfolioDocument, ThemeId } from '../types';
import './portfolio.css';

const array=(value:unknown):any[]=>Array.isArray(value)?value:[];
const value=(input:unknown)=>typeof input==='string'?input:'';

function contactHref(contact?:PortfolioContact):string|undefined{
  if(!contact)return undefined;
  if(contact.kind==='email')return `mailto:${contact.value}`;
  if(contact.kind==='phone')return `tel:${contact.value}`;
  if(['website','github','linkedin'].includes(contact.kind)&&/^https?:\/\//i.test(contact.value))return contact.value;
  return '#contact';
}

const BlockView:React.FC<{block:PortfolioBlock}>=({block})=>{
  const data=block.data;
  if(block.type==='advantages')return <section className="pf-section"><p className="pf-kicker">WHAT I BRING</p><h2>{block.title}</h2><div className="pf-advantages">{array(data.items).map((item,index)=><article key={index}><span>{String(index+1).padStart(2,'0')}</span><p>{value(item)}</p></article>)}</div></section>;
  if(block.type==='projects')return <section className="pf-section"><p className="pf-kicker">SELECTED WORK</p><h2>{block.title}</h2><div className="pf-projects">{array(data.items).map((item,index)=><article key={index}><div><small>CASE {String(index+1).padStart(2,'0')}</small><h3>{value(item.name)}</h3></div><p>{value(item.summary)}</p>{array(item.results).length>0&&<ul>{array(item.results).map((result,i)=><li key={i}>{value(result)}</li>)}</ul>}</article>)}</div></section>;
  if(block.type==='experience')return <section className="pf-section"><p className="pf-kicker">EXPERIENCE</p><h2>{block.title}</h2><div className="pf-timeline">{array(data.items).map((item,index)=><article key={index}><div className="pf-period">{value(item.period)}</div><div><h3>{value(item.role)}</h3><h4>{value(item.company)}</h4><p>{value(item.description)}</p>{array(item.highlights||item.achievements).length>0&&<ul>{array(item.highlights||item.achievements).map((point,i)=><li key={i}>{value(point)}</li>)}</ul>}</div></article>)}</div></section>;
  if(block.type==='skills')return <section className="pf-section"><p className="pf-kicker">CAPABILITIES</p><h2>{block.title}</h2><div className="pf-skills">{array(data.groups).map((group,index)=><article key={index}><h3>{value(group.category)||'专业能力'}</h3><div>{array(group.items).map((skill,i)=><span key={i}>{value(skill)}</span>)}</div></article>)}</div></section>;
  if(block.type==='education')return <section className="pf-section pf-education"><p className="pf-kicker">EDUCATION</p><h2>{block.title}</h2><p>{value(data.content)}</p></section>;
  if(block.type==='contact')return <section className="pf-section pf-contact"><p className="pf-kicker">LET'S TALK</p><h2>{value(data.heading)||block.title}</h2><p>{value(data.description)}</p></section>;
  return null;
};

export const PortfolioRenderer:React.FC<{document:PortfolioDocument;themeId:ThemeId;preview?:boolean}>=({document,themeId,preview=false})=>{
  const contacts=(document.contacts||[]).filter(item=>item.public);
  const actionContact=contacts.find(item=>item.id===document.primaryAction?.contactId)||contacts[0];
  const href=document.primaryAction?.href||contactHref(actionContact);
  return <main className={`portfolio theme-${themeId}${preview?' is-preview':''}`}>
    <nav className="pf-nav"><strong>{document.identity.name}</strong><span>{document.direction}</span></nav>
    <header className="pf-hero"><p className="pf-kicker">HELLO, I'M</p><h1>{document.identity.name}</h1><div className="pf-headline">{document.identity.headline}</div><p className="pf-tagline">{document.identity.tagline}</p><div className="pf-hero-meta">{document.identity.location&&<span>{document.identity.location}</span>}<span>开放新的职业机会</span></div>{href&&<a className="pf-action" href={href} target={href.startsWith('http')?'_blank':undefined} rel="noreferrer">{document.primaryAction?.label||'联系我'} <span>↗</span></a>}</header>
    <div className="pf-body">{[...(document.blocks||[])].filter(block=>block.visible&&block.type!=='hero').sort((a,b)=>a.order-b.order).map(block=><BlockView key={block.id} block={block}/>)}</div>
    {contacts.length>0&&<footer id="contact" className="pf-footer"><strong>{document.identity.name}</strong><div>{contacts.map(contact=>{const contactLink=contactHref(contact);return contactLink&&contactLink!=='#contact'?<a key={contact.id} href={contactLink} target={contactLink.startsWith('http')?'_blank':undefined} rel="noreferrer">{contact.label}</a>:<span key={contact.id}>{contact.label}：{contact.value}</span>;})}</div><small>由 AI 求职助手生成 · 内容经本人确认</small></footer>}
  </main>;
};

export default PortfolioRenderer;
