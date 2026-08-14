import sql from "mssql";

const dbConfig: sql.config = {
  user: process.env.DB_USER || "",
  password: process.env.DB_PASSWORD || "",
  server: process.env.DB_SERVER || "",
  port: parseInt(process.env.DB_PORT || "1433", 10),
  database: process.env.DB_DATABASE || "",
  options: {
    encrypt: false, // Cambiar a true si usas Azure
    trustServerCertificate: true, // Para entornos locales
    useUTC: false,
  },
};

// Cacheado en globalThis para sobrevivir los hot-reloads de Next.js en dev
// sin acumular pools abiertos.
const globalForDb = globalThis as typeof globalThis & {
  _kdsPool?: sql.ConnectionPool;
  _kdsPoolPromise?: Promise<sql.ConnectionPool>;
};

async function getPool(): Promise<sql.ConnectionPool> {
  const cached = globalForDb._kdsPool;
  if (cached?.connected) return cached;

  if (cached) {
    // La conexión se cayó después de conectar: descartar y reconectar
    globalForDb._kdsPool = undefined;
    globalForDb._kdsPoolPromise = undefined;
    cached.close().catch(() => {});
  }

  if (!globalForDb._kdsPoolPromise) {
    globalForDb._kdsPoolPromise = new sql.ConnectionPool(dbConfig)
      .connect()
      .then((pool) => {
        pool.on("error", (err) => {
          console.error("Error en el pool de SQL Server:", err);
        });
        globalForDb._kdsPool = pool;
        console.log("Conexión a SQL Server exitosa");
        return pool;
      })
      .catch((err) => {
        // No cachear el rechazo: el siguiente request reintenta conectar
        globalForDb._kdsPoolPromise = undefined;
        console.error("Error en la conexión a SQL Server:", err);
        throw err;
      });
  }

  return globalForDb._kdsPoolPromise;
}

export { sql, getPool };
