import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, InventoryItem, LoanRecord } from '../types';
import * as XLSX from 'xlsx';
import Barcode from 'react-barcode';
import { useReactToPrint } from 'react-to-print';

interface LoansProps {
  user: User;
  notify: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const Loans: React.FC<LoansProps> = ({ user, notify }) => {
  const [activeTab, setActiveTab] = useState<'prestamos' | 'inventario'>('prestamos');
  
  // Inventario State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({ codigo_barras: '', nombre_bien: '', descripcion_estado: '' });
  const [searchInventoryQuery, setSearchInventoryQuery] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState<'Todos' | 'Disponible' | 'Prestado' | 'En Mantenimiento'>('Todos');
  const printComponentRef = useRef<HTMLDivElement>(null);
  
  // Préstamos State
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanFilter, setLoanFilter] = useState<'Todos' | 'Activo' | 'Vencido' | 'Devuelto'>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  
  // New Loan Form State
  const [newLoan, setNewLoan] = useState({
    bienes_seleccionados: [] as InventoryItem[],
    prestatario_dni: '',
    prestatario_nombre: '',
    prestatario_correo: '',
    prestatario_celular: '',
    fecha_limite: ''
  });
  
  // Person Search State for Autocomplete
  const [personSearchResults, setPersonSearchResults] = useState<any[]>([]);
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [selectedPersonFromDropdown, setSelectedPersonFromDropdown] = useState(false);

  useEffect(() => {
    const searchPerson = async () => {
      // Don't search if we just selected from dropdown
      if (selectedPersonFromDropdown) {
        setSelectedPersonFromDropdown(false);
        return;
      }
      if (newLoan.prestatario_nombre.length < 3) {
        setPersonSearchResults([]);
        setShowPersonDropdown(false);
        return;
      }
      
      const { data } = await supabase
        .from('personal_directorio')
        .select('*')
        .ilike('nombre', `%${newLoan.prestatario_nombre}%`)
        .limit(10);
      
      if (data && data.length > 0) {
        setPersonSearchResults(data);
        setShowPersonDropdown(true);
      } else {
        setShowPersonDropdown(false);
      }
    };

    const debounceId = setTimeout(searchPerson, 300);
    return () => clearTimeout(debounceId);
  }, [newLoan.prestatario_nombre, selectedPersonFromDropdown]);
  
  // Custom dropdown state for inventory search
  const [searchBienTerm, setSearchBienTerm] = useState('');
  const [showBienDropdown, setShowBienDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Signature State (Basic Canvas)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Email API State
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory();
    fetchLoans();
  }, []); // Load both on mount
  
  useEffect(() => {
    // Also re-fetch selectively if tab changes, just to keep it fresh
    if (activeTab === 'inventario') fetchInventory();
    else fetchLoans();
  }, [activeTab]);

  // Handle clicking outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowBienDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchInventory = async () => {
    setLoadingInventory(true);
    try {
      const { data, error } = await supabase.from('inventario_bienes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setInventory(data || []);
    } catch (error: any) {
      notify(`Error cargando inventario: ${error.message}`, 'error');
    } finally {
      setLoadingInventory(false);
    }
  };

  const fetchLoans = async () => {
    setLoadingLoans(true);
    try {
      const { data, error } = await supabase
        .from('prestamos')
        .select('*, inventario_bienes(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Auto-update status to Vencido if past due date and still Activo
      const now = new Date();
      let updatedData = data || [];
      let needsUpdate = false;
      
      updatedData = updatedData.map(loan => {
        if (loan.estado_prestamo === 'Activo' && new Date(loan.fecha_limite) < now) {
          needsUpdate = true;
          // We don't await here to not block UI, we'll do a background update
          supabase.from('prestamos').update({ estado_prestamo: 'Vencido' }).eq('id', loan.id).then();
          return { ...loan, estado_prestamo: 'Vencido' };
        }
        return loan;
      });

      setLoans(updatedData);
    } catch (error: any) {
      notify(`Error cargando préstamos: ${error.message}`, 'error');
    } finally {
      setLoadingLoans(false);
    }
  };

  const handleCreateInventoryItem = async () => {
    if (!newItem.codigo_barras || !newItem.nombre_bien) return;
    try {
      const { error } = await supabase.from('inventario_bienes').insert([{
        ...newItem,
        estado_actual: 'Disponible'
      }]);
      if (error) throw error;
      notify('Bien registrado correctamente');
      setIsInventoryModalOpen(false);
      setNewItem({ codigo_barras: '', nombre_bien: '', descripcion_estado: '' });
      fetchInventory();
    } catch (error: any) {
      notify(`Error: ${error.message}`, 'error');
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!hasSignature) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleCreateLoan = async () => {
    if (newLoan.bienes_seleccionados.length === 0 || !newLoan.prestatario_dni || !newLoan.prestatario_nombre || !newLoan.fecha_limite) {
      notify('Por favor complete los campos obligatorios y seleccione al menos un bien', 'warning');
      return;
    }

    try {
      let firmaUrl = null;
      
      // Upload signature if exists
      if (hasSignature && canvasRef.current) {
        const blob = await new Promise<Blob | null>(resolve => canvasRef.current?.toBlob(resolve, 'image/png'));
        if (blob) {
          const fileName = `firma_${Date.now()}.png`;
          const { error: uploadError } = await supabase.storage
            .from('documentos')
            .upload(`firmas/${fileName}`, blob);
            
          if (!uploadError) {
            const { data } = supabase.storage.from('documentos').getPublicUrl(`firmas/${fileName}`);
            firmaUrl = data.publicUrl;
          }
        }
      }

      // Create Loans
      const loansToInsert = newLoan.bienes_seleccionados.map(bien => ({
        bien_id: bien.id,
        prestatario_dni: newLoan.prestatario_dni,
        prestatario_nombre: newLoan.prestatario_nombre,
        prestatario_correo: newLoan.prestatario_correo || null,
        prestatario_celular: newLoan.prestatario_celular || null,
        fecha_limite: newLoan.fecha_limite,
        estado_prestamo: 'Activo',
        firma_url: firmaUrl,
        usuario_entrega: user.name
      }));

      const { error: loanError } = await supabase.from('prestamos').insert(loansToInsert);
      if (loanError) throw loanError;

      // Actualizar o insertar en el directorio
      const { data: existingPerson } = await supabase.from('personal_directorio').select('*').eq('dni', newLoan.prestatario_dni).maybeSingle();
      if (existingPerson) {
         if ((newLoan.prestatario_correo && !existingPerson.correo) || (newLoan.prestatario_celular && !existingPerson.telefono)) {
             await supabase.from('personal_directorio').update({
                 correo: newLoan.prestatario_correo || existingPerson.correo,
                 telefono: newLoan.prestatario_celular || existingPerson.telefono
             }).eq('dni', newLoan.prestatario_dni);
         }
      } else {
         await supabase.from('personal_directorio').insert([{
             dni: newLoan.prestatario_dni,
             nombre: newLoan.prestatario_nombre,
             correo: newLoan.prestatario_correo || null,
             telefono: newLoan.prestatario_celular || null
         }]);
      }

      // Update Inventory Status
      const { error: invError } = await supabase.from('inventario_bienes')
          .update({ estado_actual: 'Prestado' })
          .in('id', newLoan.bienes_seleccionados.map(b => b.id));
      if (invError) throw invError;

      notify('Préstamos registrados correctamente');
      setIsLoanModalOpen(false);
      setNewLoan({ bienes_seleccionados: [], prestatario_dni: '', prestatario_nombre: '', prestatario_correo: '', prestatario_celular: '', fecha_limite: '' });
      setSearchBienTerm('');
      clearSignature();
      fetchLoans();
    } catch (error: any) {
      notify(`Error: ${error.message}`, 'error');
    }
  };

  const handleReceive = async (loanId: string, bienId: string) => {
    // Confirmación nativa sin window.confirm para entornos iframe
    // Aquí podemos omitir el window.confirm y hacer la acción directa
    // ya que en iframes puede bloquearse
    try {
      const { error: err1 } = await supabase.from('prestamos').update({
        estado_prestamo: 'Devuelto',
        fecha_recepcion: new Date().toISOString(),
        usuario_recepcion: user.name
      }).eq('id', loanId);
      if (err1) throw err1;

      const { error: err2 } = await supabase.from('inventario_bienes').update({ estado_actual: 'Disponible' }).eq('id', bienId);
      if (err2) throw err2;

      notify('Bien recepcionado correctamente');
      fetchLoans();
    } catch (error: any) {
      notify(`Error: ${error.message}`, 'error');
    }
  };

  const handleSendEmail = async (items: LoanRecord[]) => {
    const first = items[0];
    if (!first.prestatario_correo) {
      notify('El prestatario no tiene un correo registrado', 'warning');
      return;
    }
    
    setSendingEmailId(first.id);
    try {
      const bienesList = items.map(i => `- ${i.inventario_bienes?.nombre_bien || 'Bien sin nombre'} (Cod: ${i.inventario_bienes?.codigo_barras || i.bien_id})`).join('\n');
      const safeFechaLimite = (first.fecha_limite.includes('T') ? first.fecha_limite.split('T')[0] : first.fecha_limite) + 'T12:00:00';

      const payload = {
        to: first.prestatario_correo,
        subject: 'Recordatorio de Devolución de Bienes - UNSAAC',
        text: `Hola ${first.prestatario_nombre},\n\nTe escribimos de la Oficina de Admisión UNSAAC para recordarte la devolución de los bienes prestados:\n\n${bienesList}\n\nFecha Límite: ${new Date(safeFechaLimite).toLocaleDateString()}\n\nPor favor, acércate a la oficina a la brevedad posible para regularizar el estado de tu préstamo y devolver los bienes.\n\nSaludos cordiales,\nSistema de Admisión UNSAAC`
      };

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falló la conexión con el endpoint de correo.');
      }

      notify('Correo enviado exitosamente de forma directa', 'success');
    } catch (err: any) {
      notify('No se pudo enviar el correo: ' + err.message, 'error');
    } finally {
      setSendingEmailId(null);
    }
  };

  const filteredLoans = loans.filter(loan => {
    const matchesFilter = loanFilter === 'Todos' || loan.estado_prestamo === loanFilter;
    const matchesSearch = 
      loan.prestatario_nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loan.prestatario_dni.includes(searchQuery) ||
      loan.inventario_bienes?.nombre_bien.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredInventory = inventory.filter(item => {
    const matchesFilter = inventoryFilter === 'Todos' || item.estado_actual === inventoryFilter;
    const matchesSearch = 
      item.nombre_bien.toLowerCase().includes(searchInventoryQuery.toLowerCase()) ||
      item.codigo_barras.toLowerCase().includes(searchInventoryQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleExportExcel = () => {
    if (filteredInventory.length === 0) {
      notify('No hay bienes para exportar', 'warning');
      return;
    }
    const wsData = filteredInventory.map(item => ({
      'Código de Barras': item.codigo_barras,
      'Nombre del Bien': item.nombre_bien,
      'Descripción / Estado': item.descripcion_estado || '-',
      'Estado Actual': item.estado_actual
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, "Inventario_Bienes.xlsx");
  };

  const handlePrintBarcodes = useReactToPrint({
    contentRef: printComponentRef,
    documentTitle: 'Codigos_de_Barras_Inventario',
  });

  return (
    <div className="w-full max-w-[1500px] mx-auto flex flex-col gap-6 p-4 md:p-8 h-full overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter">Préstamo de Bienes</h1>
          <p className="text-slate-500 text-xs md:text-sm font-medium mt-1">Control de inventario y préstamos de oficina</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('prestamos')}
            className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'prestamos' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Préstamos
          </button>
          <button 
            onClick={() => setActiveTab('inventario')}
            className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'inventario' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Inventario
          </button>
        </div>
      </div>

      {activeTab === 'prestamos' ? (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="flex flex-col md:flex-row gap-4 justify-between shrink-0">
            <div className="flex gap-2 bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {['Todos', 'Activo', 'Vencido', 'Devuelto'].map(f => (
                <button 
                  key={f}
                  onClick={() => setLoanFilter(f as any)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${loanFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            
            <div className="flex gap-3">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                  type="text" 
                  placeholder="Buscar persona o bien..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-10 pl-10 pr-4 rounded-xl border border-slate-200 text-sm focus:border-primary outline-none w-full md:w-64"
                />
              </div>
              <button 
                onClick={() => setIsLoanModalOpen(true)}
                className="h-10 px-6 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Nuevo Préstamo
              </button>
            </div>
          </div>

          <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col p-6">
            <div className="overflow-y-auto flex-1 pr-2 space-y-6">
              {loadingLoans ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-3 animate-spin">refresh</span>
                  <p className="font-bold text-sm">Cargando préstamos...</p>
                </div>
              ) : filteredLoans.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-3">inbox</span>
                  <p className="font-bold text-sm">No hay préstamos registrados.</p>
                </div>
              ) : (
                (Object.entries(
                  filteredLoans.reduce((acc, loan) => {
                    const gKey = `${loan.prestatario_dni}_${loan.fecha_salida.substring(0, 16)}`;
                    if (!acc[gKey]) acc[gKey] = [];
                    acc[gKey].push(loan);
                    return acc;
                  }, {} as Record<string, LoanRecord[]>)
                ) as [string, LoanRecord[]][]).map(([key, items]) => {
                  const first = items[0];
                  const hasVencido = items.some(i => i.estado_prestamo === 'Vencido');
                  const hasActivo = items.some(i => i.estado_prestamo === 'Activo');
                  const groupStatus = hasVencido ? 'Vencido' : hasActivo ? 'Activo' : 'Devuelto';

                  return (
                    <div key={key} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      {/* Cabecera del Grupo */}
                      <div className="bg-slate-50/50 p-5 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                          <h4 className="font-black text-slate-900 text-base">{first.prestatario_nombre}</h4>
                          <p className="text-xs text-slate-500 font-bold tracking-wide mt-1">
                            {first.prestatario_dni} {first.prestatario_celular ? `• ${first.prestatario_celular}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-6">
                          <div className="text-right">
                            <p className="text-xs text-slate-600"><span className="font-bold">Salida:</span> {new Date(first.fecha_salida).toLocaleDateString()}</p>
                            <p className="text-xs text-slate-600"><span className="font-bold text-red-500">Límite:</span> {new Date((first.fecha_limite.includes('T') ? first.fecha_limite.split('T')[0] : first.fecha_limite) + 'T12:00:00').toLocaleDateString()}</p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                              groupStatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' :
                              groupStatus === 'Vencido' ? 'bg-red-100 text-red-700 animate-pulse' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {groupStatus}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                            {first.prestatario_celular && (
                              <a 
                                href={`https://wa.me/51${first.prestatario_celular}?text=Hola ${first.prestatario_nombre}, te escribimos de la oficina para recordarte la devolución de los bienes prestados el ${new Date(first.fecha_salida).toLocaleDateString()}.`}
                                target="_blank" rel="noopener noreferrer"
                                className="size-9 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center transition-colors"
                                title="Enviar mensaje por WhatsApp"
                              >
                                <span className="material-symbols-outlined text-sm">chat</span>
                              </a>
                            )}
                            {first.prestatario_correo && (
                              <button 
                                onClick={() => handleSendEmail(items)}
                                disabled={sendingEmailId === first.id}
                                className={`size-9 rounded-xl flex items-center justify-center transition-colors ${sendingEmailId === first.id ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                title="Recordatorio por Correo"
                              >
                                {sendingEmailId === first.id ? (
                                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                ) : (
                                  <span className="material-symbols-outlined text-sm">mail</span>
                                )}
                              </button>
                            )}
                            {first.firma_url && (
                              <a href={first.firma_url} target="_blank" rel="noopener noreferrer" className="size-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors" title="Ver Firma">
                                <span className="material-symbols-outlined text-sm">draw</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Lista de Bienes */}
                      <div className="bg-white divide-y divide-slate-100">
                        {items.map(loan => (
                          <div key={loan.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className={`w-1.5 h-8 rounded-full ${loan.estado_prestamo === 'Devuelto' ? 'bg-slate-200' : 'bg-primary'}`}></div>
                              <div>
                                <p className={`font-bold text-sm ${loan.estado_prestamo === 'Devuelto' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{loan.inventario_bienes?.nombre_bien}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{loan.inventario_bienes?.codigo_barras}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                              {loan.estado_prestamo === 'Devuelto' ? (
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                                  <span className="text-xs font-bold text-slate-500">Devuelto el {new Date(loan.fecha_recepcion || '').toLocaleDateString()}</span>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => handleReceive(loan.id, loan.bien_id)}
                                  className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2"
                                  title="Registrar Recepción de este Bien"
                                >
                                  <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                                  Recepcionar
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="flex flex-col md:flex-row gap-4 justify-between shrink-0">
            <div className="flex gap-2 bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {['Todos', 'Disponible', 'Prestado', 'En Mantenimiento'].map(f => (
                <button 
                  key={f}
                  onClick={() => setInventoryFilter(f as any)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${inventoryFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            
            <div className="flex gap-3 overflow-x-auto">
              <div className="relative min-w-[200px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                  type="text" 
                  placeholder="Buscar bien..." 
                  value={searchInventoryQuery}
                  onChange={e => setSearchInventoryQuery(e.target.value)}
                  className="h-10 pl-10 pr-4 rounded-xl border border-slate-200 text-sm focus:border-primary outline-none w-full md:w-64"
                />
              </div>
              
              <button 
                onClick={() => handlePrintBarcodes()}
                disabled={filteredInventory.length === 0}
                className="h-10 px-4 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                title="Generar PDF con Código de Barras"
              >
                <span className="material-symbols-outlined text-sm">print</span>
              </button>

              <button 
                onClick={handleExportExcel}
                disabled={filteredInventory.length === 0}
                className="h-10 px-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar Filtrados a Excel"
              >
                <span className="material-symbols-outlined text-sm">table_view</span>
              </button>

              <button 
                onClick={() => setIsInventoryModalOpen(true)}
                className="h-10 px-6 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Registrar Bien
              </button>
            </div>
          </div>

          <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Código de Barras</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del Bien</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción / Estado</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingInventory ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">Cargando inventario...</td></tr>
                  ) : filteredInventory.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">No hay bienes que coincidan.</td></tr>
                  ) : filteredInventory.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-600">{item.codigo_barras}</td>
                      <td className="px-6 py-4 font-bold text-slate-900 text-sm">{item.nombre_bien}</td>
                      <td className="px-6 py-4 text-xs text-slate-500">{item.descripcion_estado || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                          item.estado_actual === 'Disponible' ? 'bg-emerald-100 text-emerald-700' :
                          item.estado_actual === 'Prestado' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {item.estado_actual}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO BIEN */}
      {isInventoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl mb-6">Registrar Nuevo Bien</h3>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase">Código de Barras *</span>
                <input value={newItem.codigo_barras} onChange={e => setNewItem({...newItem, codigo_barras: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase">Nombre del Bien *</span>
                <input value={newItem.nombre_bien} onChange={e => setNewItem({...newItem, nombre_bien: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase">Descripción / Observaciones</span>
                <textarea value={newItem.descripcion_estado} onChange={e => setNewItem({...newItem, descripcion_estado: e.target.value})} className="h-24 p-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm outline-none focus:border-primary resize-none" />
              </label>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsInventoryModalOpen(false)} className="flex-1 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600">Cancelar</button>
              <button onClick={handleCreateInventoryItem} className="flex-[2] h-12 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-slate-800">Guardar Bien</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO PRÉSTAMO */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl mb-6">Registrar Préstamo</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-black text-primary uppercase tracking-widest border-b pb-2">1. Seleccionar Bienes</h4>
                <label className="flex flex-col gap-1 relative" ref={dropdownRef}>
                  <span className="text-[10px] font-black text-slate-500 uppercase">Buscar Bien (puede seleccionar varios) *</span>
                  <input 
                    type="text"
                    value={searchBienTerm}
                    onChange={e => {
                      setSearchBienTerm(e.target.value);
                      setShowBienDropdown(true);
                    }}
                    onFocus={() => setShowBienDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const matches = inventory.filter(i => 
                          i.estado_actual === 'Disponible' && 
                          !loans.some(l => l.bien_id === i.id && l.estado_prestamo !== 'Devuelto') &&
                          !newLoan.bienes_seleccionados.find(b => b.id === i.id) &&
                          (i.nombre_bien.toLowerCase().includes(searchBienTerm.toLowerCase()) || i.codigo_barras.includes(searchBienTerm))
                        );
                        if (matches.length === 1) {
                          setNewLoan({...newLoan, bienes_seleccionados: [...newLoan.bienes_seleccionados, matches[0]]});
                          setSearchBienTerm('');
                          setShowBienDropdown(false);
                        }
                      }
                    }}
                    placeholder="Escanear código o buscar nombre..."
                    className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary"
                  />
                  {showBienDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl max-h-52 overflow-y-auto rounded-xl z-50 animate-in fade-in">
                      {inventory.filter(i => 
                        i.estado_actual === 'Disponible' && 
                        !loans.some(l => l.bien_id === i.id && l.estado_prestamo !== 'Devuelto') &&
                        !newLoan.bienes_seleccionados.find(b => b.id === i.id) &&
                        (i.nombre_bien.toLowerCase().includes(searchBienTerm.toLowerCase()) || i.codigo_barras.includes(searchBienTerm))
                      ).length === 0 ? (
                         <div className="p-4 text-xs text-slate-500 text-center font-bold">No hay bienes listos con ese código o nombre.</div>
                      ) : (
                        inventory
                          .filter(i => 
                            i.estado_actual === 'Disponible' && 
                            !loans.some(l => l.bien_id === i.id && l.estado_prestamo !== 'Devuelto') &&
                            !newLoan.bienes_seleccionados.find(b => b.id === i.id) &&
                            (i.nombre_bien.toLowerCase().includes(searchBienTerm.toLowerCase()) || i.codigo_barras.includes(searchBienTerm))
                          )
                          .map(item => (
                          <div 
                            key={item.id}
                            onClick={() => {
                              setNewLoan({...newLoan, bienes_seleccionados: [...newLoan.bienes_seleccionados, item]});
                              setSearchBienTerm('');
                              setShowBienDropdown(false);
                            }}
                            className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                          >
                            <p className="text-sm font-bold text-slate-900">{item.nombre_bien}</p>
                            <p className="text-[10px] font-mono text-primary bg-primary/10 inline-block px-1 rounded mt-0.5">{item.codigo_barras}</p>
                          </div>
                          ))
                      )}
                    </div>
                  )}
                </label>

                {newLoan.bienes_seleccionados.length > 0 && (
                  <div className="flex flex-col gap-2">
                     <span className="text-[10px] font-black text-slate-500 uppercase">Bienes Seleccionados ({newLoan.bienes_seleccionados.length})</span>
                     <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-1">
                        {newLoan.bienes_seleccionados.map((item, idx) => (
                           <div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                              <div>
                                <p className="text-xs font-bold text-slate-900 leading-tight">{item.nombre_bien}</p>
                                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest leading-none mt-0.5">{item.codigo_barras}</p>
                              </div>
                              <button 
                                onClick={() => {
                                  const newList = newLoan.bienes_seleccionados.filter(b => b.id !== item.id);
                                  setNewLoan({...newLoan, bienes_seleccionados: newList});
                                }}
                                className="size-6 bg-red-50 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-100 shrink-0"
                              >
                                <span className="material-symbols-outlined text-[14px]">close</span>
                              </button>
                           </div>
                        ))}
                     </div>
                  </div>
                )}

                <label className="flex flex-col gap-1 mt-auto pt-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Fecha Límite de Devolución *</span>
                  <input type="date" value={newLoan.fecha_limite} onChange={e => setNewLoan({...newLoan, fecha_limite: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
                </label>
              </div>

              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-black text-primary uppercase tracking-widest border-b pb-2">2. Datos del Prestatario</h4>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">DNI *</span>
                    <input value={newLoan.prestatario_dni} onChange={e => setNewLoan({...newLoan, prestatario_dni: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">Celular</span>
                    <input value={newLoan.prestatario_celular} onChange={e => setNewLoan({...newLoan, prestatario_celular: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
                  </label>
                </div>
                <label className="flex flex-col gap-1 relative">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Nombre Completo *</span>
                  <input 
                    value={newLoan.prestatario_nombre} 
                    onChange={e => {
                        setSelectedPersonFromDropdown(false);
                        setNewLoan({...newLoan, prestatario_nombre: e.target.value});
                        setShowPersonDropdown(true);
                    }} 
                    onFocus={() => setShowPersonDropdown(true)}
                    onBlur={() => setTimeout(() => setShowPersonDropdown(false), 200)}
                    className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" 
                  />
                  {showPersonDropdown && personSearchResults.length > 0 && (
                      <div className="absolute top-14 left-0 w-full z-[100] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                          {personSearchResults.map(p => (
                              <div key={p.id} 
                                   className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                                   onClick={() => {
                                       setNewLoan({...newLoan, prestatario_nombre: p.nombre, prestatario_dni: p.dni, prestatario_correo: p.correo || '', prestatario_celular: p.telefono || ''});
                                       setSelectedPersonFromDropdown(true);
                                       setShowPersonDropdown(false);
                                   }}
                              >
                                  <div className="font-bold text-slate-900 text-sm">{p.nombre}</div>
                                  <div className="text-[10px] text-slate-500 font-bold">DNI: {p.dni}</div>
                              </div>
                          ))}
                      </div>
                  )}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Correo Electrónico</span>
                  <input type="email" value={newLoan.prestatario_correo} onChange={e => setNewLoan({...newLoan, prestatario_correo: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-primary uppercase tracking-widest">3. Firma Digital (Opcional)</h4>
                {hasSignature && <button onClick={clearSignature} className="text-[10px] font-bold text-red-500 hover:text-red-600">Limpiar Firma</button>}
              </div>
              <div className="border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 overflow-hidden relative h-32">
                <canvas 
                  ref={canvasRef}
                  width={600}
                  height={128}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-full cursor-crosshair touch-none"
                />
                {!hasSignature && <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 text-sm font-bold">Firme aquí</div>}
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button onClick={() => { setIsLoanModalOpen(false); clearSignature(); setSearchBienTerm(''); }} className="flex-1 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600">Cancelar</button>
              <button onClick={handleCreateLoan} className="flex-[2] h-14 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/30 hover:scale-[1.02] transition-all">Registrar Préstamo</button>
            </div>
          </div>
        </div>
      )}

      {/* COMPONENTE OCULTO PARA IMPRESIÓN */}
      <div className="absolute left-[-9999px] top-[-9999px] opacity-0 pointer-events-none" aria-hidden="true">
        <div ref={printComponentRef} style={{ padding: '20px', fontFamily: 'sans-serif' }}>
          <style>{`
            @media print {
              @page { size: A4; margin: 15mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          `}</style>
          
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Etiquetas de Inventario</h2>
            <p style={{ fontSize: '14px', color: '#666' }}>Documento generado para impresión</p>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: '20px', 
            width: '100%' 
          }}>
            {filteredInventory.map(item => (
              <div key={item.id} style={{ 
                border: '1px solid #ccc', 
                padding: '10px', 
                borderRadius: '8px', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                textAlign: 'center',
                pageBreakInside: 'avoid'
              }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', width: '100%' }}>
                  {item.nombre_bien}
                </p>
                <Barcode 
                  value={item.codigo_barras} 
                  height={40} 
                  width={1.2} 
                  fontSize={10} 
                  displayValue={true} 
                  margin={0}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};
