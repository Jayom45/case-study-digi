// Error toasts. Shows the backend request_id so a problem can be traced to exact log lines.
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { onApiError } from "../api";

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, type: "error", ...toast }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  useEffect(() => {
    onApiError((err) => push({ type: "error", message: err.message, requestId: err.requestId }));
  }, [push]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-96 flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}
              className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
              {t.type === "error" ? <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
                : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-slate-700">{t.message}</p>
                {t.requestId && <p className="mt-1 font-mono text-xs text-slate-400">request id: {t.requestId}</p>}
              </div>
              <button onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
