'use client';
import {useState} from 'react';
import AuthenticatedSurface from '../../auth/AuthenticatedSurface';
import WorkoutForm from '@/components/WorkoutForm';
function Registration({athlete}:{athlete:string}){
  const [open,setOpen]=useState(true);
  return <main style={{maxWidth:640,margin:'0 auto',padding:20,color:'#f0ede8'}}>
    <a href="/hoy">Hoy</a> · <a href="/historia">Historial</a>
    {open?<WorkoutForm key={athlete} athlete={athlete} onClose={()=>setOpen(false)}/>:<button onClick={()=>setOpen(true)}>Registrar otro entrenamiento</button>}
  </main>;
}
export default function RegisterWorkoutPage(){return <AuthenticatedSurface unauthenticated={<main style={{maxWidth:600,margin:'0 auto',padding:32}}>
  <h1>Guarda tus entrenamientos con una cuenta gratuita</h1>
  <p>Para registrar entrenos y consultar, editar o eliminar tu historial, crea una cuenta gratuita o inicia sesión. No necesitas una suscripción de pago.</p>
  <a href="/auth">Crear cuenta gratuita o iniciar sesión</a>
</main>}>{codigo=><Registration key={codigo} athlete={codigo}/>}</AuthenticatedSurface>;}
