import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User } from '../types';

export const DataCleanup = ({ user }: { user: User }) => {
  const [selectedField, setSelectedField] = useState<'CARRERA' | 'MODALIDAD' | 'FILIAL'>('CARRERA');
  const [selectedYear, setSelectedYear] = useState<string>('Todos');
  const [years, setYears] = useState<string[]>([]);
  const [dataStats, setDataStats] = useState<{ value: string; count: number }[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);
  
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<string>('');
  const [updating, setUpdating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{type: 'success' | 'error' | 'info', text: string} | null>(null);

  const [selectedCode, setSelectedCode] = useState<string>(''); // For the input if they want to edit the suggested code

  // References for suggestions
  const [carrerasData, setCarrerasData] = useState<{nombre: string, codigo_carrera: string}[]>([]);
  const [modalidadesRef, setModalidadesRef] = useState<string[]>([]);

  useEffect(() => {
      const fetchRefs = async () => {
          try {
              const { data: escData } = await supabase.from('cv_escuelas').select('nombre, codigo_carrera');
              if (escData) {
                  // Keep the actual objects for the data
                  setCarrerasData(escData);
              }
              
              const { data: modData } = await supabase.from('cv_modalidades').select('nombre');
              if (modData) setModalidadesRef(Array.from(new Set(modData.map(m => m.nombre.toUpperCase()))).sort());
          } catch (e) {
              console.error("Refs error", e);
          }
      };
      fetchRefs();
  }, []);

  const fetchYears = async () => {
     setLoadingYears(true);
     try {
         // Pagination to get all years
         let allYears: any[] = [];
         let start = 0;
         let step = 1000;
         let hasMore = true;
         while(hasMore) {
             const { data, error } = await supabase.from('participantes').select('ANIO').range(start, start + step - 1);
             if (error) break;
             if (data && data.length > 0) {
                 allYears.push(...data.map(d => d.ANIO).filter(Boolean));
                 if (data.length < step) hasMore = false;
                 else start += step;
             } else {
                 hasMore = false;
             }
         }
         const uniqueYears = Array.from(new Set(allYears)).sort((a: any, b: any) => b - a);
         setYears(uniqueYears as string[]);
     } finally {
         setLoadingYears(false);
     }
  };

  useEffect(() => {
     fetchYears();
  }, []);

  const fetchDataStats = async () => {
      setLoading(true);
      setDataStats([]);
      try {
          const counts: Record<string, number> = {};
          let start = 0;
          let step = 1000;
          let hasMore = true;
          
          while(hasMore) {
              let query = supabase.from('participantes').select(selectedField).range(start, start + step - 1);
              if (selectedYear !== 'Todos') {
                 query = query.eq('ANIO', selectedYear);
              }
              const { data, error } = await query;
              if (error) throw error;
              if (data && data.length > 0) {
                  data.forEach(d => {
                      const val = d[selectedField];
                      // Trim strictly, treat completely empty or whitespace as SIN ASIGNAR
                      const normalizedVal = (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) ? 'SIN ASIGNAR' : String(val);
                      counts[normalizedVal] = (counts[normalizedVal] || 0) + 1;
                  });
                  if (data.length < step) hasMore = false;
                  else start += step;
              } else {
                  hasMore = false;
              }
          }
          
          const statsArray = Object.entries(counts).map(([v, c]) => ({ value: v, count: c }));
          statsArray.sort((a, b) => {
              if (a.value === 'SIN ASIGNAR') return 1;
              if (b.value === 'SIN ASIGNAR') return -1;
              return b.count - a.count; // Sort by count descending
          });
          setDataStats(statsArray);
      } catch (err: any) {
          setAlertMessage({ type: 'error', text: 'Error: ' + err.message });
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      fetchDataStats();
      setReplaceTarget(null);
      setNewValue('');
  }, [selectedField, selectedYear]);

  // Normalize string for comparison (remove accents)
  const normalizeForMatch = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

  const handleSelectTarget = (targetVal: string) => {
      setReplaceTarget(targetVal);
      if (targetVal === 'SIN ASIGNAR') {
          setNewValue('');
          setSelectedCode('');
          return;
      }
      
      const normalizedTarget = normalizeForMatch(targetVal);
      // Try to find a match (exact after normalization)
      if (selectedField === 'CARRERA') {
          const suggestion = carrerasData.find(r => normalizeForMatch(r.nombre) === normalizedTarget);
          if (suggestion) {
              setNewValue(suggestion.nombre.toUpperCase());
              setSelectedCode(suggestion.codigo_carrera || '');
          } else {
              setNewValue(targetVal); // fallback to same
              setSelectedCode('');
          }
      } else {
          const refs = selectedField === 'MODALIDAD' ? modalidadesRef : [];
          const suggestion = refs.find(r => normalizeForMatch(r) === normalizedTarget);
          
          if (suggestion) {
              setNewValue(suggestion);
          } else {
              setNewValue(targetVal); // fallback to same
          }
          setSelectedCode('');
      }
  };

  const handleUpdateClick = () => {
      if (!replaceTarget || newValue.trim() === '') {
          setAlertMessage({ type: 'error', text: 'Por favor, selecciona un registro y escribe el nuevo valor.' });
          return;
      }
      setShowConfirmModal(true);
  };

  const executeUpdate = async () => {
      setShowConfirmModal(false);
      setUpdating(true);
      const targetIsUnassigned = replaceTarget === 'SIN ASIGNAR';
      try {
          const updateData: any = { [selectedField]: newValue };
          
          if (selectedField === 'CARRERA' && selectedCode.trim() !== '') {
             updateData.codigo_carrera = selectedCode;
          }

          let updateQuery = supabase.from('participantes').update(updateData);
          
          if (targetIsUnassigned) {
              updateQuery = updateQuery.or(`${selectedField}.is.null,${selectedField}.eq.,${selectedField}.eq. `);
          } else {
              updateQuery = updateQuery.eq(selectedField, replaceTarget);
          }

          if (selectedYear !== 'Todos') {
              updateQuery = updateQuery.eq('ANIO', selectedYear);
          }

          const { error, count } = await updateQuery.select('id');
          if (error) throw error;

          setAlertMessage({ type: 'success', text: `¡Actualización completa! Se actualizaron correctamente los registros a "${newValue}".` });
          setReplaceTarget(null);
          setNewValue('');
          fetchDataStats();
      } catch (err: any) {
          console.error("Update Error: ", err);
          setAlertMessage({ type: 'error', text: 'Error al actualizar: ' + err.message });
      } finally {
          setUpdating(false);
      }
  };

  if (user.role !== 'Administrador') {
    return <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest animate-pulse">Acceso Denegado</div>;
  }

  return (
    <div className="h-full flex flex-col pt-4 md:p-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col gap-1 mb-8 px-4 md:px-0 shrink-0">
        <h1 className="text-xl md:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-3xl md:text-4xl">cleaning_services</span>
          Limpieza y Homologación de Datos
        </h1>
        <p className="text-xs md:text-sm text-slate-500 font-medium">
          Identifica nombres mal escritos, errores tipográficos, tildes (ejm: INGENIERÍA vs INGENIERIA) y unifica los términos para evitar datos duplicados en reportes.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 h-full min-h-0 overflow-hidden px-4 md:px-0 pb-4 md:pb-0">
        
        {/* Panel Izquierdo: Controles y Lista */}
        <div className="w-full md:w-2/3 flex flex-col gap-4 min-h-0 shrink-0">
          <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm shrink-0">
            <div className="flex-1">
              <label className="block text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Campo a Analizar</label>
              <select 
                value={selectedField}
                onChange={(e) => setSelectedField(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
              >
                <option value="CARRERA">CARRERA / ESCUELA</option>
                <option value="MODALIDAD">MODALIDAD DE INGRESO</option>
                <option value="FILIAL">FILIAL</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Filtro de Año</label>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
              >
                <option value="Todos">Todos los Años (Global)</option>
                {loadingYears ? <option disabled>Cargando años...</option> : years.map(y => (
                    <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
                <button 
                  onClick={fetchDataStats}
                  disabled={loading}
                  className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all h-10 w-full sm:w-auto"
                >
                  <span className="material-symbols-outlined text-[18px]">refresh</span>
                  {loading ? 'Analizando...' : 'Analizar'}
                </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 flex-1 relative">
            {loading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
                    <span className="material-symbols-outlined text-primary animate-spin text-4xl mb-4">refresh</span>
                    <p className="font-bold text-slate-600">Escaneando miles de registros...</p>
                    <p className="text-xs text-slate-400">Agrupando valores únicos, por favor espere.</p>
                </div>
            )}
            
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
               <h3 className="font-black text-slate-700 text-xs uppercase tracking-widest flex items-center gap-2">
                 <span className="material-symbols-outlined text-[16px] text-slate-400">list_alt</span>
                 Valores Encontrados ({dataStats.length})
               </h3>
               <span className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-500 font-bold uppercase tracking-widest shadow-sm">
                 {selectedYear === 'Todos' ? 'Histórico Global' : `Año ${selectedYear}`}
               </span>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-2">
                {dataStats.length === 0 && !loading && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
                        <p className="text-sm font-medium">No se encontraron datos.</p>
                    </div>
                )}
                <div className="flex flex-col gap-1">
                    {dataStats.map((item, idx) => (
                        <button 
                          key={idx}
                          onClick={() => handleSelectTarget(item.value)}
                          className={`w-full text-left flex justify-between items-center p-3 rounded-xl border transition-all ${replaceTarget === item.value ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20' : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'}`}
                        >
                           <div className="flex items-center gap-3 overflow-hidden">
                               <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${replaceTarget === item.value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                                 <span className="material-symbols-outlined text-sm">
                                     {item.value === 'SIN ASIGNAR' ? 'warning' : 'label'}
                                 </span>
                               </div>
                               <span className={`text-xs font-bold truncate ${item.value === 'SIN ASIGNAR' ? 'text-red-500 italic' : 'text-slate-700'}`}>
                                  {item.value}
                               </span>
                           </div>
                           <div className="flex flex-col items-end shrink-0 pl-2">
                               <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest">
                                  {item.count} REG.
                               </span>
                           </div>
                        </button>
                    ))}
                </div>
            </div>
          </div>
        </div>

        {/* Panel Derecho: Editor de Homologación */}
        <div className="w-full md:w-1/3 flex flex-col gap-4 shrink-0 overflow-y-auto">
           <div className={`bg-white p-5 rounded-2xl border shadow-sm transition-all duration-500 ${replaceTarget ? 'border-primary/40 ring-4 ring-primary/5' : 'border-slate-200 opacity-60'}`}>
              <div className="flex items-center gap-3 mb-6">
                 <div className={`size-10 rounded-xl flex items-center justify-center ${replaceTarget ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-slate-100 text-slate-400'}`}>
                    <span className="material-symbols-outlined">edit_note</span>
                 </div>
                 <div>
                    <h2 className="font-black text-slate-800 uppercase tracking-tight text-sm">Ejecutar Corrección</h2>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Aplicar parche global</p>
                 </div>
              </div>

              {!replaceTarget ? (
                  <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                     <span className="material-symbols-outlined text-slate-300 text-4xl mb-2">touch_app</span>
                     <p className="text-xs font-medium text-slate-500">Selecciona un valor de la lista de la izquierda para corregirlo.</p>
                  </div>
              ) : (
                  <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4">
                      
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800">
                         <p className="text-xs font-bold mb-1 flex items-center gap-1">
                             <span className="material-symbols-outlined text-sm">info</span>
                             Valor Actual Seleccionado:
                         </p>
                         <p className={`text-sm font-black break-words ${replaceTarget === 'SIN ASIGNAR' ? 'italic' : ''}`}>
                             {replaceTarget}
                         </p>
                         <p className="text-[10px] mt-2 font-bold uppercase tracking-widest opacity-70">
                             Afectará a {dataStats.find(d => d.value === replaceTarget)?.count || 0} registros
                             {selectedYear !== 'Todos' && ` del año ${selectedYear}`}.
                         </p>
                      </div>

                      <div className="flex flex-col gap-1.5 mt-2">
                         <label className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                             Nuevo Valor Correcto
                         </label>
                         <div className="relative">
                             <input 
                               type="text" 
                               value={newValue}
                               onChange={e => setNewValue(e.target.value.toUpperCase())}
                               list="suggestionsList"
                               className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl px-4 py-3 pl-10 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all uppercase"
                               placeholder="Ej. INGENIERÍA CIVIL"
                             />
                             <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                                spellcheck
                             </span>
                             <datalist id="suggestionsList">
                                 {selectedField === 'CARRERA' && Array.from(new Set(carrerasData.map(c => c.nombre.toUpperCase()))).sort().map(c => <option key={c} value={c} />)}
                                 {selectedField === 'MODALIDAD' && modalidadesRef.map(m => <option key={m} value={m} />)}
                             </datalist>
                         </div>
                         <p className="text-[10px] text-slate-500 mt-1 pl-1">El valor será convertido a MAYÚSCULAS automáticamente.</p>
                      </div>

                      {selectedField === 'CARRERA' && (
                          <div className="flex flex-col gap-1.5 mt-2">
                             <label className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                                 Asignar Código de Escuela
                             </label>
                             <div className="relative">
                                 <input 
                                   type="text" 
                                   value={selectedCode}
                                   onChange={e => setSelectedCode(e.target.value)}
                                   className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl px-4 py-3 pl-10 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all uppercase"
                                   placeholder="Ej. 12"
                                 />
                                 <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                                    tag
                                 </span>
                             </div>
                             <p className="text-[10px] text-slate-500 mt-1 pl-1">Se guardará en la tabla participantes. Déjalo en blanco si no aplica.</p>
                          </div>
                      )}

                      <button 
                         onClick={handleUpdateClick}
                         disabled={updating || newValue.trim() === '' || (newValue === replaceTarget && (selectedField !== 'CARRERA' || selectedCode === ''))}
                         className="mt-4 w-full bg-slate-900 hover:bg-black disabled:opacity-50 text-white font-black py-4 px-4 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl shadow-slate-900/10 active:scale-[0.98]"
                      >
                         {updating ? (
                             <>
                               <span className="material-symbols-outlined animate-spin text-[18px]">refresh</span>
                               Ejecutando Parche...
                             </>
                         ) : (
                             <>
                               <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
                               Aplicar Corrección Masiva
                             </>
                         )}
                      </button>
                      
                      {newValue === replaceTarget && replaceTarget !== 'SIN ASIGNAR' && (selectedField !== 'CARRERA' || selectedCode === '') && (
                          <p className="text-center text-[10px] text-red-500 font-bold mt-2">
                              El nuevo valor es idéntico al actual.
                          </p>
                      )}
                  </div>
              )}
           </div>
           
           <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-500 shrink-0">tips_and_updates</span>
              <div className="flex flex-col gap-1">
                 <p className="text-xs font-black text-blue-900">Consejo de Uso Seguro</p>
                 <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                    Antes de estandarizar una Escuela Profesional o Modalidad a lo largo de <b>Todos los Años</b>, asegúrate de que el cambio sea retroactivo. Si una carrera tenía otro nombre oficial en 2008 (ej. Administrativas vs Empresas), usa el <b>Filtro de Año</b> para arreglar solo errores de tipeo de ese año manteniendo el nombre histórico oficial.
                 </p>
              </div>
           </div>
        </div>

      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
             <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-5 animate-in zoom-in-95">
                <div className="flex flex-col gap-2 relative">
                    <button onClick={() => setShowConfirmModal(false)} className="absolute -top-2 -right-2 text-slate-400 hover:text-slate-600 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                    <div className="size-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-2">
                        <span className="material-symbols-outlined text-2xl">warning</span>
                    </div>
                    <h3 className="text-lg font-black text-slate-800 leading-tight">¿Confirmar Acción?</h3>
                    <p className="text-sm text-slate-600 font-medium">
                        Estás a punto de homologar: <br/>
                        <strong className="text-slate-800">{replaceTarget === 'SIN ASIGNAR' ? 'Datos Vacíos' : replaceTarget}</strong> 
                        <span className="text-primary font-bold"> {" => "} {newValue}</span>
                    </p>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-red-500 mt-2 bg-red-50 p-2 rounded-lg">
                        {dataStats.find(d => d.value === replaceTarget)?.count || 0} registros serán afectados permanentemente.
                    </p>
                </div>
                <div className="flex gap-3 mt-2">
                    <button onClick={() => setShowConfirmModal(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all">
                        Cancelar
                    </button>
                    <button onClick={executeUpdate} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20 active:scale-[0.98]">
                        <span className="material-symbols-outlined text-[18px]">done_all</span>
                        Confirmar
                    </button>
                </div>
             </div>
          </div>
      )}

      {/* Alert Overlay */}
      {alertMessage && (
          <div className="fixed bottom-6 inset-x-0 mx-auto w-[90%] max-w-sm z-50 flex justify-center animate-in slide-in-from-bottom-5">
              <div className={`p-4 rounded-xl shadow-2xl border flex items-center gap-3 w-full pr-12 relative ${alertMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                   <span className="material-symbols-outlined shrink-0 text-3xl">
                       {alertMessage.type === 'success' ? 'check_circle' : 'error'}
                   </span>
                   <p className="text-sm font-bold leading-tight flex-1">{alertMessage.text}</p>
                   <button onClick={() => setAlertMessage(null)} className="absolute right-4 text-inherit/50 hover:text-inherit/80 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                   </button>
              </div>
          </div>
      )}
    </div>
  );
};
