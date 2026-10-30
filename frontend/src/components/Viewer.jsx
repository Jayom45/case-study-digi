// "Viewing as": who the user is pretending to be. Remembered in localStorage (demo app, no login).
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";

const ViewerContext = createContext(null);
export const useViewer = () => useContext(ViewerContext);

export function ViewerProvider({ children }) {
  const [people, setPeople] = useState([]);
  const [viewerId, setViewerId] = useState(() => Number(localStorage.getItem("viewerId")) || null);

  useEffect(() => {
    api.get("/people").then(setPeople).catch(() => {});
  }, []);

  const setViewer = (id) => {
    setViewerId(id);
    if (id) localStorage.setItem("viewerId", id);
    else localStorage.removeItem("viewerId");
  };

  const viewer = people.find((p) => p.id === viewerId) || null;
  return <ViewerContext.Provider value={{ people, viewer, setViewer }}>{children}</ViewerContext.Provider>;
}
