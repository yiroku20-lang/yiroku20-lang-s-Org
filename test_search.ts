import { supabase } from './lib/supabaseClient';

async function main() {
  const { data, error } = await supabase.from('colegios').select('nombre_ie, codigo_modular, lugar').ilike('nombre_ie', '%SA%').limit(10);
  console.log("Colegios:", data, error);

  const { data: uData, error: uError } = await supabase.from('ubigeos').select('distrito, provincia, departamento').ilike('distrito', '%CUS%').limit(10);
  console.log("Ubigeos:", uData, uError);
}
main();
