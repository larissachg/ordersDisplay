import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mssql debe quedar fuera del bundle: si Next lo empaqueta, cada ruta
  // recibe su propia instancia del modulo y los tipos (sql.VarChar, etc.)
  // dejan de coincidir por identidad con los del pool compartido (EPARAM).
  serverExternalPackages: ["mssql"],
  // output: "standalone",
};

export default nextConfig;
