import React,{useEffect,useState} from 'react';
import {useParams} from 'react-router-dom';
import type {PublishedPortfolio} from '../../types';
import {loadPublishedPortfolio} from '../../services/preparations';
import PortfolioRenderer from '../PortfolioRenderer';

export const PublicPortfolioView:React.FC=()=>{const{slug=''}=useParams();const[item,setItem]=useState<PublishedPortfolio|null>(null);const[error,setError]=useState('');useEffect(()=>{let meta=document.querySelector('meta[name="robots"]') as HTMLMetaElement|null;if(!meta){meta=document.createElement('meta');meta.name='robots';document.head.appendChild(meta);}meta.content='noindex,nofollow';loadPublishedPortfolio(slug).then(value=>{setItem(value);document.title=`${value.document.identity.name} · ${value.document.identity.headline}`;}).catch(error=>setError(error instanceof Error?error.message:'页面不存在'));},[slug]);if(!item)return <main className="flex min-h-screen items-center justify-center bg-[#faf9f6] p-6 text-center"><div><div className="text-5xl">{error?'404':'✦'}</div><h1 className="mt-5 text-2xl">{error||'正在打开求职主页…'}</h1>{error&&<p className="mt-2 text-sm text-[#777]">请向分享者确认链接是否仍然有效。</p>}</div></main>;return <PortfolioRenderer document={item.document} themeId={item.themeId}/>};
export default PublicPortfolioView;
