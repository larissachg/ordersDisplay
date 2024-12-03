import { useState, useEffect } from "react";

const useWindowDimensions = () => {
  const [windowDimensions, setWindowDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    // Llama a handleResize al cargar el componente
    handleResize();

    // Escucha los cambios de tamaño de la ventana
    window.addEventListener("resize", handleResize);

    // Limpia el listener cuando el componente se desmonta
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowDimensions;
};

export default useWindowDimensions;
