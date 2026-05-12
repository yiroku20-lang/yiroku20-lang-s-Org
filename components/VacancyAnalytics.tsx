import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ToastMessage } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';

interface VacancyAnalyticsProps {
  onBack: () => void;
  notify: (msg: string, type?: ToastMessage['type']) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#f43f5e'];

export const VacancyAnalytics: React.FC<VacancyAnalyticsProps> = ({ onBack, notify }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [filterArea, setFilterArea] = useState<string>('Todas');
  
  const [isYearsDropdownOpen, setIsYearsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsYearsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const { data: cuadros, error: errCuadros } = await supabase.from('cv_cuadros_anuales').select('*').eq('estado', 'Aprobado');
      if (errCuadros) throw errCuadros;

      if (!cuadros || cuadros.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const cuadroIds = cuadros.map(c => c.id);
      const { data: modalidades, error: errMods } = await supabase.from('cv_modalidades').select('*').in('cuadro_id', cuadroIds);
      if (errMods) throw errMods;

      const modIds = modalidades?.map(m => m.id) || [];
      const { data: vacantes, error: errVac } = await supabase.from('cv_vacantes').select('*').in('modalidad_id', modIds);
      if (errVac) throw errVac;

      const { data: escuelas, error: errEsc } = await supabase.from('cv_escuelas').select('*');
      if (errEsc) throw errEsc;

      const combinedData = vacantes?.map(v => {
        const mod = modalidades?.find(m => m.id === v.modalidad_id);
        const esc = escuelas?.find(e => e.id === v.escuela_id);
        const cuadro = cuadros.find(c => c.id === mod?.cuadro_id);

        return {
          anio: cuadro?.anio || 'Desconocido',
          escuela: esc?.nombre || 'Desconocido',
          area: esc?.area || 'Desconocida',
          cantidad: v.cantidad || 0
        };
      }) || [];

      setData(combinedData);
      
      // Initialize selected years with all available years
      const availableYears = Array.from(new Set(combinedData.map(d => d.anio))).sort();
      setSelectedYears(availableYears);

    } catch (err: any) {
      notify('Error al cargar estadísticas: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const years = useMemo(() => Array.from(new Set(data.map(d => d.anio))).sort(), [data]);
  const areas = useMemo(() => Array.from(new Set(data.map(d => d.area))).sort(), [data]);

  const yearColors = useMemo(() => {
    const map: Record<string, string> = {};
    years.forEach((y, i) => map[y] = COLORS[i % COLORS.length]);
    return map;
  }, [years]);

  const filteredData = useMemo(() => {
    return data.filter(d => selectedYears.includes(d.anio) && (filterArea === 'Todas' || d.area === filterArea));
  }, [data, selectedYears, filterArea]);

  // Chart 1: Evolución Histórica (Total de todos los años, sin filtro de año, pero sí de área)
  const chartEvolucion = useMemo(() => {
    const grouped = data.filter(d => filterArea === 'Todas' || d.area === filterArea).reduce((acc, curr) => {
      if (!acc[curr.anio]) acc[curr.anio] = 0;
      acc[curr.anio] += curr.cantidad;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(grouped).map(([anio, total]) => ({ anio, total })).sort((a, b) => a.anio.localeCompare(b.anio));
  }, [data, filterArea]);

  // Chart 2: Distribución por Área (Cruzado por años seleccionados, ignora filtro de área)
  const chartAreas = useMemo(() => {
    const areaMap: Record<string, any> = {};
    data.filter(d => selectedYears.includes(d.anio)).forEach(d => {
      if (!areaMap[d.area]) areaMap[d.area] = { name: `Área ${d.area}` };
      areaMap[d.area][d.anio] = (areaMap[d.area][d.anio] || 0) + d.cantidad;
    });
    return Object.values(areaMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, selectedYears]);

  // Chart 3: Evolución por Escuelas (Cruzado por años seleccionados, respeta filtro de área)
  const chartEscuelas = useMemo(() => {
    const escMap: Record<string, any> = {};
    filteredData.forEach(d => {
      if (!escMap[d.escuela]) escMap[d.escuela] = { name: d.escuela };
      escMap[d.escuela][d.anio] = (escMap[d.escuela][d.anio] || 0) + d.cantidad;
    });
    return Object.values(escMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredData]);

  const escuelasChartHeight = Math.max(400, chartEscuelas.length * 45);

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mb-4"></div>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Procesando datos...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="size-10 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-center transition-all">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">bar_chart</span>
              Dashboard de Vacantes
            </h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Análisis cruzado por Áreas y Escuelas
            </p>
          </div>
        </div>
        
        <div className="flex gap-3 items-center">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsYearsDropdownOpen(!isYearsDropdownOpen)}
              className="h-10 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-700 outline-none hover:border-emerald-500 flex items-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-[16px] text-slate-400">calendar_month</span>
              <span>Años ({selectedYears.length})</span>
              <span className="material-symbols-outlined text-[18px]">expand_more</span>
            </button>
            {isYearsDropdownOpen && (
              <div className="absolute top-full mt-2 right-0 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2 flex flex-col gap-1">
                <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-400">Seleccionar Años</span>
                  <button 
                    onClick={() => setSelectedYears(selectedYears.length === years.length ? [] : [...years])}
                    className="text-[9px] font-bold text-emerald-600 hover:underline"
                  >
                    {selectedYears.length === years.length ? 'Ninguno' : 'Todos'}
                  </button>
                </div>
                {years.map(y => (
                  <label key={y} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedYears.includes(y)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedYears([...selectedYears, y].sort());
                        } else {
                          setSelectedYears(selectedYears.filter(year => year !== y));
                        }
                      }}
                      className="size-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">{y}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <select 
            value={filterArea} 
            onChange={e => setFilterArea(e.target.value)}
            className="h-10 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
          >
            <option value="Todas">Todas las Áreas</option>
            {areas.map(a => <option key={a} value={a}>Área {a}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* KPI 1 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex items-center gap-4">
            <div className="size-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">groups</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Vacantes (Selección)</p>
              <p className="text-3xl font-black text-slate-900">{filteredData.reduce((sum, d) => sum + d.cantidad, 0).toLocaleString()}</p>
            </div>
          </div>
          {/* KPI 2 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex items-center gap-4">
            <div className="size-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">analytics</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Promedio Anual</p>
              <p className="text-3xl font-black text-slate-900">
                {selectedYears.length > 0 ? Math.round(filteredData.reduce((sum, d) => sum + d.cantidad, 0) / selectedYears.length).toLocaleString() : 0}
              </p>
            </div>
          </div>
          {/* KPI 3 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex items-center gap-4">
            <div className="size-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">school</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escuelas Involucradas</p>
              <p className="text-3xl font-black text-slate-900">{new Set(filteredData.filter(d => d.cantidad > 0).map(d => d.escuela)).size}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Chart 1 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-black text-slate-900 uppercase tracking-tight mb-6">Evolución Histórica General</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartEvolucion}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="anio" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="total" name="Total Vacantes" stroke="#10b981" strokeWidth={4} dot={{ r: 6, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-black text-slate-900 uppercase tracking-tight mb-6">Distribución por Área (Comparativa)</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartAreas}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }} />
                  {selectedYears.map(year => (
                    <Bar key={year} dataKey={year} name={year} fill={yearColors[year]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Chart 3: Escuelas */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-slate-900 uppercase tracking-tight">Evolución por Escuelas Profesionales</h3>
            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
              {filterArea === 'Todas' ? 'Todas las Áreas' : `Área ${filterArea}`}
            </span>
          </div>
          
          {chartEscuelas.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400 font-bold text-sm">
              No hay datos para mostrar con los filtros actuales.
            </div>
          ) : (
            <div style={{ height: escuelasChartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartEscuelas} layout="vertical" margin={{ left: 180, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#475569', fontWeight: 700 }} width={170} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }} />
                  {selectedYears.map(year => (
                    <Bar key={year} dataKey={year} name={year} fill={yearColors[year]} radius={[0, 4, 4, 0]} barSize={12} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
