import React,{useEffect,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import type {JobPreparation} from '../../types';
import {getPreparation} from '../../services/preparations';
import PortfolioRenderer from '../PortfolioRenderer';

export const PreparationPreviewView:React.FC=()=>{const{id=''}=useParams();const[item,setItem]=useState<JobPreparation|null>(null);const[error,setError]=useState('');useEffect(()=>{getPreparation(id).then(setItem).catch(error=>setError(error instanceof Error?error.message:'读取失败'));},[id]);if(!item)return <div className="min-h-screen bg-canvas p-8 text-center">{error||'正在加载预览…'}</div>;return <div className="relative"><Link to={`/preparations/${item.id}/home`} className="fixed left-5 top-5 z-50 rounded-full bg-black/80 px-5 py-2 text-sm text-white shadow-lg">← 返回编辑</Link><PortfolioRenderer document={item.document} themeId={item.themeId}/></div>};
export default PreparationPreviewView;
