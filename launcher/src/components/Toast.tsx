import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store';

export function Toast() {
  const toast = useStore((s) => s.toast);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            className="flex max-w-sm items-start gap-3 rounded-lg border border-line bg-raise-2 px-4 py-3 text-[14px]"
          >
            <span className={`mt-[7px] size-2 shrink-0 rounded-full ${toast.kind === 'error' ? 'bg-danger' : 'bg-ok'}`} />
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
