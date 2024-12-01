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

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then((pool) => {
    console.log("Conexión a SQL Server exitosa");
    return pool;
  })
  .catch((err) => {
    console.error("Error en la conexión a SQL Server:", err);
    throw err;
  });

export { sql, poolPromise };
