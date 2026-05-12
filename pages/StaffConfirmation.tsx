import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export const StaffConfirmation = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  
  const [loading, setLoading] = useState(true);
  const [sorteo, setSorteo] = useState<any>(null);
  const [proceso, setProceso] = useState<any>(null);
  const [errorStr, setErrorStr] = useState<string>('');
  
  const [action, setAction] = useState<'Confirmar'|'Rechazar'|null>(null);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (id) {
      fetchData();
    } else {
      setErrorStr('Enlace no válido. Falta el ID.');
      setLoading(false);
    }
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sorteoData, error: sorteoError } = await supabase
        .from('personal_sorteos')
        .select('*')
        .eq('id', id)
        .single();
      
      if (sorteoError || !sorteoData) {
        throw new Error('No se encontró el registro o fue eliminado.');
      }
      setSorteo(sorteoData);

      const { data: procData } = await supabase
        .from('personal_procesos')
        .select('nombre, descripcion')
        .eq('id', sorteoData.proceso_id)
        .single();

      if (procData) {
        setProceso(procData);
      }
    } catch (e: any) {
      setErrorStr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitAction = async (state: 'Confirmado' | 'Rechazado') => {
    if (state === 'Rechazado' && !motivo.trim()) {
        alert('Por favor ingrese un motivo breve para rechazar.');
        return;
    }
    setSaving(true);
    try {
        const payload: any = { estado_confirmacion: state };
        if (state === 'Rechazado') {
            payload.motivo_rechazo = motivo;
        }

        const { error } = await supabase
            .from('personal_sorteos')
            .update(payload)
            .eq('id', id);

        if (error) throw error;
        
        setSuccessMsg(`Tu participación ha sido ${state === 'Confirmado' ? 'Confirmada' : 'Rechazada'} exitosamente.`);
        setSorteo({ ...sorteo, estado_confirmacion: state, motivo_rechazo: state === 'Rechazado' ? motivo : null });
    } catch(e: any) {
        alert('Error: ' + e.message);
    } finally {
        setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
         <div className="animate-spin w-8 h-8 rounded-full border-4 border-slate-300 border-t-primary"></div>
      </div>
    );
  }

  if (errorStr) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
         <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border-t-4 border-t-red-500">
            <span className="material-symbols-outlined text-[48px] text-red-500 mb-4 block">error</span>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Error</h2>
            <p className="text-slate-600">{errorStr}</p>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:py-12 sm:px-6 lg:px-8 font-sans overflow-y-auto flex justify-center items-start">
      <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 mb-8 mt-4 sm:mt-auto sm:mb-auto">
          <div className="bg-primary p-6 md:p-8 text-center border-b-4 border-primary-dark">
              <h1 className="text-2xl font-black text-white tracking-tight">Confirmación de Participación</h1>
              <p className="text-primary-light text-sm font-medium mt-2">{proceso?.nombre || 'Proceso de Admisión'}</p>
          </div>
          
          <div className="p-6 md:p-8">
              {successMsg ? (
                  <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl text-center">
                      <span className="material-symbols-outlined text-[48px] text-emerald-500 mb-4 block">check_circle</span>
                      <h3 className="text-lg font-bold text-emerald-900 mb-2">¡Gracias por tu respuesta!</h3>
                      <p className="text-emerald-700 text-sm mt-1">{successMsg}</p>
                      <p className="text-slate-500 text-xs mt-6">Ya puedes cerrar esta ventana.</p>
                  </div>
              ) : (
                  <>
                      <div className="mb-8">
                          <p className="text-slate-700 text-base leading-relaxed">
                              Estimado(a) <strong className="text-slate-900 font-bold">{sorteo?.nombres}</strong>,<br/><br/>
                              Usted ha sido seleccionado(a) como <strong className="uppercase bg-slate-100 px-1.5 rounded">{sorteo?.condicion_sorteo}</strong> para el cargo de <strong className="text-primary font-bold">{sorteo?.cargo}</strong> en el proceso actual.
                          </p>
                          <p className="text-slate-600 text-sm mt-4 italic">
                              <strong>Nota importante:</strong> Su respuesta de confirmación o rechazo registrada por este medio es estricta responsabilidad personal y tiene carácter de declaración jurada frente a la institución.
                          </p>
                      </div>

                      {sorteo?.estado_confirmacion !== 'Pendiente' ? (
                          <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl text-center">
                              <span className="material-symbols-outlined text-[40px] text-slate-400 mb-2 block">info</span>
                              <h3 className="text-base font-bold text-slate-800">Ya has respondido a esta solicitud</h3>
                              <p className="text-slate-600 text-sm mt-2">
                                 Tu estado actual es: <strong className="uppercase">{sorteo?.estado_confirmacion}</strong>
                              </p>
                          </div>
                      ) : sorteo?.fecha_limite_confirmacion && new Date(sorteo.fecha_limite_confirmacion).getTime() < new Date().getTime() ? (
                          <div className="bg-orange-50 border border-orange-200 p-6 rounded-2xl text-center">
                              <span className="material-symbols-outlined text-[40px] text-orange-400 mb-2 block">timer_off</span>
                              <h3 className="text-base font-bold text-orange-900">El tiempo de confirmación ha concluido</h3>
                              <p className="text-orange-700 text-sm mt-2">
                                 Ya no es posible registrar su participación porque la fecha límite ha finalizado.
                              </p>
                          </div>
                      ) : (
                          <div className="flex flex-col gap-4">
                              <h3 className="font-bold text-slate-900 mb-2 text-center text-lg">¿Podrá participar en este proceso?</h3>
                              
                              <div className="grid grid-cols-2 gap-4">
                                  <button 
                                      onClick={() => submitAction('Confirmado')} 
                                      disabled={saving}
                                      className="py-4 px-2 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-all shadow-md hover:shadow-lg flex flex-col items-center gap-2 border-b-4 border-emerald-700 disabled:opacity-50"
                                  >
                                      <span className="material-symbols-outlined text-[32px]">task_alt</span>
                                      <span>SÍ, CONFIRMO</span>
                                  </button>

                                  <button 
                                      onClick={() => setAction('Rechazar')} 
                                      disabled={saving}
                                      className={`py-4 px-2 rounded-2xl font-bold transition-all flex flex-col items-center gap-2 border-b-4 ${action === 'Rechazar' ? 'bg-red-50 text-red-700 border-red-200 shadow-inner' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm'}`}
                                  >
                                      <span className="material-symbols-outlined text-[32px]">block</span>
                                      <span>NO PODRÉ</span>
                                  </button>
                              </div>

                              {action === 'Rechazar' && (
                                  <div className="mt-4 p-5 bg-red-50 border border-red-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                                      <label className="block text-sm font-bold text-red-900 mb-2">Por favor, indícanos el motivo brevemente (Opcional pero recomendado):</label>
                                      <textarea 
                                          value={motivo} 
                                          onChange={e => setMotivo(e.target.value)} 
                                          className="w-full border border-red-200 bg-white rounded-xl p-3 text-sm focus:ring-2 focus:ring-red-400 outline-none min-h-[80px] mb-3"
                                          placeholder="Ej: Problemas de salud, viaje programado, cruce de horarios..."
                                      ></textarea>
                                      <div className="flex gap-2 justify-end">
                                        <button onClick={() => setAction(null)} className="px-4 py-2 rounded-lg text-sm font-bold text-red-700 hover:bg-red-100">Cancelar</button>
                                        <button onClick={() => submitAction('Rechazado')} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-bold disabled:opacity-50 shadow-sm flex items-center gap-2">
                                            {saving ? 'Enviando...' : 'Confirmar Rechazo'}
                                        </button>
                                      </div>
                                  </div>
                              )}
                          </div>
                      )}
                  </>
              )}
          </div>
          <div className="bg-slate-100 p-4 text-center text-xs text-slate-500 font-medium">
              Universidad Nacional de San Antonio Abad del Cusco<br/>Dirección de Admisión
          </div>
      </div>
    </div>
  );
};
