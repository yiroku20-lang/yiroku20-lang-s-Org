
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { StatCardProps } from '../types';

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'gestion' | 'academica'>('gestion');
  
  // --- STATES FOR GESTION DOCUMENTAL ---
  const [stats, setStats] = useState<StatCardProps[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [loadingGestion, setLoadingGestion] = useState(true);

  // --- STATES FOR ANALITICA ACADEMICA ---
  const [loadingAcademica, setLoadingAcademica] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [academicStats, setAcademicStats] = useState<StatCardProps[]>([]);
  const [years, setYears] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [studentsByYear, setStudentsByYear] = useState<any[]>([]);
  const [studentsBySchool, setStudentsBySchool] = useState<any[]>([]);
  const [modalityTableData, setModalityTableData] = useState<any[]>([]);
  const [rawAcademicData, setRawAcademicData] = useState<any[]>([]);
  
  // Modality Comparison State
  const [allModalities, setAllModalities] = useState<string[]>([]);
  const [selectedModalities, setSelectedModalities] = useState<string[]>([]);

  useEffect(() => {
    fetchGestionStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'academica' && rawAcademicData.length === 0) {
        fetchAllAcademicData();
    }
  }, [activeTab]);

  useEffect(() => {
      if (rawAcademicData.length > 0) {
          processStats();
      }
  }, [selectedYears, selectedModalities, rawAcademicData]);

  // --- FETCHERS ---

  const fetchGestionStats = async () => {
    try {
      setLoadingGestion(true);
      
      const { data: incomingData, error: incomingError } = await supabase
        .from('expedientes')
        .select('id, status, created_at');
      if (incomingError) throw incomingError;

      const { data: outgoingData, error: outgoingError } = await supabase
        .from('expedientes_salida')
        .select('id, created_at');
      if (outgoingError) throw outgoingError;

      // Stats
      const pendingCount = incomingData.filter(i => i.status === 'Pendiente').length;
      const inProgressCount = incomingData.filter(i => i.status === 'En Progreso').length;
      const attendedCount = incomingData.filter(i => i.status === 'Atendido').length;
      const totalOutgoing = outgoingData.length;

      setStats([
        { title: 'PENDIENTES', value: pendingCount, icon: 'pending_actions', color: 'orange', subtext: 'Expedientes por atender' },
        { title: 'EN PROGRESO', value: inProgressCount, icon: 'hourglass_top', color: 'blue', subtext: 'En revisión o trámite' },
        { title: 'ATENDIDOS', value: attendedCount, icon: 'task_alt', color: 'green', subtext: 'Expedientes finalizados' },
        { title: 'SALIDAS', value: totalOutgoing, icon: 'outbox', color: 'purple', subtext: 'Documentos emitidos' },
      ]);

      // Status Chart
      const statusCounts = incomingData.reduce((acc: any, curr: any) => {
          acc[curr.status] = (acc[curr.status] || 0) + 1;
          return acc;
      }, {});
      setStatusData(Object.keys(statusCounts).map(key => ({ name: key, value: statusCounts[key] })));

      // Timeline Chart
      const last7Days = [...Array(7)].map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - i);
          return d.toISOString().split('T')[0];
      }).reverse();

      const timeline = last7Days.map(date => {
          const incomingCount = incomingData.filter(i => i.created_at.startsWith(date)).length;
          const outgoingCount = outgoingData.filter(o => o.created_at.startsWith(date)).length;
          return {
              date: new Date(date).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }),
              ingresos: incomingCount,
              salidas: outgoingCount
          };
      });
      setTimelineData(timeline);

    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGestion(false);
    }
  };

  const fetchAllAcademicData = async () => {
      setLoadingAcademica(true);
      setLoadingProgress(0);
      try {
          let allData: any[] = [];
          let from = 0;
          const step = 1000;
          let fetching = true;

          while (fetching) {
              const { data, error } = await supabase
                  .from('participantes')
                  .select('ANIO, CARRERA, MODALIDAD, NOTA')
                  .range(from, from + step - 1);
              
              if (error) throw error;
              
              if (data && data.length > 0) {
                  allData = [...allData, ...data];
                  from += step;
                  setLoadingProgress(allData.length);
              } else {
                  fetching = false;
              }

              if (data.length < step) fetching = false;
          }

          setRawAcademicData(allData);

          // Extract Years
          const uniqueYears = Array.from(new Set(allData.map(d => d.ANIO))).sort().reverse();
          setYears(uniqueYears);
          
          // Default select latest year
          if (uniqueYears.length > 0) {
              setSelectedYears([uniqueYears[0]]);
          }

          // Extract Modalities
          const uniqueModalities = Array.from(new Set(allData.map(d => d.MODALIDAD))).sort();
          setAllModalities(uniqueModalities);

      } catch (err) {
          console.error("Error fetching academic data", err);
      } finally {
          setLoadingAcademica(false);
      }
  };

  const processStats = () => {
      if (rawAcademicData.length === 0) return;

      // 1. Base Data: Filter by Year ONLY (Used for Table to keep all rows visible)
      const baseData = selectedYears.length > 0 
          ? rawAcademicData.filter(d => selectedYears.includes(d.ANIO))
          : rawAcademicData;

      // 2. Stats Data: Filter by Modality if selected (Used for KPIs and Charts)
      let statsData = baseData;
      if (selectedModalities.length > 0) {
          statsData = baseData.filter(d => selectedModalities.includes(d.MODALIDAD));
      }

      // --- KPIs & Charts (derived from statsData) ---
      const totalStudents = statsData.length;
      const avgScore = statsData.reduce((acc, curr) => acc + (parseFloat(curr.NOTA) || 0), 0) / (totalStudents || 1);
      
      // Group by Year
      const byYear = statsData.reduce((acc: any, curr: any) => {
          acc[curr.ANIO] = (acc[curr.ANIO] || 0) + 1;
          return acc;
      }, {});
      const chartYear = Object.keys(byYear).sort().map(y => ({ name: y, total: byYear[y] }));

      // Group by School
      const bySchool = statsData.reduce((acc: any, curr: any) => {
          acc[curr.CARRERA] = (acc[curr.CARRERA] || 0) + 1;
          return acc;
      }, {});
      const chartSchool = Object.keys(bySchool)
          .map(s => ({ name: s, total: bySchool[s] }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10); // Top 10

      // Top School
      const topSchool = chartSchool.length > 0 ? chartSchool[0].name : 'N/A';

      setAcademicStats([
          { title: 'INGRESANTES FILTRADOS', value: totalStudents, icon: 'groups', color: 'blue', subtext: 'Total en periodo seleccionado' },
          { title: 'PROMEDIO NOTAS', value: avgScore.toFixed(2), icon: 'analytics', color: 'purple', subtext: 'Rendimiento general' },
          { title: 'CARRERA MÁS DEMANDADA', value: topSchool, icon: 'school', color: 'orange', subtext: 'Mayor cantidad de ingresantes' },
      ]);

      setStudentsByYear(chartYear);
      setStudentsBySchool(chartSchool);

      // --- Modality Table (derived from baseData to show ALL options) ---
      const modalities = Array.from(new Set(baseData.map(d => d.MODALIDAD))).sort();
      const yearsToDisplay = selectedYears.length > 0 ? selectedYears.sort().reverse() : years.slice(0, 5);

      const pivotTable = modalities.map(modality => {
          const row: any = { modality };
          let totalRow = 0;
          yearsToDisplay.forEach(year => {
              const count = baseData.filter(d => d.MODALIDAD === modality && d.ANIO === year).length;
              row[year] = count;
              totalRow += count;
          });
          row['total'] = totalRow;
          return row;
      }).sort((a, b) => b.total - a.total);

      setModalityTableData({ rows: pivotTable, columns: yearsToDisplay });
  };

  const toggleYear = (year: string) => {
      setSelectedYears(prev => 
          prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
      );
  };

  const toggleModality = (modality: string) => {
      setSelectedModalities(prev => 
          prev.includes(modality) ? prev.filter(m => m !== modality) : [...prev, modality]
      );
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  return (
    <div className="flex flex-col gap-8 max-w-[1600px] mx-auto w-full p-6 md:p-8">
      
      {/* HEADER & TABS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 text-3xl md:text-4xl font-black leading-tight tracking-tight">
              Panel de Control
            </h1>
            <p className="text-slate-500 text-base">Sistema Integrado de Gestión de Admisión</p>
          </div>
          
          <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                  onClick={() => setActiveTab('gestion')}
                  className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'gestion' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                  Gestión Documental
              </button>
              <button 
                  onClick={() => setActiveTab('academica')}
                  className={`px-6 py-2 rounded-lg text-xs font-black uppercase transition-all ${activeTab === 'academica' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                  Analítica Académica
              </button>
          </div>
      </div>

      {/* CONTENT: GESTION DOCUMENTAL */}
      {activeTab === 'gestion' && (
          loadingGestion ? (
            <div className="flex-1 flex flex-col items-center justify-center p-20">
                <span className="material-symbols-outlined text-5xl text-primary animate-spin mb-4">progress_activity</span>
                <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Cargando métricas...</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {stats.map((stat, index) => (
                    <div key={index} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 hover:shadow-md transition-shadow">
                        <div className={`size-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${
                            stat.color === 'orange' ? 'bg-orange-50 text-orange-600' :
                            stat.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                            stat.color === 'green' ? 'bg-green-50 text-green-600' :
                            'bg-purple-50 text-purple-600'
                        }`}>
                            <span className="material-symbols-outlined">{stat.icon}</span>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.title}</p>
                            <p className="text-3xl font-black text-slate-900 mt-1">{stat.value.toLocaleString()}</p>
                            <p className="text-xs text-slate-500 mt-1 font-medium">{stat.subtext}</p>
                        </div>
                    </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-6">
                        <div>
                            <h3 className="text-lg font-black text-slate-900 uppercase">Actividad Reciente (7 Días)</h3>
                            <p className="text-xs text-slate-500 font-medium">Ingresos vs. Salidas</p>
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                    <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                    <Bar name="Ingresos" dataKey="ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                                    <Bar name="Salidas" dataKey="salidas" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={12} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-6">
                        <div>
                            <h3 className="text-lg font-black text-slate-900 uppercase">Estado de Expedientes</h3>
                            <p className="text-xs text-slate-500 font-medium">Carga laboral actual</p>
                        </div>
                        <div className="h-[300px] w-full flex items-center justify-center">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                                        {statusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.name === 'Pendiente' ? '#f59e0b' : entry.name === 'En Progreso' ? '#3b82f6' : entry.name === 'Atendido' ? '#10b981' : '#64748b'} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                                    <Legend iconType="circle" layout="vertical" verticalAlign="middle" align="right" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
          )
      )}

      {/* CONTENT: ANALITICA ACADEMICA */}
      {activeTab === 'academica' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              
              {/* FILTERS */}
              <div className="flex flex-col gap-4">
                  {/* Year Filter */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
                      <span className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Filtrar por Año:</span>
                      <div className="flex flex-wrap gap-2">
                          {years.map(year => (
                              <button
                                  key={year}
                                  onClick={() => toggleYear(year)}
                                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all border ${
                                      selectedYears.includes(year) 
                                      ? 'bg-primary text-white border-primary shadow-md shadow-primary/20' 
                                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                                  }`}
                              >
                                  {year}
                              </button>
                          ))}
                      </div>
                  </div>

                  {/* Modality Filter REMOVED */}
              </div>

              {loadingAcademica ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-20">
                    <span className="material-symbols-outlined text-5xl text-primary animate-spin mb-4">analytics</span>
                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Procesando datos académicos...</p>
                    <p className="text-slate-500 text-sm mt-2 font-medium">Cargando registros: {loadingProgress.toLocaleString()}</p>
                </div>
              ) : (
                  <>
                    {/* KPI CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {academicStats.map((stat, index) => (
                        <div key={index} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6">
                            <div className={`size-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 ${
                                stat.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                                stat.color === 'purple' ? 'bg-purple-50 text-purple-600' :
                                'bg-orange-50 text-orange-600'
                            }`}>
                                <span className="material-symbols-outlined">{stat.icon}</span>
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.title}</p>
                                <p className={`font-black text-slate-900 mt-1 truncate ${typeof stat.value === 'string' && stat.value.length > 15 ? 'text-xl' : 'text-3xl'}`} title={String(stat.value)}>{stat.value}</p>
                                <p className="text-xs text-slate-500 mt-1 font-medium">{stat.subtext}</p>
                            </div>
                        </div>
                        ))}
                    </div>

                    {/* CHARTS ROW 1 */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-6">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 uppercase">Ingresantes por Año</h3>
                                <p className="text-xs text-slate-500 font-medium">Evolución histórica de vacantes cubiertas</p>
                            </div>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={studentsByYear}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'bold'}} dy={10} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                                        <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={30} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-6">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 uppercase">Top 10 Escuelas Profesionales</h3>
                                <p className="text-xs text-slate-500 font-medium">Carreras con mayor ingreso en el periodo seleccionado</p>
                            </div>
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={studentsBySchool} layout="vertical" margin={{ left: 40 }}>
                                        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 9, fontWeight: 'bold'}} width={120} />
                                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                                        <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={15} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* TABLE: MODALITY VS YEAR */}
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-6">
                        <div>
                            <h3 className="text-lg font-black text-slate-900 uppercase">Distribución por Modalidad</h3>
                            <p className="text-xs text-slate-500 font-medium">Seleccione filas para comparar datos</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-100">
                                        <th className="py-3 px-4 w-10"></th>
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Modalidad</th>
                                        {modalityTableData.columns?.map((year: string) => (
                                            <th key={year} className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">{year}</th>
                                        ))}
                                        <th className="py-3 px-4 text-[10px] font-black text-slate-900 uppercase tracking-widest text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {modalityTableData.rows
                                        ?.sort((a: any, b: any) => {
                                            // Sort selected to top
                                            const aSelected = selectedModalities.includes(a.modality);
                                            const bSelected = selectedModalities.includes(b.modality);
                                            if (aSelected && !bSelected) return -1;
                                            if (!aSelected && bSelected) return 1;
                                            return b.total - a.total; // Default sort by total
                                        })
                                        .map((row: any, index: number) => {
                                            const isSelected = selectedModalities.includes(row.modality);
                                            return (
                                                <tr 
                                                    key={row.modality} 
                                                    className={`border-b border-slate-50 transition-colors cursor-pointer ${isSelected ? 'bg-purple-50 hover:bg-purple-100' : 'hover:bg-slate-50/50'}`}
                                                    onClick={() => toggleModality(row.modality)}
                                                >
                                                    <td className="py-3 px-4">
                                                        <div className={`size-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-purple-600 border-purple-600' : 'border-slate-300 bg-white'}`}>
                                                            {isSelected && <span className="material-symbols-outlined text-[10px] text-white font-bold">check</span>}
                                                        </div>
                                                    </td>
                                                    <td className={`py-3 px-4 text-xs font-bold ${isSelected ? 'text-purple-900' : 'text-slate-700'}`}>{row.modality}</td>
                                                    {modalityTableData.columns?.map((year: string) => (
                                                        <td key={year} className={`py-3 px-4 text-xs text-center font-medium ${isSelected ? 'text-purple-700' : 'text-slate-500'}`}>
                                                            {row[year] > 0 ? row[year].toLocaleString() : '-'}
                                                        </td>
                                                    ))}
                                                    <td className={`py-3 px-4 text-xs font-black text-right ${isSelected ? 'text-purple-900' : 'text-slate-900'}`}>{row.total.toLocaleString()}</td>
                                                </tr>
                                            );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                  </>
              )}
          </div>
      )}
    </div>
  );
};
