'use client';
import {useState} from 'react';
import WorkoutForm from './WorkoutForm';
import type {WorkoutData,WorkoutRecord} from '@/lib/execution/workoutContracts';
export default function WorkoutRegisterButton({athlete,prescription,onSaved}:{athlete?:string;prescription?:WorkoutData['prescription'];onSaved?:(r:WorkoutRecord)=>void|Promise<void>}){
  const [open,setOpen]=useState(false);
  if(!athlete)return <a href="/entrenamientos/registrar">Registrar entreno</a>;
  return <div>{open?<WorkoutForm key={athlete} athlete={athlete} prescription={prescription} onClose={()=>setOpen(false)} onSaved={onSaved}/>
    :<button onClick={()=>setOpen(true)} style={{background:'#a84100',color:'#fff',border:0,borderRadius:10,padding:'12px 18px',fontSize:15,cursor:'pointer',margin:'12px 0'}}>Registrar entreno</button>}</div>;
}
