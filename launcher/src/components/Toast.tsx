import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useStore } from '../store';

export function Toast() {
  const toast = useStore((s) => s.toast);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className={`flex max-w-sm items-center gap-2.5 rounded-xl border bg-surface-2 px-4 py-3 text-sm shadow-2xl ${
              toast.kind === 'error' ? 'border-danger/40' : 'border-line'
            }`}
          >
            {toast.kind === 'error' ? <AlertCircle className="size-4 shrink-0 text-danger" /> : <CheckCircle2 className="size-4 shrink-0 text-ok" />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
