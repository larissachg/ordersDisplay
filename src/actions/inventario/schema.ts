import { getPool } from '../db'

// Igual enfoque que KDS_Snooze: el KDS crea sus propias tablas al primer uso.
// Sin FKs fisicas hacia tablas POS (estilo de la BD del POS).
let creadas = false

export async function ensureTablasConteo(): Promise<void> {
  if (creadas) return
  const pool = await getPool()
  await pool.request().query(`
    IF OBJECT_ID('KDS_Conteos', 'U') IS NULL
    CREATE TABLE KDS_Conteos (
      ConteoID int IDENTITY(1,1) PRIMARY KEY,
      AlmacenID int NOT NULL,
      NoVendibles bit NOT NULL,
      Estado varchar(10) NOT NULL,
      MeseroID int NOT NULL,
      Observacion varchar(500) NULL,
      FechaCreacion datetime NOT NULL,
      FechaAplicacion datetime NULL,
      AplicadoPorMeseroID int NULL,
      FechaAnulacion datetime NULL,
      AnuladoPorMeseroID int NULL,
      AjusteID int NULL
    );
    IF OBJECT_ID('KDS_ConteoDetalles', 'U') IS NULL
    CREATE TABLE KDS_ConteoDetalles (
      ConteoDetalleID int IDENTITY(1,1) PRIMARY KEY,
      ConteoID int NOT NULL,
      ProductoID int NOT NULL,
      CantidadContada float NOT NULL,
      StockSnapshot float NOT NULL,
      FechaConteo datetime NOT NULL,
      Observacion varchar(500) NULL,
      CONSTRAINT UQ_KDS_ConteoDetalles UNIQUE (ConteoID, ProductoID)
    );
    -- Copiado = la cantidad viene de un conteo anterior y nadie la reconto aun.
    -- ALTER aparte: la tabla puede existir de una version previa del modulo.
    IF COL_LENGTH('KDS_ConteoDetalles', 'Copiado') IS NULL
    ALTER TABLE KDS_ConteoDetalles ADD Copiado bit NOT NULL CONSTRAINT DF_KDS_ConteoDetalles_Copiado DEFAULT 0;
  `)
  creadas = true
}
