export interface OrdenDb {
  id: number; // Columna 'Id'
  mesa: string; // Columna 'mesa'
  mesero: string; // Columna 'mesero'
  tipoEnvio: string | null; // Columna 'tipoEnvio', puede ser null
  paraLlevar: string | null; // Columna 'paraLlevar', puede ser null
  producto: string; // Columna 'producto'
  orden: number; // Columna 'orden'
  cantidad: number; // Columna 'cantidad'
  hora: string; // Columna 'hora' (formato ISO string)
  borrada: number; // Columna 'borrada' (asumo que es un boolean representado como 0 o 1)
  observacion: string | null; // Columna 'observacion', puede ser null
  productosCombo: string | null;
  detalleCuentaId: number; // Columna 'detalleCuentaId'
  terminado?: null | string;
  newOrder: number;
}

export interface Orden {
  id: number;
  mesa: string;
  mesero: string;
  tipoEnvio: string | null;
  paraLlevar: string | null;
  orden: number; // Columna 'orden'
  hora: string; // Columna 'hora' (formato ISO string)
  terminado?: null | string;
  newOrder: number;
  productos: Producto[];
}

export interface Producto {
  producto: string; // Columna 'producto'
  cantidad: number; // Columna 'cantidad'
  borrada: number; // Columna 'borrada' (asumo que es un boolean representado como 0 o 1)
  observacion: string | null; // Columna 'observacion', puede ser null

  detalleCuentaId: number; // Columna 'detalleCuentaId'
  terminado: string | null; // Columna 'terminado'

  combos: ProductoCombo[];
}

export interface ProductoCombo {
  descripcion: string | null;
  cantidad: number;
}
